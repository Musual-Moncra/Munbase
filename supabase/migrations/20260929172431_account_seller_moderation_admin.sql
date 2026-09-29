-- Account preferences and shipping address book.
alter table public.profiles
  add column if not exists theme_preference text not null default 'system'
    check (theme_preference in ('light','dark','system'));
grant update(theme_preference) on public.profiles to authenticated;

create table if not exists public.shipping_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  recipient_name text not null check (length(trim(recipient_name)) between 2 and 120),
  phone text not null check (length(trim(phone)) between 7 and 40),
  province text not null check (length(trim(province)) between 2 and 120),
  district text not null check (length(trim(district)) between 2 and 120),
  ward text not null check (length(trim(ward)) between 2 and 120),
  address_line text not null check (length(trim(address_line)) between 4 and 300),
  note text not null default '' check (length(note) <= 300),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists shipping_addresses_user_idx on public.shipping_addresses(user_id, is_default desc, created_at desc);
create unique index if not exists shipping_addresses_one_default_idx on public.shipping_addresses(user_id) where is_default;
alter table public.shipping_addresses enable row level security;
create policy "buyer manages own shipping addresses" on public.shipping_addresses for all to authenticated
  using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
grant select,insert,update,delete on public.shipping_addresses to authenticated;

create or replace function public.set_default_shipping_address(p_address_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v_user uuid := (select auth.uid());
begin
  if v_user is null then raise exception 'authentication_required' using errcode='28000'; end if;
  perform 1 from public.shipping_addresses where id=p_address_id and user_id=v_user for update;
  if not found then raise exception 'address_not_found'; end if;
  update public.shipping_addresses set is_default=false,updated_at=now() where user_id=v_user and is_default;
  update public.shipping_addresses set is_default=true,updated_at=now() where id=p_address_id and user_id=v_user;
end; $$;
revoke all on function public.set_default_shipping_address(uuid) from public,anon;
grant execute on function public.set_default_shipping_address(uuid) to authenticated;

-- Seller application is a private draft/submission. Bank information lives in
-- its own table and is copied to the seller payout table only on approval.
alter table public.seller_applications
  add column if not exists contact_name text not null default '',
  add column if not exists contact_address jsonb not null default '{}',
  add column if not exists product_types text[] not null default '{}',
  add column if not exists product_categories uuid[] not null default '{}',
  add column if not exists website_url text,
  add column if not exists proof_url text,
  add column if not exists terms_version text,
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists submitted_at timestamptz,
  add column if not exists rejection_reason text;

create table if not exists public.seller_application_payout_accounts (
  application_id uuid primary key references public.seller_applications(id) on delete cascade,
  bank_name text check (bank_name is null or length(trim(bank_name)) between 2 and 80),
  bank_account_number text check (bank_account_number is null or length(trim(bank_account_number)) between 6 and 40),
  bank_account_name text check (bank_account_name is null or length(trim(bank_account_name)) between 2 and 120),
  updated_at timestamptz not null default now()
);
create table if not exists public.seller_application_reviews (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.seller_applications(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id),
  decision text not null check (decision in ('approved','rejected','changes_requested')),
  reason text not null check (length(trim(reason)) between 3 and 2000),
  created_at timestamptz not null default now()
);
alter table public.seller_application_payout_accounts enable row level security;
alter table public.seller_application_reviews enable row level security;
create policy "applicant or admin reads application payout" on public.seller_application_payout_accounts for select to authenticated
  using (exists(select 1 from public.seller_applications a where a.id=application_id and (a.user_id=(select auth.uid()) or (select private.is_admin()))));
create policy "admin reads application reviews" on public.seller_application_reviews for select to authenticated
  using ((select private.is_admin()) or exists(select 1 from public.seller_applications a where a.id=application_id and a.user_id=(select auth.uid())));
grant select on public.seller_application_payout_accounts,public.seller_application_reviews to authenticated;

create or replace function public.save_seller_application(p_payload jsonb,p_submit boolean default false) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_user uuid := (select auth.uid()); v_id uuid; v_existing public.seller_applications%rowtype;
  v_shop text; v_contact text; v_phone text; v_description text; v_address jsonb; v_types text[]; v_categories uuid[];
  v_bank text; v_number text; v_holder text;
begin
  if v_user is null then raise exception 'authentication_required' using errcode='28000'; end if;
  if not exists(select 1 from public.profiles p where p.id=v_user and p.role='buyer') then raise exception 'seller_application_not_allowed'; end if;
  v_shop:=trim(coalesce(p_payload->>'shop_name','')); v_contact:=trim(coalesce(p_payload->>'contact_name',''));
  v_phone:=trim(coalesce(p_payload->>'contact_phone','')); v_description:=trim(coalesce(p_payload->>'description',''));
  v_address:=coalesce(p_payload->'address','{}'::jsonb);
  v_types:=array(select jsonb_array_elements_text(coalesce(p_payload->'product_types','[]'::jsonb)));
  v_categories:=array(select jsonb_array_elements_text(coalesce(p_payload->'product_categories','[]'::jsonb))::uuid);
  v_bank:=trim(coalesce(p_payload->>'bank_name','')); v_number:=trim(coalesce(p_payload->>'bank_account_number','')); v_holder:=trim(coalesce(p_payload->>'bank_account_name',''));
  if p_submit and (length(v_shop) not between 2 and 100 or length(v_contact) not between 2 and 120 or length(v_phone) not between 7 and 30
      or length(v_description) not between 10 and 3000 or jsonb_typeof(v_address)<>'object'
      or length(coalesce(v_address->>'province',''))<2 or length(coalesce(v_address->>'district',''))<2
      or length(coalesce(v_address->>'ward',''))<2 or length(coalesce(v_address->>'address_line',''))<4
      or cardinality(v_types)=0 or not (v_types <@ array['physical','digital']::text[])
      or length(v_bank) not between 2 and 80 or length(v_number) not between 6 and 40 or length(v_holder) not between 2 and 120
      or coalesce((p_payload->>'terms_accepted')::boolean,false) is not true) then raise exception 'application_incomplete'; end if;
  select * into v_existing from public.seller_applications where user_id=v_user for update;
  if found and v_existing.status='pending' and v_existing.submitted_at is not null then raise exception 'application_under_review'; end if;
  if found then
    v_id:=v_existing.id;
    update public.seller_applications set shop_name=v_shop,contact_name=v_contact,contact_phone=v_phone,description=v_description,
      contact_address=v_address,product_types=v_types,product_categories=v_categories,
      website_url=nullif(trim(coalesce(p_payload->>'website_url','')),''),proof_url=nullif(trim(coalesce(p_payload->>'proof_url','')),''),
      terms_version=case when p_submit then 'seller-v1' else null end,terms_accepted_at=case when p_submit then now() else null end,
      submitted_at=case when p_submit then now() else null end,status=case when p_submit then 'pending'::public.seller_application_state else v_existing.status end,
      reviewed_by=null,reviewed_at=null,rejection_reason=null
      where id=v_id;
  else
    insert into public.seller_applications(user_id,shop_name,contact_name,contact_phone,description,contact_address,product_types,product_categories,website_url,proof_url,terms_version,terms_accepted_at,submitted_at,status)
    values(v_user,v_shop,v_contact,v_phone,v_description,v_address,v_types,v_categories,
      nullif(trim(coalesce(p_payload->>'website_url','')),''),nullif(trim(coalesce(p_payload->>'proof_url','')),''),
      case when p_submit then 'seller-v1' end,case when p_submit then now() end,case when p_submit then now() end,'pending') returning id into v_id;
  end if;
  if v_bank<>'' or v_number<>'' or v_holder<>'' then
    insert into public.seller_application_payout_accounts(application_id,bank_name,bank_account_number,bank_account_name)
      values(v_id,nullif(v_bank,''),nullif(v_number,''),nullif(v_holder,''))
      on conflict(application_id) do update set bank_name=excluded.bank_name,bank_account_number=excluded.bank_account_number,bank_account_name=excluded.bank_account_name,updated_at=now();
  end if;
  return v_id;
end; $$;
revoke all on function public.save_seller_application(jsonb,boolean) from public,anon;
grant execute on function public.save_seller_application(jsonb,boolean) to authenticated;
revoke execute on function public.submit_seller_application(text,text,text) from authenticated;

create or replace function public.admin_review_seller_application(p_application_id uuid,p_decision text,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare v_app public.seller_applications%rowtype; v_bank public.seller_application_payout_accounts%rowtype;
begin
  if not private.is_admin() then raise exception 'admin_required' using errcode='42501'; end if;
  if p_decision not in ('approved','rejected','changes_requested') or length(trim(coalesce(p_reason,'')))<3 then raise exception 'decision_and_reason_required'; end if;
  select * into v_app from public.seller_applications where id=p_application_id and status='pending' and submitted_at is not null for update;
  if not found then raise exception 'application_not_pending'; end if;
  insert into public.seller_application_reviews(application_id,reviewer_id,decision,reason) values(p_application_id,(select auth.uid()),p_decision,trim(p_reason));
  update public.seller_applications set status=case when p_decision='approved' then 'approved'::public.seller_application_state else 'rejected'::public.seller_application_state end,
    rejection_reason=case when p_decision='approved' then null else trim(p_reason) end,reviewed_by=(select auth.uid()),reviewed_at=now() where id=p_application_id;
  if p_decision='approved' then
    update public.profiles set role='seller',updated_at=now() where id=v_app.user_id;
    insert into public.shops(seller_id,shop_name,description) values(v_app.user_id,v_app.shop_name,coalesce(v_app.description,''))
      on conflict(seller_id) do update set shop_name=excluded.shop_name,description=excluded.description,is_active=true,updated_at=now();
    select * into v_bank from public.seller_application_payout_accounts where application_id=p_application_id;
    if found then
      insert into public.seller_payout_accounts(seller_id,bank_name,bank_account_number,bank_account_name)
        values(v_app.user_id,v_bank.bank_name,v_bank.bank_account_number,v_bank.bank_account_name)
        on conflict(seller_id) do update set bank_name=excluded.bank_name,bank_account_number=excluded.bank_account_number,bank_account_name=excluded.bank_account_name,updated_at=now();
    end if;
  end if;
end; $$;
revoke all on function public.admin_review_seller_application(uuid,text,text) from public,anon;
grant execute on function public.admin_review_seller_application(uuid,text,text) to authenticated;

-- Product submissions are isolated from the live catalogue, so pending edits
-- never leak to shoppers and the approved version remains purchasable.
alter table public.products add column if not exists admin_blocked boolean not null default false;
update public.products set admin_blocked=false;
create table if not exists public.product_submissions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check(length(trim(title)) between 3 and 120),
  slug text not null check(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text not null check(length(description) between 10 and 6000),
  price bigint not null check(price>0),
  product_type public.product_kind not null,
  category_id uuid references public.categories(id) on delete set null,
  initial_stock integer not null default 0 check(initial_stock>=0),
  digital_file_path text,
  images text[] not null default '{}',
  status text not null default 'draft' check(status in ('draft','pending','rejected','approved')),
  rejection_reason text,
  submitted_at timestamptz,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(cardinality(images)<=5),
  check((product_type='digital' and digital_file_path is not null) or product_type='physical')
);
create index if not exists product_submissions_queue_idx on public.product_submissions(status,submitted_at desc);
create index if not exists product_submissions_seller_idx on public.product_submissions(seller_id,created_at desc);
create table if not exists public.product_submission_reviews (
  id uuid primary key default gen_random_uuid(), submission_id uuid not null references public.product_submissions(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id), decision text not null check(decision in ('approved','rejected')),
  reason text not null check(length(trim(reason)) between 3 and 2000), created_at timestamptz not null default now()
);
create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(), actor_id uuid not null references public.profiles(id),
  entity_type text not null, entity_id uuid not null, action text not null, reason text not null,
  before_state jsonb not null default '{}', after_state jsonb not null default '{}', created_at timestamptz not null default now()
);
create index if not exists admin_audit_entity_idx on public.admin_audit_log(entity_type,entity_id,created_at desc);
alter table public.product_submissions enable row level security;
alter table public.product_submission_reviews enable row level security;
create policy "seller or admin reads product submissions" on public.product_submissions for select to authenticated
  using(seller_id=(select auth.uid()) or (select private.is_admin()));
create policy "seller or admin reads product reviews" on public.product_submission_reviews for select to authenticated
  using((select private.is_admin()) or exists(select 1 from public.product_submissions s where s.id=submission_id and s.seller_id=(select auth.uid())));
grant select on public.product_submissions,public.product_submission_reviews to authenticated;

revoke insert,update,delete on public.products from authenticated;
drop policy if exists "seller products insert" on public.products;
drop policy if exists "seller products update" on public.products;
drop policy if exists "seller products delete" on public.products;
drop policy if exists "active products public read" on public.products;
create policy "approved visible products public read" on public.products for select to anon,authenticated
  using((is_active and not admin_blocked) or seller_id=(select auth.uid()) or (select private.is_admin()));

create or replace function public.save_product_submission(p_submission_id uuid,p_product_id uuid,p_payload jsonb,p_submit boolean default false) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_user uuid := (select auth.uid()); v_id uuid; v_product public.products%rowtype; v_title text; v_slug text; v_type public.product_kind; v_path text;
  v_images text[]; v_status text; v_price bigint; v_stock integer; v_category uuid;
begin
  if v_user is null then raise exception 'authentication_required' using errcode='28000'; end if;
  if not exists(select 1 from public.profiles p where p.id=v_user and p.role in ('seller','admin')) then raise exception 'seller_approval_required' using errcode='42501'; end if;
  v_title:=trim(coalesce(p_payload->>'title','')); v_slug:=trim(coalesce(p_payload->>'slug',''));
  v_type:=(p_payload->>'product_type')::public.product_kind; v_price:=(p_payload->>'price')::bigint; v_stock:=greatest(coalesce((p_payload->>'stock')::integer,0),0);
  v_category:=nullif(p_payload->>'category_id','')::uuid; v_path:=nullif(trim(coalesce(p_payload->>'digital_file_path','')),'');
  v_images:=array(select jsonb_array_elements_text(coalesce(p_payload->'images','[]'::jsonb)));
  if length(v_title) not between 3 and 120 or length(trim(coalesce(p_payload->>'description',''))) not between 10 and 6000 or v_price<=0 or cardinality(v_images)>5 then raise exception 'invalid_product'; end if;
  if v_type='digital' and (v_path is null or split_part(v_path,'/',1)<>v_user::text or not exists(select 1 from storage.objects o where o.bucket_id='digital-assets' and o.name=v_path)) then raise exception 'invalid_digital_asset'; end if;
  if exists(select 1 from unnest(v_images) i where split_part(split_part(i,'/product-images/',2),'/',1)<>v_user::text) then raise exception 'invalid_product_image'; end if;
  if p_product_id is not null and not exists(select 1 from public.products p where p.id=p_product_id and p.seller_id=v_user and not p.admin_blocked) then raise exception 'product_not_editable'; end if;
  if p_submission_id is not null then
    select status into v_status from public.product_submissions where id=p_submission_id and seller_id=v_user for update;
    if not found or v_status='pending' or v_status='approved' then raise exception 'submission_not_editable'; end if;
    v_id:=p_submission_id;
  else v_id:=gen_random_uuid(); end if;
  insert into public.product_submissions(id,product_id,seller_id,title,slug,description,price,product_type,category_id,initial_stock,digital_file_path,images,status,submitted_at,rejection_reason,reviewed_by,reviewed_at)
  values(v_id,p_product_id,v_user,v_title,v_slug,trim(p_payload->>'description'),v_price,v_type,v_category,v_stock,case when v_type='digital' then v_path end,v_images,
    case when p_submit then 'pending' else 'draft' end,case when p_submit then now() end,null,null,null)
  on conflict(id) do update set product_id=excluded.product_id,title=excluded.title,slug=excluded.slug,description=excluded.description,price=excluded.price,
    product_type=excluded.product_type,category_id=excluded.category_id,initial_stock=excluded.initial_stock,digital_file_path=excluded.digital_file_path,images=excluded.images,
    status=excluded.status,submitted_at=excluded.submitted_at,rejection_reason=null,reviewed_by=null,reviewed_at=null,updated_at=now();
  return v_id;
end; $$;
revoke all on function public.save_product_submission(uuid,uuid,jsonb,boolean) from public,anon;
grant execute on function public.save_product_submission(uuid,uuid,jsonb,boolean) to authenticated;

create or replace function public.admin_review_product_submission(p_submission_id uuid,p_approve boolean,p_reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_sub public.product_submissions%rowtype; v_product_id uuid;
begin
  if not private.is_admin() then raise exception 'admin_required' using errcode='42501'; end if;
  if not p_approve and length(trim(coalesce(p_reason,'')))<3 then raise exception 'rejection_reason_required'; end if;
  select * into v_sub from public.product_submissions where id=p_submission_id and status='pending' for update;
  if not found then raise exception 'submission_not_pending'; end if;
  v_product_id:=v_sub.product_id;
  insert into public.product_submission_reviews(submission_id,reviewer_id,decision,reason)
    values(v_sub.id,(select auth.uid()),case when p_approve then 'approved' else 'rejected' end,coalesce(nullif(trim(p_reason),''),'Approved'));
  if p_approve then
    if v_product_id is null then
      insert into public.products(seller_id,category_id,title,slug,description,price,product_type,images,stock_quantity,digital_file_path,is_active,admin_blocked)
      values(v_sub.seller_id,v_sub.category_id,v_sub.title,v_sub.slug,v_sub.description,v_sub.price,v_sub.product_type,v_sub.images,
        case when v_sub.product_type='physical' then v_sub.initial_stock else 0 end,v_sub.digital_file_path,true,false) returning id into v_product_id;
    else
      update public.products set category_id=v_sub.category_id,title=v_sub.title,description=v_sub.description,price=v_sub.price,product_type=v_sub.product_type,
        images=v_sub.images,digital_file_path=v_sub.digital_file_path,is_active=true,admin_blocked=false,updated_at=now() where id=v_product_id and seller_id=v_sub.seller_id;
      if not found then raise exception 'product_not_found'; end if;
    end if;
    update public.product_submissions set status='approved',reviewed_by=(select auth.uid()),reviewed_at=now(),updated_at=now() where id=v_sub.id;
  else
    update public.product_submissions set status='rejected',rejection_reason=trim(p_reason),reviewed_by=(select auth.uid()),reviewed_at=now(),updated_at=now() where id=v_sub.id;
  end if;
  return v_product_id;
end; $$;
revoke all on function public.admin_review_product_submission(uuid,boolean,text) from public,anon;
grant execute on function public.admin_review_product_submission(uuid,boolean,text) to authenticated;

create or replace function public.seller_set_product_visibility(p_product_id uuid,p_visible boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
  update public.products set is_active=p_visible,updated_at=now() where id=p_product_id and seller_id=(select auth.uid()) and not admin_blocked;
  if not found then raise exception 'product_not_available'; end if;
end; $$;
revoke all on function public.seller_set_product_visibility(uuid,boolean) from public,anon;
grant execute on function public.seller_set_product_visibility(uuid,boolean) to authenticated;

create or replace function public.admin_remove_product(p_product_id uuid,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare v_before jsonb;
begin
  if not private.is_admin() then raise exception 'admin_required' using errcode='42501'; end if;
  if length(trim(coalesce(p_reason,'')))<3 then raise exception 'reason_required'; end if;
  select jsonb_build_object('title',title,'price',price,'is_active',is_active,'admin_blocked',admin_blocked) into v_before
    from public.products where id=p_product_id for update;
  if not found then raise exception 'product_not_found'; end if;
  update public.products set is_active=false,admin_blocked=true,updated_at=now() where id=p_product_id;
  insert into public.admin_audit_log(actor_id,entity_type,entity_id,action,reason,after_state)
    values((select auth.uid()),'product',p_product_id,'remove_listing',trim(p_reason),v_before,'{"is_active":false,"admin_blocked":true}'::jsonb);
end; $$;
revoke all on function public.admin_remove_product(uuid,text) from public,anon;
grant execute on function public.admin_remove_product(uuid,text) to authenticated;

-- Order corrections preserve original payment facts and record each admin action.
create table if not exists public.order_adjustments (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id) on delete restrict,
  replacement_order_id uuid references public.orders(id), kind text not null check(kind in ('financial','items','shipping','status','cancellation')),
  delta_amount bigint not null default 0, status text not null default 'pending' check(status in ('pending','settled','void')),
  reason text not null check(length(trim(reason)) between 3 and 2000), evidence_reference text,
  before_state jsonb not null default '{}', after_state jsonb not null default '{}',
  created_by uuid not null references public.profiles(id), settled_by uuid references public.profiles(id), settled_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists order_adjustments_order_idx on public.order_adjustments(order_id,created_at desc);
alter table public.order_adjustments enable row level security;
alter table public.admin_audit_log enable row level security;
create policy "buyer seller or admin reads order adjustments" on public.order_adjustments for select to authenticated
  using(private.can_read_order(order_id));
create policy "admin reads audit log" on public.admin_audit_log for select to authenticated using((select private.is_admin()));
grant select on public.order_adjustments to authenticated;
grant select on public.admin_audit_log to authenticated;

create or replace function public.admin_update_order_shipping(p_order_id uuid,p_address jsonb,p_phone text,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare v_order public.orders%rowtype; v_shipment public.shipments%rowtype; v_before jsonb; v_after jsonb;
begin
  if not private.is_admin() then raise exception 'admin_required' using errcode='42501'; end if;
  if length(trim(coalesce(p_reason,'')))<3 then raise exception 'reason_required'; end if;
  select * into v_order from public.orders where id=p_order_id for update; if not found then raise exception 'order_not_found'; end if;
  if exists(select 1 from public.shipments where order_id=p_order_id and status in ('shipped','delivered')) then raise exception 'shipment_already_sent'; end if;
  v_before:=jsonb_build_object('shipping_address',v_order.shipping_address,'customer_phone',v_order.customer_phone);
  v_after:=jsonb_build_object('shipping_address',p_address,'customer_phone',nullif(trim(p_phone),''));
  update public.orders set shipping_address=p_address,customer_phone=nullif(trim(p_phone),''),updated_at=now() where id=p_order_id;
  insert into public.order_adjustments(order_id,kind,reason,before_state,after_state,created_by) values(p_order_id,'shipping',trim(p_reason),v_before,v_after,(select auth.uid()));
  insert into public.admin_audit_log(actor_id,entity_type,entity_id,action,reason,before_state,after_state) values((select auth.uid()),'order',p_order_id,'update_shipping',trim(p_reason),v_before,v_after);
end; $$;
revoke all on function public.admin_update_order_shipping(uuid,jsonb,text,text) from public,anon;
grant execute on function public.admin_update_order_shipping(uuid,jsonb,text,text) to authenticated;

create or replace function public.admin_set_shipment_status(p_shipment_id uuid,p_status public.shipment_state,p_carrier text,p_tracking text,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare v_shipment public.shipments%rowtype; v_order uuid; v_before jsonb; v_after jsonb;
begin
  if not private.is_admin() then raise exception 'admin_required' using errcode='42501'; end if;
  if length(trim(coalesce(p_reason,'')))<3 then raise exception 'reason_required'; end if;
  select * into v_shipment from public.shipments where id=p_shipment_id for update; if not found then raise exception 'shipment_not_found'; end if;
  v_order:=v_shipment.order_id; v_before:=jsonb_build_object('status',v_shipment.status,'carrier',v_shipment.carrier,'tracking_number',v_shipment.tracking_number);
  update public.shipments set status=p_status,carrier=nullif(trim(p_carrier),''),tracking_number=nullif(trim(p_tracking),''),
    shipped_at=case when p_status='shipped' then coalesce(shipped_at,now()) else shipped_at end,
    delivered_at=case when p_status='delivered' then coalesce(delivered_at,now()) else delivered_at end where id=p_shipment_id;
  v_after:=jsonb_build_object('status',p_status,'carrier',nullif(trim(p_carrier),''),'tracking_number',nullif(trim(p_tracking),''));
  insert into public.order_adjustments(order_id,kind,reason,before_state,after_state,created_by) values(v_order,'status',trim(p_reason),v_before,v_after,(select auth.uid()));
  insert into public.admin_audit_log(actor_id,entity_type,entity_id,action,reason,before_state,after_state) values((select auth.uid()),'shipment',p_shipment_id,'override_status',trim(p_reason),v_before,v_after);
end; $$;
revoke all on function public.admin_set_shipment_status(uuid,public.shipment_state,text,text,text) from public,anon;
grant execute on function public.admin_set_shipment_status(uuid,public.shipment_state,text,text,text) to authenticated;

create or replace function public.admin_cancel_unpaid_order(p_order_id uuid,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare v_order public.orders%rowtype; v_item record; v_before jsonb;
begin
  if not private.is_admin() then raise exception 'admin_required' using errcode='42501'; end if;
  if length(trim(coalesce(p_reason,'')))<3 then raise exception 'reason_required'; end if;
  select * into v_order from public.orders where id=p_order_id for update; if not found then raise exception 'order_not_found'; end if;
  if v_order.payment_status<>'pending' then raise exception 'paid_order_requires_adjustment'; end if;
  if v_order.payment_method='sepay' and exists(select 1 from public.payment_events where order_id=p_order_id) then raise exception 'transfer_needs_manual_review'; end if;
  for v_item in select product_id,quantity,product_type from public.order_items where order_id=p_order_id loop
    if v_item.product_type='physical' then update public.products set stock_quantity=stock_quantity+v_item.quantity where id=v_item.product_id; end if;
  end loop;
  v_before:=jsonb_build_object('payment_status',v_order.payment_status,'total_amount',v_order.total_amount);
  update public.orders set payment_status='cancelled',cancelled_at=now(),updated_at=now() where id=p_order_id and payment_status='pending';
  update public.shipments set status='cancelled' where order_id=p_order_id and status='pending';
  insert into public.order_adjustments(order_id,kind,reason,before_state,after_state,created_by) values(p_order_id,'cancellation',trim(p_reason),v_before,'{"payment_status":"cancelled"}',(select auth.uid()));
  insert into public.admin_audit_log(actor_id,entity_type,entity_id,action,reason,before_state,after_state) values((select auth.uid()),'order',p_order_id,'cancel_unpaid',trim(p_reason),v_before,'{"payment_status":"cancelled"}');
end; $$;
revoke all on function public.admin_cancel_unpaid_order(uuid,text) from public,anon;
grant execute on function public.admin_cancel_unpaid_order(uuid,text) to authenticated;

create or replace function public.admin_adjust_pending_cod_order(p_order_id uuid,p_items jsonb,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare v_order public.orders%rowtype; v_item jsonb; v_product public.products%rowtype; v_old record; v_seller uuid;
  v_subtotal bigint:=0; v_shipping bigint:=0; v_fee bigint; v_before jsonb; v_after jsonb; v_qty integer;
begin
  if not private.is_admin() then raise exception 'admin_required' using errcode='42501'; end if;
  if length(trim(coalesce(p_reason,'')))<3 or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 or jsonb_array_length(p_items)>50 then raise exception 'invalid_adjustment'; end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found or v_order.payment_method<>'cod' or v_order.payment_status<>'pending' then raise exception 'cod_order_not_editable'; end if;
  if exists(select 1 from public.shipments where order_id=p_order_id and status<>'pending') then raise exception 'shipment_already_started'; end if;
  if exists(select 1 from jsonb_array_elements(p_items) e group by e->>'productId' having count(*)>1) then raise exception 'duplicate_products'; end if;
  v_before:=coalesce((select jsonb_agg(jsonb_build_object('product_id',product_id,'title',product_title,'quantity',quantity,'unit_price',unit_price) order by id) from public.order_items where order_id=p_order_id),'[]'::jsonb);
  for v_old in select i.product_id,i.quantity from public.order_items i where i.order_id=p_order_id order by i.product_id loop
    update public.products set stock_quantity=stock_quantity+v_old.quantity where id=v_old.product_id;
  end loop;
  for v_item in select value from jsonb_array_elements(p_items) order by value->>'productId' loop
    v_qty:=(v_item->>'quantity')::integer;
    if v_qty<1 or v_qty>99 then raise exception 'invalid_quantity'; end if;
    select * into v_product from public.products where id=(v_item->>'productId')::uuid and is_active and not admin_blocked for update;
    if not found or v_product.product_type<>'physical' then raise exception 'product_unavailable'; end if;
    if v_product.stock_quantity<v_qty then raise exception 'insufficient_stock'; end if;
    if v_seller is null then v_seller:=v_product.seller_id; elsif v_seller<>v_product.seller_id then raise exception 'cod_single_seller_only'; end if;
    v_subtotal:=v_subtotal+v_product.price*v_qty;
  end loop;
  select physical_seller_shipping_fee into v_fee from public.marketplace_settings where id=true;
  v_shipping:=coalesce(v_fee,0);
  delete from public.seller_reconciliations where order_item_id in (select id from public.order_items where order_id=p_order_id);
  delete from public.digital_entitlements where order_item_id in (select id from public.order_items where order_id=p_order_id);
  delete from public.shipments where order_id=p_order_id;
  delete from public.order_items where order_id=p_order_id;
  for v_item in select value from jsonb_array_elements(p_items) order by value->>'productId' loop
    v_qty:=(v_item->>'quantity')::integer;
    select * into v_product from public.products where id=(v_item->>'productId')::uuid for update;
    update public.products set stock_quantity=stock_quantity-v_qty where id=v_product.id;
    insert into public.order_items(order_id,product_id,seller_id,product_title,product_type,quantity,unit_price)
      values(p_order_id,v_product.id,v_product.seller_id,v_product.title,v_product.product_type,v_qty,v_product.price) returning seller_id into v_seller;
    insert into public.seller_reconciliations(order_item_id,seller_id,gross_amount)
      select id,v_product.seller_id,v_product.price*v_qty from public.order_items where order_id=p_order_id and product_id=v_product.id;
  end loop;
  insert into public.shipments(order_id,seller_id,shipping_fee) values(p_order_id,v_seller,v_shipping);
  update public.orders set subtotal=v_subtotal,shipping_total=v_shipping,total_amount=v_subtotal+v_shipping,updated_at=now() where id=p_order_id;
  v_after:=coalesce((select jsonb_agg(jsonb_build_object('product_id',product_id,'title',product_title,'quantity',quantity,'unit_price',unit_price) order by id) from public.order_items where order_id=p_order_id),'[]'::jsonb);
  insert into public.order_adjustments(order_id,kind,delta_amount,reason,before_state,after_state,created_by)
    values(p_order_id,'items',v_subtotal+v_shipping-v_order.total_amount,trim(p_reason),v_before,v_after,(select auth.uid()));
  insert into public.admin_audit_log(actor_id,entity_type,entity_id,action,reason,before_state,after_state)
    values((select auth.uid()),'order',p_order_id,'adjust_pending_cod',trim(p_reason),v_before,v_after);
end; $$;
revoke all on function public.admin_adjust_pending_cod_order(uuid,jsonb,text) from public,anon;
grant execute on function public.admin_adjust_pending_cod_order(uuid,jsonb,text) to authenticated;

create or replace function public.admin_reissue_pending_sepay_order(p_order_id uuid,p_items jsonb,p_reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_order public.orders%rowtype; v_item jsonb; v_product public.products%rowtype; v_old record; v_new uuid;
  v_sellers uuid[]:='{}'; v_seller uuid; v_subtotal bigint:=0; v_shipping bigint:=0; v_fee bigint; v_has_physical boolean:=false; v_has_digital boolean:=false; v_qty integer;
begin
  if not private.is_admin() then raise exception 'admin_required' using errcode='42501'; end if;
  if length(trim(coalesce(p_reason,'')))<3 or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 or jsonb_array_length(p_items)>50 then raise exception 'invalid_adjustment'; end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found or v_order.payment_method<>'sepay' or v_order.payment_status<>'pending' then raise exception 'sepay_order_not_editable'; end if;
  if exists(select 1 from public.shipments where order_id=p_order_id and status<>'pending') then raise exception 'shipment_already_started'; end if;
  if exists(select 1 from jsonb_array_elements(p_items) e group by e->>'productId' having count(*)>1) then raise exception 'duplicate_products'; end if;
  for v_old in select i.product_id,i.quantity,i.product_type from public.order_items i where i.order_id=p_order_id order by i.product_id loop
    if v_old.product_type='physical' then update public.products set stock_quantity=stock_quantity+v_old.quantity where id=v_old.product_id; end if;
  end loop;
  for v_item in select value from jsonb_array_elements(p_items) order by value->>'productId' loop
    v_qty:=(v_item->>'quantity')::integer; if v_qty<1 or v_qty>99 then raise exception 'invalid_quantity'; end if;
    select * into v_product from public.products where id=(v_item->>'productId')::uuid and is_active and not admin_blocked for update;
    if not found or not exists(select 1 from public.profiles p where p.id=v_product.seller_id and p.role='seller') then raise exception 'product_unavailable'; end if;
    if v_product.product_type='physical' and v_product.stock_quantity<v_qty then raise exception 'insufficient_stock'; end if;
    v_has_physical:=v_has_physical or v_product.product_type='physical'; v_has_digital:=v_has_digital or v_product.product_type='digital';
    v_subtotal:=v_subtotal+v_product.price*v_qty;
    if not v_product.seller_id=any(v_sellers) then v_sellers:=array_append(v_sellers,v_product.seller_id); end if;
  end loop;
  select physical_seller_shipping_fee into v_fee from public.marketplace_settings where id=true;
  if v_has_physical then select count(distinct p.seller_id)*coalesce(v_fee,0) into v_shipping from public.products p join jsonb_array_elements(p_items) e on p.id=(e->>'productId')::uuid where p.product_type='physical'; end if;
  update public.orders set payment_status='cancelled',cancelled_at=now(),updated_at=now() where id=p_order_id and payment_status='pending';
  update public.shipments set status='cancelled' where order_id=p_order_id and status='pending';
  insert into public.orders(buyer_id,customer_name,customer_email,customer_phone,shipping_address,payment_method,payment_status,subtotal,shipping_total,total_amount,expires_at)
  values(v_order.buyer_id,v_order.customer_name,v_order.customer_email,v_order.customer_phone,v_order.shipping_address,'sepay','pending',v_subtotal,v_shipping,v_subtotal+v_shipping,now()+interval '24 hours') returning id into v_new;
  for v_item in select value from jsonb_array_elements(p_items) order by value->>'productId' loop
    v_qty:=(v_item->>'quantity')::integer; select * into v_product from public.products where id=(v_item->>'productId')::uuid for update;
    if v_product.product_type='physical' then update public.products set stock_quantity=stock_quantity-v_qty where id=v_product.id; end if;
    insert into public.order_items(order_id,product_id,seller_id,product_title,product_type,quantity,unit_price)
      values(v_new,v_product.id,v_product.seller_id,v_product.title,v_product.product_type,v_qty,v_product.price);
    insert into public.seller_reconciliations(order_item_id,seller_id,gross_amount)
      select id,v_product.seller_id,v_product.price*v_qty from public.order_items where order_id=v_new and product_id=v_product.id;
    if v_product.product_type='digital' then
      insert into public.digital_entitlements(order_item_id,buyer_id,product_id,storage_path)
      select id,v_order.buyer_id,v_product.id,v_product.digital_file_path from public.order_items where order_id=v_new and product_id=v_product.id;
    end if;
  end loop;
  foreach v_seller in array v_sellers loop
    if exists(select 1 from public.order_items where order_id=v_new and seller_id=v_seller and product_type='physical') then insert into public.shipments(order_id,seller_id,shipping_fee) values(v_new,v_seller,coalesce(v_fee,0)); end if;
  end loop;
  insert into public.order_adjustments(order_id,replacement_order_id,kind,delta_amount,reason,before_state,after_state,created_by)
    values(p_order_id,v_new,'items',v_subtotal+v_shipping-v_order.total_amount,trim(p_reason),jsonb_build_object('order_code',v_order.order_code,'total',v_order.total_amount),jsonb_build_object('replacement_order_id',v_new,'total',v_subtotal+v_shipping),(select auth.uid()));
  insert into public.admin_audit_log(actor_id,entity_type,entity_id,action,reason,before_state,after_state)
    values((select auth.uid()),'order',p_order_id,'reissue_sepay_order',trim(p_reason),jsonb_build_object('total',v_order.total_amount),jsonb_build_object('replacement_order_id',v_new,'total',v_subtotal+v_shipping));
  return v_new;
end; $$;
revoke all on function public.admin_reissue_pending_sepay_order(uuid,jsonb,text) from public,anon;
grant execute on function public.admin_reissue_pending_sepay_order(uuid,jsonb,text) to authenticated;

create or replace function public.admin_settle_order_adjustment(p_adjustment_id uuid,p_reference text) returns void
language plpgsql security definer set search_path='' as $$
declare v_adjustment public.order_adjustments%rowtype;
begin
  if not private.is_admin() then raise exception 'admin_required' using errcode='42501'; end if;
  if length(trim(coalesce(p_reference,'')))<3 then raise exception 'settlement_reference_required'; end if;
  select * into v_adjustment from public.order_adjustments where id=p_adjustment_id for update;
  if not found or v_adjustment.status<>'pending' then raise exception 'adjustment_not_pending'; end if;
  update public.order_adjustments set status='settled',evidence_reference=trim(p_reference),settled_by=(select auth.uid()),settled_at=now()
    where id=p_adjustment_id and status='pending';
  if not found then raise exception 'adjustment_not_pending'; end if;
  insert into public.admin_audit_log(actor_id,entity_type,entity_id,action,reason,before_state,after_state)
    values((select auth.uid()),'order_adjustment',p_adjustment_id,'settle',trim(p_reference),jsonb_build_object('status',v_adjustment.status),jsonb_build_object('status','settled'));
end; $$;
revoke all on function public.admin_settle_order_adjustment(uuid,text) from public,anon;
grant execute on function public.admin_settle_order_adjustment(uuid,text) to authenticated;

create or replace function public.create_marketplace_order(
  p_items jsonb,p_customer jsonb,p_payment_method public.order_payment_method
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_order uuid; v_user uuid := (select auth.uid()); v_item jsonb; v_product public.products%rowtype; v_qty integer;
  v_subtotal bigint:=0; v_shipping bigint:=0; v_fee bigint; v_has_physical boolean:=false; v_has_digital boolean:=false;
  v_sellers uuid[]:='{}'; v_seller uuid; v_item_id uuid; v_address jsonb;
begin
  if v_user is null then raise exception 'authentication_required' using errcode='28000'; end if;
  if p_payment_method not in ('sepay','cod') then raise exception 'payment_method_unavailable'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 or jsonb_array_length(p_items)>50 then raise exception 'invalid_items'; end if;
  if coalesce(length(trim(p_customer->>'name')),0)<2 or coalesce(length(trim(p_customer->>'email')),0)<3 then raise exception 'invalid_customer'; end if;
  v_address:=p_customer->'address';
  if exists(select 1 from jsonb_array_elements(p_items) e group by e->>'productId' having count(*)>1) then raise exception 'duplicate_products'; end if;
  for v_item in select value from jsonb_array_elements(p_items) order by value->>'productId' loop
    v_qty:=(v_item->>'quantity')::integer; if v_qty<1 or v_qty>99 then raise exception 'invalid_quantity'; end if;
    select * into v_product from public.products where id=(v_item->>'productId')::uuid and is_active and not admin_blocked for update;
    if not found then raise exception 'product_unavailable'; end if;
    if not exists(select 1 from public.profiles p where p.id=v_product.seller_id and p.role='seller') or not exists(select 1 from public.shops s where s.seller_id=v_product.seller_id and s.is_active) then raise exception 'seller_unavailable'; end if;
    if v_product.product_type='physical' and v_product.stock_quantity<v_qty then raise exception 'insufficient_stock'; end if;
    if v_product.product_type='digital' then v_has_digital:=true; else v_has_physical:=true; end if;
    v_subtotal:=v_subtotal+v_product.price*v_qty;
    if not v_product.seller_id=any(v_sellers) then v_sellers:=array_append(v_sellers,v_product.seller_id); end if;
  end loop;
  if v_has_physical and (jsonb_typeof(v_address)<>'object' or coalesce(length(trim(v_address->>'phone')),0)<7
      or coalesce(length(trim(v_address->>'province')),0)<2 or coalesce(length(trim(v_address->>'district')),0)<2
      or coalesce(length(trim(v_address->>'ward')),0)<2 or coalesce(length(trim(v_address->>'address_line')),0)<4) then raise exception 'shipping_required'; end if;
  if p_payment_method='cod' and (v_has_digital or not v_has_physical) then raise exception 'cod_physical_only'; end if;
  if p_payment_method='cod' and cardinality(v_sellers)<>1 then raise exception 'cod_single_seller_only'; end if;
  select physical_seller_shipping_fee into v_fee from public.marketplace_settings where id=true;
  if v_has_physical then select count(distinct p.seller_id)*v_fee into v_shipping from public.products p join jsonb_array_elements(p_items) e on p.id=(e->>'productId')::uuid where p.product_type='physical'; end if;
  insert into public.orders(buyer_id,customer_name,customer_email,customer_phone,shipping_address,payment_method,payment_status,subtotal,shipping_total,total_amount,expires_at)
  values(v_user,trim(p_customer->>'name'),lower(trim(p_customer->>'email')),case when v_has_physical then trim(v_address->>'phone') else null end,
    case when v_has_physical then v_address else null end,p_payment_method,'pending',v_subtotal,v_shipping,v_subtotal+v_shipping,
    case when p_payment_method='sepay' then now()+interval '24 hours' end) returning id into v_order;
  for v_item in select value from jsonb_array_elements(p_items) order by value->>'productId' loop
    v_qty:=(v_item->>'quantity')::integer; select * into v_product from public.products where id=(v_item->>'productId')::uuid;
    insert into public.order_items(order_id,product_id,seller_id,product_title,product_type,quantity,unit_price)
      values(v_order,v_product.id,v_product.seller_id,v_product.title,v_product.product_type,v_qty,v_product.price) returning id into v_item_id;
    if v_product.product_type='physical' then update public.products set stock_quantity=stock_quantity-v_qty where id=v_product.id; end if;
    if v_product.product_type='digital' then insert into public.digital_entitlements(order_item_id,buyer_id,product_id,storage_path) values(v_item_id,v_user,v_product.id,v_product.digital_file_path); end if;
    insert into public.seller_reconciliations(order_item_id,seller_id,gross_amount) values(v_item_id,v_product.seller_id,v_product.price*v_qty);
  end loop;
  foreach v_seller in array v_sellers loop
    if exists(select 1 from public.order_items where order_id=v_order and seller_id=v_seller and product_type='physical') then insert into public.shipments(order_id,seller_id,shipping_fee) values(v_order,v_seller,v_fee); end if;
  end loop;
  return v_order;
end; $$;
revoke all on function public.create_marketplace_order(jsonb,jsonb,public.order_payment_method) from public,anon;
grant execute on function public.create_marketplace_order(jsonb,jsonb,public.order_payment_method) to authenticated;

-- Admin read access is already granted to authenticated, but order ownership
-- policies remain in force. Public-facing accounts only see their own rows.
-- Public profile image bucket; each object remains scoped to its owner folder.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('profile-avatars','profile-avatars',true,2097152,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy "user uploads own avatar" on storage.objects for insert to authenticated
  with check(bucket_id='profile-avatars' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "user updates own avatar" on storage.objects for update to authenticated
  using(bucket_id='profile-avatars' and (storage.foldername(name))[1]=(select auth.uid())::text)
  with check(bucket_id='profile-avatars' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "user deletes own avatar" on storage.objects for delete to authenticated
  using(bucket_id='profile-avatars' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "public reads avatars" on storage.objects for select to anon,authenticated using(bucket_id='profile-avatars');

grant select on public.seller_application_payout_accounts,public.seller_application_reviews,public.product_submissions,public.product_submission_reviews,public.order_adjustments,public.admin_audit_log to authenticated;
