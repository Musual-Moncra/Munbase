-- Munbase release operations: seller shops and payouts, safe order lifecycle,
-- and a least-privilege Data API surface.

create extension if not exists pg_cron with schema pg_catalog;

create table if not exists public.shops (
  seller_id uuid primary key references public.profiles(id) on delete cascade,
  shop_name text not null check (length(trim(shop_name)) between 2 and 100),
  description text not null default '' check (length(description) <= 3000),
  logo_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.seller_payout_accounts (
  seller_id uuid primary key references public.profiles(id) on delete cascade,
  bank_name text not null check (length(trim(bank_name)) between 2 and 80),
  bank_account_number text not null check (length(trim(bank_account_number)) between 6 and 40),
  bank_account_name text not null check (length(trim(bank_account_name)) between 2 and 120),
  updated_at timestamptz not null default now()
);

alter table public.orders
  add column if not exists expires_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cod_remitted_at timestamptz,
  add column if not exists cod_remittance_reference text;

alter table public.products
  add constraint products_max_five_images check (cardinality(images) <= 5);

update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg','image/png','image/webp']
where id = 'product-images';

update storage.buckets
set file_size_limit = 52428800
where id = 'digital-assets';

insert into public.categories(slug, name, icon) values
  ('food', '{"vi":"Đặc sản & ẩm thực","en":"Food & specialties","ko":"특산품과 음식","zh":"特产与美食","ja":"特産品・食品"}'::jsonb, '🍵'),
  ('handmade', '{"vi":"Thủ công","en":"Handmade","ko":"수공예","zh":"手工艺","ja":"ハンドメイド"}'::jsonb, '🧶'),
  ('home', '{"vi":"Nhà cửa & đời sống","en":"Home & living","ko":"홈과 라이프스타일","zh":"家居与生活","ja":"暮らし・生活"}'::jsonb, '🏡'),
  ('digital-creative', '{"vi":"Sáng tạo số","en":"Digital creative","ko":"디지털 크리에이티브","zh":"数字创作","ja":"デジタルクリエイティブ"}'::jsonb, '🎨'),
  ('digital-learning', '{"vi":"Tài liệu & học tập","en":"Learning & resources","ko":"학습 자료","zh":"学习资料","ja":"学習・資料"}'::jsonb, '📚')
on conflict (slug) do nothing;

-- Keep authorization queries out of exposed public tables and avoid the
-- orders <-> order_items policy recursion present in the original policies.
create or replace function private.can_read_order(p_order_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.orders o
    where o.id = p_order_id
      and (
        o.buyer_id = (select auth.uid())
        or private.is_admin()
        or exists (
          select 1 from public.order_items i
          where i.order_id = o.id and i.seller_id = (select auth.uid())
        )
      )
  )
$$;
revoke all on function private.can_read_order(uuid) from public, anon;
grant execute on function private.can_read_order(uuid) to authenticated;

drop policy if exists "buyer seller admin orders read" on public.orders;
create policy "buyer seller admin orders read" on public.orders
  for select to authenticated using (private.can_read_order(id));

drop policy if exists "seller or buyer or admin items read" on public.order_items;
create policy "seller or buyer or admin items read" on public.order_items
  for select to authenticated using (private.can_read_order(order_id));

drop policy if exists "seller or buyer or admin shipments read" on public.shipments;
create policy "seller or buyer or admin shipments read" on public.shipments
  for select to authenticated using (private.can_read_order(order_id));

alter table public.shops enable row level security;
alter table public.seller_payout_accounts enable row level security;

create policy "active shops public read" on public.shops
  for select to anon, authenticated using (is_active or seller_id = (select auth.uid()) or private.is_admin());
create policy "seller manages own shop" on public.shops
  for all to authenticated
  using (seller_id = (select auth.uid()) or private.is_admin())
  with check (
    (seller_id = (select auth.uid()) or private.is_admin())
    and exists (select 1 from public.profiles p where p.id = seller_id and p.role in ('seller','admin'))
  );
create policy "seller or admin reads payout account" on public.seller_payout_accounts
  for select to authenticated using (seller_id = (select auth.uid()) or private.is_admin());
create policy "seller manages own payout account" on public.seller_payout_accounts
  for all to authenticated
  using (seller_id = (select auth.uid()) or private.is_admin())
  with check (
    (seller_id = (select auth.uid()) or private.is_admin())
    and exists (select 1 from public.profiles p where p.id = seller_id and p.role in ('seller','admin'))
  );

grant select on public.shops to anon, authenticated;
grant insert, update on public.shops to authenticated;
grant select, insert, update on public.seller_payout_accounts to authenticated;

-- Image ownership includes updates/deletes so sellers can replace or remove
-- uploaded images when editing a listing.
drop policy if exists "seller manages own product image updates" on storage.objects;
create policy "seller manages own product image updates" on storage.objects
  for update to authenticated
  using (bucket_id = 'product-images' and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role in ('seller','admin')))
  with check (bucket_id = 'product-images' and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role in ('seller','admin')));
drop policy if exists "seller manages own product image deletes" on storage.objects;
create policy "seller manages own product image deletes" on storage.objects
  for delete to authenticated
  using (bucket_id = 'product-images' and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role in ('seller','admin')));

-- Application submission is idempotent for one account and permits a rejected
-- applicant to correct and resubmit without granting write access to review fields.
create or replace function public.submit_seller_application(
  p_shop_name text, p_contact_phone text, p_description text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := (select auth.uid()); v_id uuid;
begin
  if v_user is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  if length(trim(coalesce(p_shop_name,''))) not between 2 and 100
     or length(trim(coalesce(p_contact_phone,''))) not between 7 and 30
     or length(coalesce(p_description,'')) > 3000 then raise exception 'invalid_application'; end if;
  if exists (select 1 from public.profiles p where p.id = v_user and p.role in ('seller','admin')) then
    raise exception 'seller_already_approved';
  end if;
  insert into public.seller_applications(user_id,shop_name,contact_phone,description)
  values(v_user,trim(p_shop_name),trim(p_contact_phone),trim(coalesce(p_description,'')))
  on conflict (user_id) do update set
    shop_name = excluded.shop_name,
    contact_phone = excluded.contact_phone,
    description = excluded.description,
    status = 'pending',
    reviewed_by = null,
    reviewed_at = null
  where public.seller_applications.status = 'rejected'
  returning id into v_id;
  if v_id is null then raise exception 'application_already_pending'; end if;
  return v_id;
end; $$;
revoke all on function public.submit_seller_application(text,text,text) from public, anon;
grant execute on function public.submit_seller_application(text,text,text) to authenticated;

create or replace function public.admin_review_seller_application(p_application_id uuid,p_approve boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v_user uuid; v_shop_name text; v_description text;
begin
  if not private.is_admin() then raise exception 'admin_required' using errcode = '42501'; end if;
  update public.seller_applications
    set status = case when p_approve then 'approved'::public.seller_application_state else 'rejected'::public.seller_application_state end,
        reviewed_by = (select auth.uid()), reviewed_at = now()
    where id = p_application_id and status = 'pending'
    returning user_id,shop_name,coalesce(description,'') into v_user,v_shop_name,v_description;
  if v_user is null then raise exception 'application_not_pending'; end if;
  if p_approve then
    update public.profiles set role = 'seller', updated_at = now() where id = v_user;
    insert into public.shops(seller_id,shop_name,description)
      values(v_user,v_shop_name,v_description)
      on conflict(seller_id) do update set shop_name = excluded.shop_name, description = excluded.description, is_active = true, updated_at = now();
  end if;
end; $$;
revoke all on function public.admin_review_seller_application(uuid,boolean) from public, anon;
grant execute on function public.admin_review_seller_application(uuid,boolean) to authenticated;

-- Order creation is the only client-facing write path. Prices, stock, shipping,
-- eligible payment methods, and the COD one-seller rule are authoritative here.
create or replace function public.create_marketplace_order(
  p_items jsonb,p_customer jsonb,p_payment_method public.order_payment_method
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_order uuid; v_user uuid := (select auth.uid()); v_item jsonb; v_product public.products%rowtype; v_qty integer;
  v_subtotal bigint := 0; v_shipping bigint := 0; v_fee bigint; v_has_physical boolean := false; v_has_digital boolean := false;
  v_sellers uuid[] := '{}'; v_seller uuid; v_item_id uuid;
begin
  if v_user is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  if p_payment_method not in ('sepay','cod') then raise exception 'payment_method_unavailable'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 50 then raise exception 'invalid_items'; end if;
  if coalesce(length(trim(p_customer->>'name')),0) < 2 or coalesce(length(trim(p_customer->>'email')),0) < 3 then raise exception 'invalid_customer'; end if;
  if exists(select 1 from jsonb_array_elements(p_items) e group by e->>'productId' having count(*) > 1) then raise exception 'duplicate_products'; end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'quantity')::integer;
    if v_qty < 1 or v_qty > 99 then raise exception 'invalid_quantity'; end if;
    select * into v_product from public.products where id = (v_item->>'productId')::uuid and is_active = true for update;
    if not found then raise exception 'product_unavailable'; end if;
    if not exists(select 1 from public.profiles p where p.id = v_product.seller_id and p.role = 'seller') then raise exception 'seller_unavailable'; end if;
    if not exists(select 1 from public.shops s where s.seller_id = v_product.seller_id and s.is_active) then raise exception 'seller_unavailable'; end if;
    if v_product.product_type = 'physical' and v_product.stock_quantity < v_qty then raise exception 'insufficient_stock'; end if;
    if v_product.product_type = 'digital' then v_has_digital := true; else v_has_physical := true; end if;
    v_subtotal := v_subtotal + v_product.price * v_qty;
    if not v_product.seller_id = any(v_sellers) then v_sellers := array_append(v_sellers,v_product.seller_id); end if;
  end loop;
  if v_has_physical and (coalesce(length(trim(p_customer->>'phone')),0) < 7 or coalesce(length(trim(p_customer->>'address')),0) < 8) then raise exception 'shipping_required'; end if;
  if p_payment_method = 'cod' and (v_has_digital or not v_has_physical) then raise exception 'cod_physical_only'; end if;
  if p_payment_method = 'cod' and cardinality(v_sellers) <> 1 then raise exception 'cod_single_seller_only'; end if;
  select physical_seller_shipping_fee into v_fee from public.marketplace_settings where id = true;
  if v_has_physical then
    select count(distinct p.seller_id) * v_fee into v_shipping
    from public.products p join jsonb_array_elements(p_items) e on p.id = (e->>'productId')::uuid
    where p.product_type = 'physical';
  end if;
  insert into public.orders(buyer_id,customer_name,customer_email,customer_phone,shipping_address,payment_method,payment_status,subtotal,shipping_total,total_amount,expires_at)
  values(v_user,trim(p_customer->>'name'),lower(trim(p_customer->>'email')),nullif(trim(p_customer->>'phone'),''),
    case when v_has_physical then jsonb_build_object('address',trim(p_customer->>'address')) else null end,
    p_payment_method,'pending',v_subtotal,v_shipping,v_subtotal+v_shipping,
    case when p_payment_method = 'sepay' then now() + interval '24 hours' else null end)
  returning id into v_order;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'quantity')::integer;
    select * into v_product from public.products where id = (v_item->>'productId')::uuid;
    insert into public.order_items(order_id,product_id,seller_id,product_title,product_type,quantity,unit_price)
      values(v_order,v_product.id,v_product.seller_id,v_product.title,v_product.product_type,v_qty,v_product.price) returning id into v_item_id;
    if v_product.product_type = 'physical' then update public.products set stock_quantity = stock_quantity - v_qty where id = v_product.id; end if;
    if v_product.product_type = 'digital' then
      insert into public.digital_entitlements(order_item_id,buyer_id,product_id,storage_path) values(v_item_id,v_user,v_product.id,v_product.digital_file_path);
    end if;
    insert into public.seller_reconciliations(order_item_id,seller_id,gross_amount) values(v_item_id,v_product.seller_id,v_product.price*v_qty);
  end loop;
  foreach v_seller in array v_sellers loop
    if exists(select 1 from public.order_items where order_id = v_order and seller_id = v_seller and product_type = 'physical') then
      insert into public.shipments(order_id,seller_id,shipping_fee) values(v_order,v_seller,v_fee);
    end if;
  end loop;
  return v_order;
end; $$;
revoke all on function public.create_marketplace_order(jsonb,jsonb,public.order_payment_method) from public, anon;
grant execute on function public.create_marketplace_order(jsonb,jsonb,public.order_payment_method) to authenticated;

create or replace function public.cancel_cod_order(p_order_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_order public.orders%rowtype; v_item record;
begin
  select * into v_order from public.orders where id = p_order_id and buyer_id = (select auth.uid()) for update;
  if not found then raise exception 'order_not_found'; end if;
  if v_order.payment_method <> 'cod' or v_order.payment_status <> 'pending' then raise exception 'order_not_cancellable'; end if;
  if exists(select 1 from public.shipments where order_id = p_order_id and status <> 'pending') then raise exception 'shipment_already_started'; end if;
  for v_item in select product_id,sum(quantity)::integer as quantity from public.order_items where order_id = p_order_id and product_type = 'physical' group by product_id loop
    update public.products set stock_quantity = stock_quantity + v_item.quantity where id = v_item.product_id;
  end loop;
  update public.orders set payment_status = 'cancelled',cancelled_at = now(),updated_at = now() where id = p_order_id;
  update public.shipments set status = 'cancelled' where order_id = p_order_id and status = 'pending';
end; $$;
revoke all on function public.cancel_cod_order(uuid) from public, anon;
grant execute on function public.cancel_cod_order(uuid) to authenticated;

create or replace function public.expire_unpaid_orders() returns integer
language plpgsql security definer set search_path = '' as $$
declare v_order record; v_item record; v_count integer := 0;
begin
  for v_order in select id from public.orders
    where payment_method = 'sepay' and payment_status = 'pending' and expires_at <= now()
    order by expires_at for update skip locked limit 100 loop
    for v_item in select product_id,sum(quantity)::integer as quantity from public.order_items where order_id = v_order.id and product_type = 'physical' group by product_id loop
      update public.products set stock_quantity = stock_quantity + v_item.quantity where id = v_item.product_id;
    end loop;
    update public.orders set payment_status = 'cancelled',cancelled_at = now(),updated_at = now() where id = v_order.id and payment_status = 'pending';
    update public.shipments set status = 'cancelled' where order_id = v_order.id and status = 'pending';
    v_count := v_count + 1;
  end loop;
  return v_count;
end; $$;
revoke all on function public.expire_unpaid_orders() from public, anon, authenticated;
grant execute on function public.expire_unpaid_orders() to service_role;

create or replace function public.admin_confirm_cod_remittance(p_order_id uuid,p_reference text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_order public.orders%rowtype;
begin
  if not private.is_admin() then raise exception 'admin_required' using errcode = '42501'; end if;
  if length(trim(coalesce(p_reference,''))) not between 3 and 120 then raise exception 'remittance_reference_required'; end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.payment_method <> 'cod' then raise exception 'cod_order_not_found'; end if;
  if v_order.payment_status = 'paid' and v_order.cod_remitted_at is not null then raise exception 'cod_already_reconciled'; end if;
  if v_order.payment_status <> 'pending' or exists(select 1 from public.shipments where order_id = p_order_id and status <> 'delivered') then raise exception 'cod_not_delivered'; end if;
  update public.orders set payment_status = 'paid',paid_at = now(),cod_remitted_at = now(),cod_remittance_reference = trim(p_reference),updated_at = now() where id = p_order_id;
end; $$;
revoke all on function public.admin_confirm_cod_remittance(uuid,text) from public, anon;
grant execute on function public.admin_confirm_cod_remittance(uuid,text) to authenticated;

create or replace function public.admin_mark_reconciled(p_reconciliation_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_order public.orders%rowtype; v_seller uuid;
begin
  if not private.is_admin() then raise exception 'admin_required' using errcode = '42501'; end if;
  select seller_id into v_seller from public.seller_reconciliations where id = p_reconciliation_id for update;
  if not found then raise exception 'reconciliation_not_found'; end if;
  select o.* into v_order from public.seller_reconciliations r join public.order_items i on i.id = r.order_item_id join public.orders o on o.id = i.order_id where r.id = p_reconciliation_id;
  if v_order.payment_status <> 'paid' then raise exception 'order_not_paid'; end if;
  if exists(select 1 from public.order_items i join public.shipments s on s.order_id = i.order_id and s.seller_id = i.seller_id where i.order_id = v_order.id and i.seller_id = v_seller and i.product_type = 'physical' and s.status <> 'delivered') then
    raise exception 'shipment_not_delivered';
  end if;
  if v_order.payment_method = 'cod' and v_order.cod_remitted_at is null then raise exception 'cod_not_remitted'; end if;
  update public.seller_reconciliations set status = 'reconciled',reconciled_by = (select auth.uid()),reconciled_at = now()
    where id = p_reconciliation_id and status = 'pending';
  if not found then raise exception 'already_reconciled'; end if;
end; $$;
revoke all on function public.admin_mark_reconciled(uuid) from public, anon;
grant execute on function public.admin_mark_reconciled(uuid) to authenticated;

-- Late, short, overpaid, and unmatched transfers remain visible to admins;
-- duplicate deliveries are idempotent and cancelled orders never reopen.
create or replace function public.confirm_sepay_payment(
  p_order_code bigint,p_amount bigint,p_event_id text,p_payload jsonb
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_order public.orders%rowtype; v_inserted integer;
begin
  if coalesce(length(trim(p_event_id)),0)=0 or coalesce(p_amount,0)<=0 then raise exception 'invalid_payment_event'; end if;
  insert into public.payment_events(provider,provider_event_id,order_code,amount,payload)
    values('sepay',trim(p_event_id),p_order_code,p_amount,coalesce(p_payload,'{}'))
    on conflict(provider,provider_event_id) do nothing;
  get diagnostics v_inserted=row_count;
  if v_inserted=0 then return false; end if;
  if p_order_code is null then return false; end if;
  select * into v_order from public.orders where order_code=p_order_code and payment_method='sepay' for update;
  if not found then return false; end if;
  update public.payment_events set order_id=v_order.id where provider='sepay' and provider_event_id=trim(p_event_id);
  if v_order.payment_status<>'pending' or v_order.total_amount<>p_amount or v_order.expires_at<=now() then return false; end if;
  update public.orders set payment_status='paid',paid_at=now(),updated_at=now()
    where id=v_order.id and payment_status='pending' and expires_at>now();
  if not found then return false; end if;
  update public.payment_events set processed_at=now() where provider='sepay' and provider_event_id=trim(p_event_id);
  return true;
end; $$;
revoke all on function public.confirm_sepay_payment(bigint,bigint,text,jsonb) from public,anon,authenticated;
grant execute on function public.confirm_sepay_payment(bigint,bigint,text,jsonb) to service_role;

-- Explicit privileges make the Data API surface auditable and keep sensitive
-- order, payout, event, and profile records unavailable to anonymous callers.
revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;
grant select on public.categories,public.products,public.reviews,public.shops to anon;
grant select on public.profiles,public.categories,public.products,public.marketplace_settings,public.orders,public.order_items,public.shipments,public.digital_entitlements,public.reviews,public.seller_reconciliations,public.seller_applications,public.payment_events,public.shops,public.seller_payout_accounts to authenticated;
grant update(full_name,avatar_url,phone) on public.profiles to authenticated;
grant insert(seller_id,category_id,title,slug,description,price,product_type,images,stock_quantity,digital_file_path,is_active),
  update(category_id,title,slug,description,price,product_type,images,stock_quantity,digital_file_path,is_active,updated_at),
  delete on public.products to authenticated;
grant update(physical_seller_shipping_fee) on public.marketplace_settings to authenticated;

alter default privileges in schema public revoke all on tables from anon, authenticated;

do $$
begin
  if exists(select 1 from cron.job where jobname='munbase-expire-unpaid-orders') then
    perform cron.unschedule(jobid) from cron.job where jobname='munbase-expire-unpaid-orders';
  end if;
  perform cron.schedule('munbase-expire-unpaid-orders','*/15 * * * *','select public.expire_unpaid_orders();');
end $$;
