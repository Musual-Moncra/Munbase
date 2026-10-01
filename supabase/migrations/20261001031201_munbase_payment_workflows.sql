-- Controlled checkout, SePay reconciliation, refunds, and durable emails.
alter table public.marketplace_settings add column if not exists checkout_enabled boolean not null default false;

create table if not exists private.checkout_test_buyers (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  added_at timestamptz not null default now()
);
revoke all on private.checkout_test_buyers from public, anon, authenticated;
insert into private.checkout_test_buyers(user_id)
select id from public.profiles where role = 'buyer' on conflict do nothing;

alter table public.orders add column if not exists client_request_key uuid,
  add column if not exists request_fingerprint text,
  add column if not exists locale text not null default 'vi';
create unique index if not exists orders_buyer_request_key_uidx on public.orders(buyer_id, client_request_key)
  where client_request_key is not null;

alter table public.payment_events add column if not exists environment text not null default 'live'
  check (environment in ('test', 'live')),
  add column if not exists source text not null default 'webhook' check (source in ('webhook', 'api')),
  add column if not exists bank_reference text,
  add column if not exists transaction_at timestamptz,
  add column if not exists review_status text not null default 'needs_review'
    check (review_status in ('needs_review', 'applied', 'refund_pending', 'refunded', 'ignored')),
  add column if not exists reviewed_by uuid references public.profiles(id),
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_note text;
create unique index if not exists payment_events_bank_reference_uidx
  on public.payment_events(environment, bank_reference) where provider = 'sepay' and bank_reference is not null;

create table if not exists public.payment_allocations (
  id uuid primary key default gen_random_uuid(), payment_event_id uuid not null references public.payment_events(id),
  order_id uuid not null references public.orders(id), amount bigint not null check (amount > 0),
  request_key uuid not null unique, created_by uuid references public.profiles(id), created_at timestamptz not null default now(),
  unique (payment_event_id, order_id)
);
create table if not exists public.payment_refunds (
  id uuid primary key default gen_random_uuid(), payment_event_id uuid not null references public.payment_events(id),
  order_id uuid references public.orders(id), amount bigint not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending', 'refunded')),
  reason text not null check (length(trim(reason)) >= 3), evidence_reference text, refund_reference text,
  request_key uuid not null unique, created_by uuid not null references public.profiles(id),
  refunded_by uuid references public.profiles(id), created_at timestamptz not null default now(), refunded_at timestamptz
);
create table if not exists public.customer_email_outbox (
  id uuid primary key default gen_random_uuid(), event_key text not null unique, recipient text not null,
  locale text not null default 'vi',
  template text not null check (template in ('order_created', 'payment_confirmed', 'shipment_updated', 'order_cancelled')),
  payload jsonb not null default '{}', status text not null default 'pending'
    check (status in ('pending', 'sending', 'sent', 'failed')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 5),
  next_attempt_at timestamptz not null default now(), last_error text, sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists customer_email_outbox_pending_idx
  on public.customer_email_outbox(next_attempt_at, created_at) where status = 'pending';
create table if not exists private.sepay_sync_state (
  environment text primary key check (environment in ('test', 'live')), checkpoint_id uuid,
  lease_token uuid, lease_until timestamptz, last_success_at timestamptz, last_error text
);
revoke all on private.sepay_sync_state from public, anon, authenticated;

alter table public.payment_allocations enable row level security;
alter table public.payment_refunds enable row level security;
alter table public.customer_email_outbox enable row level security;
create policy "admin reads payment allocations" on public.payment_allocations for select to authenticated using (private.is_admin());
create policy "admin reads payment refunds" on public.payment_refunds for select to authenticated using (private.is_admin());
create policy "admin reads email delivery" on public.customer_email_outbox for select to authenticated using (private.is_admin());
revoke all on public.payment_allocations, public.payment_refunds, public.customer_email_outbox from public, anon, authenticated;
grant select on public.payment_allocations, public.payment_refunds, public.customer_email_outbox to authenticated;

create or replace function private.queue_order_email(p_order_id uuid, p_key text, p_template text, p_extra jsonb default '{}')
returns void language plpgsql security definer set search_path = '' as $$
declare v_order public.orders%rowtype;
begin
  select * into v_order from public.orders where id = p_order_id;
  if not found then return; end if;
  insert into public.customer_email_outbox(event_key, recipient, locale, template, payload)
  values (p_key, v_order.customer_email, v_order.locale, p_template,
    jsonb_build_object('orderId', v_order.id, 'orderCode', v_order.order_code, 'customerName', v_order.customer_name) || coalesce(p_extra, '{}'))
  on conflict (event_key) do nothing;
end; $$;
revoke all on function private.queue_order_email(uuid, text, text, jsonb) from public, anon, authenticated;

create or replace function public.create_marketplace_order(
  p_items jsonb, p_customer jsonb, p_payment_method public.order_payment_method,
  p_request_key uuid default null, p_locale text default 'vi'
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_order uuid; v_user uuid := (select auth.uid()); v_item jsonb; v_product public.products%rowtype; v_qty integer;
  v_subtotal bigint := 0; v_shipping bigint := 0; v_fee bigint; v_has_physical boolean := false; v_has_digital boolean := false;
  v_sellers uuid[] := '{}'; v_seller uuid; v_item_id uuid; v_address jsonb; v_existing public.orders%rowtype;
  v_fingerprint text; v_enabled boolean;
begin
  if v_user is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  if p_request_key is null then raise exception 'request_key_required'; end if;
  perform pg_advisory_xact_lock(hashtext(v_user::text), hashtext(p_request_key::text));
  v_address := p_customer->'address';
  v_fingerprint := md5(jsonb_build_object('items', p_items, 'customer', p_customer, 'payment_method', p_payment_method)::text);
  select * into v_existing from public.orders where buyer_id = v_user and client_request_key = p_request_key;
  if found then
    if v_existing.request_fingerprint <> v_fingerprint then raise exception 'idempotency_key_reused'; end if;
    return v_existing.id;
  end if;
  select checkout_enabled into v_enabled from public.marketplace_settings where id = true;
  if not coalesce(v_enabled, false) then raise exception 'checkout_disabled'; end if;
  if not private.is_admin() and not exists (select 1 from private.checkout_test_buyers where user_id = v_user) then raise exception 'checkout_restricted'; end if;
  if p_payment_method not in ('sepay', 'cod') then raise exception 'payment_method_unavailable'; end if;
  if p_locale not in ('vi', 'en', 'ko', 'zh', 'ja') then raise exception 'invalid_locale'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 50 then raise exception 'invalid_items'; end if;
  if coalesce(length(trim(p_customer->>'name')), 0) < 2 or coalesce(length(trim(p_customer->>'email')), 0) < 3 then raise exception 'invalid_customer'; end if;
  if exists (select 1 from jsonb_array_elements(p_items) e group by e->>'productId' having count(*) > 1) then raise exception 'duplicate_products'; end if;
  for v_item in select value from jsonb_array_elements(p_items) order by value->>'productId' loop
    v_qty := (v_item->>'quantity')::integer;
    if v_qty < 1 or v_qty > 99 then raise exception 'invalid_quantity'; end if;
    select * into v_product from public.products where id = (v_item->>'productId')::uuid and is_active and not admin_blocked for update;
    if not found then raise exception 'product_unavailable'; end if;
    if not exists (select 1 from public.profiles p where p.id = v_product.seller_id and p.role = 'seller')
      or not exists (select 1 from public.shops s where s.seller_id = v_product.seller_id and s.is_active) then raise exception 'seller_unavailable'; end if;
    if v_product.product_type = 'physical' and v_product.stock_quantity < v_qty then raise exception 'insufficient_stock'; end if;
    if v_product.product_type = 'digital' then v_has_digital := true; else v_has_physical := true; end if;
    v_subtotal := v_subtotal + v_product.price * v_qty;
    if not v_product.seller_id = any(v_sellers) then v_sellers := array_append(v_sellers, v_product.seller_id); end if;
  end loop;
  if v_has_physical and (jsonb_typeof(v_address) <> 'object'
    or coalesce(length(trim(v_address->>'phone')), 0) < 7 or coalesce(length(trim(v_address->>'province')), 0) < 2
    or coalesce(length(trim(v_address->>'district')), 0) < 2 or coalesce(length(trim(v_address->>'ward')), 0) < 2
    or coalesce(length(trim(v_address->>'address_line')), 0) < 4) then raise exception 'shipping_required'; end if;
  if p_payment_method = 'cod' and (v_has_digital or not v_has_physical) then raise exception 'cod_physical_only'; end if;
  if p_payment_method = 'cod' and cardinality(v_sellers) <> 1 then raise exception 'cod_single_seller_only'; end if;
  select physical_seller_shipping_fee into v_fee from public.marketplace_settings where id = true;
  if v_has_physical then
    select count(distinct p.seller_id) * v_fee into v_shipping from public.products p
    join jsonb_array_elements(p_items) e on p.id = (e->>'productId')::uuid where p.product_type = 'physical';
  end if;
  insert into public.orders(buyer_id, customer_name, customer_email, customer_phone, shipping_address,
    payment_method, payment_status, subtotal, shipping_total, total_amount, expires_at, client_request_key, request_fingerprint, locale)
  values(v_user, trim(p_customer->>'name'), lower(trim(p_customer->>'email')),
    case when v_has_physical then trim(v_address->>'phone') end, case when v_has_physical then v_address end,
    p_payment_method, 'pending', v_subtotal, v_shipping, v_subtotal + v_shipping,
    case when p_payment_method = 'sepay' then now() + interval '24 hours' end, p_request_key, v_fingerprint, p_locale)
  returning id into v_order;
  for v_item in select value from jsonb_array_elements(p_items) order by value->>'productId' loop
    v_qty := (v_item->>'quantity')::integer;
    select * into v_product from public.products where id = (v_item->>'productId')::uuid;
    insert into public.order_items(order_id, product_id, seller_id, product_title, product_type, quantity, unit_price)
      values(v_order, v_product.id, v_product.seller_id, v_product.title, v_product.product_type, v_qty, v_product.price) returning id into v_item_id;
    if v_product.product_type = 'physical' then update public.products set stock_quantity = stock_quantity - v_qty where id = v_product.id; end if;
    if v_product.product_type = 'digital' then
      insert into public.digital_entitlements(order_item_id, buyer_id, product_id, storage_path) values(v_item_id, v_user, v_product.id, v_product.digital_file_path);
    end if;
    insert into public.seller_reconciliations(order_item_id, seller_id, gross_amount) values(v_item_id, v_product.seller_id, v_product.price * v_qty);
  end loop;
  foreach v_seller in array v_sellers loop
    if exists(select 1 from public.order_items where order_id = v_order and seller_id = v_seller and product_type = 'physical') then
      insert into public.shipments(order_id, seller_id, shipping_fee) values(v_order, v_seller, v_fee);
    end if;
  end loop;
  perform private.queue_order_email(v_order, 'order:' || v_order::text || ':created', 'order_created');
  return v_order;
end; $$;
revoke all on function public.create_marketplace_order(jsonb, jsonb, public.order_payment_method) from public, anon, authenticated;
grant execute on function public.create_marketplace_order(jsonb, jsonb, public.order_payment_method, uuid, text) to authenticated;
grant usage on schema private to service_role;

drop policy if exists "seller or buyer or admin items read" on public.order_items;
create policy "buyer admin or owning seller reads order items" on public.order_items for select to authenticated
using (private.is_admin() or exists(select 1 from public.orders o where o.id = order_id and o.buyer_id = (select auth.uid())) or seller_id = (select auth.uid()));
drop policy if exists "seller or buyer or admin shipments read" on public.shipments;
create policy "buyer admin or owning seller reads shipments" on public.shipments for select to authenticated
using (private.is_admin() or seller_id = (select auth.uid()) or exists(select 1 from public.orders o where o.id = order_id and o.buyer_id = (select auth.uid())));

create or replace function public.begin_sepay_sync(p_environment text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_token uuid := gen_random_uuid(); v_state private.sepay_sync_state%rowtype;
begin
  if p_environment not in ('test', 'live') then raise exception 'invalid_environment'; end if;
  insert into private.sepay_sync_state(environment) values(p_environment) on conflict do nothing;
  select * into v_state from private.sepay_sync_state where environment = p_environment for update;
  if v_state.lease_until > now() then return jsonb_build_object('acquired', false); end if;
  update private.sepay_sync_state set lease_token = v_token, lease_until = now() + interval '5 minutes', last_error = null
    where environment = p_environment;
  return jsonb_build_object('acquired', true, 'leaseToken', v_token, 'checkpointId', v_state.checkpoint_id);
end; $$;

create or replace function public.finish_sepay_sync(p_environment text, p_lease_token uuid, p_checkpoint_id uuid, p_error text default null)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update private.sepay_sync_state set checkpoint_id = coalesce(p_checkpoint_id, checkpoint_id),
    last_success_at = case when p_error is null then now() else last_success_at end,
    last_error = left(p_error, 1000), lease_token = null, lease_until = null
  where environment = p_environment and lease_token = p_lease_token;
  return found;
end; $$;

create or replace function public.record_sepay_transaction(
  p_environment text, p_source text, p_event_id text, p_account_number text, p_expected_account text, p_amount bigint,
  p_code text, p_content text, p_bank_reference text, p_transaction_at timestamptz, p_payload jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_event public.payment_events%rowtype; v_order public.orders%rowtype; v_order_code bigint;
begin
  if p_environment not in ('test', 'live') or p_source not in ('webhook', 'api')
    or coalesce(length(trim(p_event_id)), 0) = 0 or coalesce(p_amount, 0) <= 0 then raise exception 'invalid_payment_event'; end if;
  insert into public.payment_events(provider, provider_event_id, amount, payload, environment, source, bank_reference, transaction_at)
  values ('sepay', p_environment || ':' || p_source || ':' || trim(p_event_id), p_amount, coalesce(p_payload, '{}'),
    p_environment, p_source, nullif(trim(p_bank_reference), ''), p_transaction_at)
  on conflict do nothing returning * into v_event;
  if not found then
    select * into v_event from public.payment_events where provider = 'sepay'
      and (provider_event_id = p_environment || ':' || p_source || ':' || trim(p_event_id)
        or (bank_reference = nullif(trim(p_bank_reference), '') and environment = p_environment)) limit 1;
    return jsonb_build_object('status', coalesce(v_event.review_status, 'duplicate'), 'eventId', v_event.id, 'duplicate', true);
  end if;
  if p_account_number is distinct from p_expected_account then
    update public.payment_events set review_note = 'account_mismatch' where id = v_event.id;
    return jsonb_build_object('status', 'needs_review', 'eventId', v_event.id);
  end if;
  if p_bank_reference is null or length(trim(p_bank_reference)) = 0
    or lower(coalesce(p_code, '') || ' ' || coalesce(p_content, '')) !~ '(^|[^a-z0-9])mb[0-9]{1,15}([^0-9]|$)' then
    update public.payment_events set review_note = 'missing_order_code_or_bank_reference' where id = v_event.id;
    return jsonb_build_object('status', 'needs_review', 'eventId', v_event.id);
  end if;
  v_order_code := substring(upper(coalesce(p_code, '') || ' ' || coalesce(p_content, '')) from 'MB([0-9]{1,15})')::bigint;
  select * into v_order from public.orders where order_code = v_order_code and payment_method = 'sepay' for update;
  if not found then
    update public.payment_events set order_code = v_order_code, review_note = 'order_not_found' where id = v_event.id;
    return jsonb_build_object('status', 'needs_review', 'eventId', v_event.id);
  end if;
  update public.payment_events set order_id = v_order.id, order_code = v_order_code where id = v_event.id;
  if v_order.payment_status <> 'pending' or v_order.expires_at <= now() or v_order.total_amount <> p_amount then
    update public.payment_events set review_note = case when v_order.expires_at <= now() then 'order_expired'
      when v_order.total_amount <> p_amount then 'amount_mismatch' else 'order_not_pending' end where id = v_event.id;
    return jsonb_build_object('status', 'needs_review', 'eventId', v_event.id);
  end if;
  insert into public.payment_allocations(payment_event_id, order_id, amount, request_key)
    values(v_event.id, v_order.id, p_amount, gen_random_uuid());
  update public.orders set payment_status = 'paid', paid_at = now(), updated_at = now()
    where id = v_order.id and payment_status = 'pending' and expires_at > now();
  if not found then raise exception 'order_not_payable'; end if;
  update public.payment_events set processed_at = now(), review_status = 'applied', reviewed_at = now() where id = v_event.id;
  perform private.queue_order_email(v_order.id, 'order:' || v_order.id::text || ':paid', 'payment_confirmed');
  return jsonb_build_object('status', 'applied', 'eventId', v_event.id, 'orderId', v_order.id);
end; $$;

create or replace function public.admin_allocate_payment(
  p_event_id uuid, p_order_id uuid, p_amount bigint, p_reason text, p_evidence text, p_request_key uuid
) returns void language plpgsql security definer set search_path = '' as $$
declare v_event public.payment_events%rowtype; v_order public.orders%rowtype; v_allocated bigint; v_refunded bigint; v_order_total bigint;
begin
  if not private.is_admin() then raise exception 'admin_required' using errcode = '42501'; end if;
  if p_request_key is null or p_amount <= 0 or length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'invalid_payment_review'; end if;
  if exists(select 1 from public.payment_allocations where request_key = p_request_key and payment_event_id = p_event_id and order_id = p_order_id and amount = p_amount) then return; end if;
  select * into v_event from public.payment_events where id = p_event_id for update;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_event.provider <> 'sepay' or v_order.payment_method <> 'sepay' then raise exception 'payment_not_found'; end if;
  select coalesce(sum(amount), 0) into v_allocated from public.payment_allocations where payment_event_id = p_event_id;
  select coalesce(sum(amount), 0) into v_refunded from public.payment_refunds where payment_event_id = p_event_id;
  if p_amount > v_event.amount - v_allocated - v_refunded then raise exception 'payment_amount_exceeded'; end if;
  if v_order.payment_status <> 'pending' or v_order.expires_at <= now() then raise exception 'order_not_payable'; end if;
  insert into public.payment_allocations(payment_event_id, order_id, amount, request_key, created_by)
    values(p_event_id, p_order_id, p_amount, p_request_key, (select auth.uid()));
  select total_amount into v_order_total from public.orders where id = p_order_id;
  select coalesce(sum(amount), 0) into v_allocated from public.payment_allocations where order_id = p_order_id;
  update public.payment_events set order_id = p_order_id, review_status = 'applied', reviewed_by = (select auth.uid()),
    reviewed_at = now(), review_note = trim(p_reason), processed_at = now() where id = p_event_id;
  if v_allocated >= v_order_total then
    update public.orders set payment_status = 'paid', paid_at = now(), updated_at = now() where id = p_order_id;
    perform private.queue_order_email(p_order_id, 'order:' || p_order_id::text || ':paid', 'payment_confirmed');
  end if;
  insert into public.admin_audit_log(actor_id, entity_type, entity_id, action, reason, after_state)
    values((select auth.uid()), 'payment_event', p_event_id, 'allocate_payment', trim(p_reason), jsonb_build_object('order_id', p_order_id, 'amount', p_amount, 'evidence', p_evidence));
end; $$;

create or replace function public.admin_record_payment_refund(
  p_event_id uuid, p_amount bigint, p_order_id uuid, p_reason text, p_evidence text, p_request_key uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_event public.payment_events%rowtype; v_allocated bigint; v_refunded bigint; v_refund uuid;
begin
  if not private.is_admin() then raise exception 'admin_required' using errcode = '42501'; end if;
  if p_request_key is null or p_amount <= 0 or length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'invalid_payment_refund'; end if;
  select id into v_refund from public.payment_refunds where request_key = p_request_key;
  if found then return v_refund; end if;
  select * into v_event from public.payment_events where id = p_event_id for update;
  if not found then raise exception 'payment_not_found'; end if;
  select coalesce(sum(amount), 0) into v_allocated from public.payment_allocations where payment_event_id = p_event_id;
  select coalesce(sum(amount), 0) into v_refunded from public.payment_refunds where payment_event_id = p_event_id;
  if p_amount > v_event.amount - v_allocated - v_refunded then raise exception 'payment_amount_exceeded'; end if;
  insert into public.payment_refunds(payment_event_id, order_id, amount, reason, evidence_reference, request_key, created_by)
    values(p_event_id, p_order_id, p_amount, trim(p_reason), nullif(trim(p_evidence), ''), p_request_key, (select auth.uid())) returning id into v_refund;
  update public.payment_events set review_status = 'refund_pending', reviewed_by = (select auth.uid()), reviewed_at = now(), review_note = trim(p_reason) where id = p_event_id;
  insert into public.admin_audit_log(actor_id, entity_type, entity_id, action, reason, after_state)
    values((select auth.uid()), 'payment_event', p_event_id, 'record_refund', trim(p_reason), jsonb_build_object('order_id', p_order_id, 'amount', p_amount, 'evidence', p_evidence));
  return v_refund;
end; $$;

create or replace function public.admin_complete_payment_refund(p_refund_id uuid, p_reference text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_refund public.payment_refunds%rowtype;
begin
  if not private.is_admin() then raise exception 'admin_required' using errcode = '42501'; end if;
  select * into v_refund from public.payment_refunds where id = p_refund_id for update;
  if not found or length(trim(coalesce(p_reference, ''))) < 3 then raise exception 'refund_not_found_or_reference_required'; end if;
  update public.payment_refunds set status = 'refunded', refund_reference = trim(p_reference), refunded_by = (select auth.uid()), refunded_at = now()
    where id = p_refund_id and status = 'pending';
  update public.payment_events set review_status = 'refunded' where id = v_refund.payment_event_id
    and not exists(select 1 from public.payment_refunds where payment_event_id = v_refund.payment_event_id and status = 'pending' and id <> p_refund_id);
end; $$;

create or replace function public.claim_customer_emails(p_limit integer default 20)
returns setof public.customer_email_outbox language plpgsql security definer set search_path = '' as $$
begin
  return query with selected as (
    select id from public.customer_email_outbox where status = 'pending' and next_attempt_at <= now()
    order by created_at for update skip locked limit greatest(1, least(p_limit, 50))
  ) update public.customer_email_outbox e set status = 'sending', attempt_count = attempt_count + 1
    from selected where e.id = selected.id returning e.*;
end; $$;
create or replace function public.finish_customer_email(p_id uuid, p_error text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.customer_email_outbox set status = case when p_error is null then 'sent' when attempt_count >= 5 then 'failed' else 'pending' end,
    sent_at = case when p_error is null then now() else null end,
    next_attempt_at = now() + make_interval(mins => least(60, (2 ^ least(attempt_count, 6))::integer)),
    last_error = left(p_error, 1000) where id = p_id and status = 'sending';
end; $$;
create or replace function public.admin_retry_customer_email(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'admin_required' using errcode = '42501'; end if;
  update public.customer_email_outbox set status = 'pending', attempt_count = 0, next_attempt_at = now(), last_error = null
    where id = p_id and status = 'failed';
  if not found then raise exception 'email_not_retryable'; end if;
end; $$;

create or replace function private.notify_order_state_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.payment_status = 'cancelled' and old.payment_status is distinct from new.payment_status then
    perform private.queue_order_email(new.id, 'order:' || new.id::text || ':cancelled', 'order_cancelled');
  end if;
  return new;
end; $$;
create or replace function private.notify_shipment_state_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status and new.status in ('ready_to_ship', 'shipped', 'delivered') then
    perform private.queue_order_email(new.order_id, 'shipment:' || new.id::text || ':' || new.status::text,
      'shipment_updated', jsonb_build_object('shipmentStatus', new.status, 'carrier', new.carrier, 'trackingNumber', new.tracking_number));
  end if;
  return new;
end; $$;
drop trigger if exists orders_email_outbox on public.orders;
create trigger orders_email_outbox after update of payment_status on public.orders for each row execute function private.notify_order_state_change();
drop trigger if exists shipments_email_outbox on public.shipments;
create trigger shipments_email_outbox after update of status on public.shipments for each row execute function private.notify_shipment_state_change();
revoke all on function private.notify_order_state_change(), private.notify_shipment_state_change() from public, anon, authenticated;

revoke all on function public.begin_sepay_sync(text), public.finish_sepay_sync(text,uuid,uuid,text),
  public.record_sepay_transaction(text,text,text,text,text,bigint,text,text,text,timestamptz,jsonb),
  public.claim_customer_emails(integer), public.finish_customer_email(uuid,text) from public, anon, authenticated;
grant execute on function public.begin_sepay_sync(text), public.finish_sepay_sync(text,uuid,uuid,text),
  public.record_sepay_transaction(text,text,text,text,text,bigint,text,text,text,timestamptz,jsonb),
  public.claim_customer_emails(integer), public.finish_customer_email(uuid,text) to service_role;
revoke all on function public.admin_allocate_payment(uuid,uuid,bigint,text,text,uuid),
  public.admin_record_payment_refund(uuid,bigint,uuid,text,text,uuid), public.admin_complete_payment_refund(uuid,text),
  public.admin_retry_customer_email(uuid) from public, anon;
grant execute on function public.admin_allocate_payment(uuid,uuid,bigint,text,text,uuid),
  public.admin_record_payment_refund(uuid,bigint,uuid,text,text,uuid), public.admin_complete_payment_refund(uuid,text),
  public.admin_retry_customer_email(uuid) to authenticated;

create extension if not exists pg_net with schema extensions;
do $$ begin
  if exists(select 1 from cron.job where jobname = 'munbase-payment-email-outbox') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'munbase-payment-email-outbox';
  end if;
  perform cron.schedule('munbase-payment-email-outbox', '* * * * *',
    $job$ select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'munbase-job-url'),
      headers := jsonb_build_object('content-type','application/json','authorization','Bearer ' ||
        (select decrypted_secret from vault.decrypted_secrets where name = 'munbase-cron-secret')),
      body := '{"job":"email"}'::jsonb, timeout_milliseconds := 10000); $job$);
  if exists(select 1 from cron.job where jobname = 'munbase-sepay-reconciliation') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'munbase-sepay-reconciliation';
  end if;
  perform cron.schedule('munbase-sepay-reconciliation', '*/15 * * * *',
    $job$ select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'munbase-job-url'),
      headers := jsonb_build_object('content-type','application/json','authorization','Bearer ' ||
        (select decrypted_secret from vault.decrypted_secrets where name = 'munbase-cron-secret')),
      body := '{"job":"reconcile"}'::jsonb, timeout_milliseconds := 10000); $job$);
end $$;
