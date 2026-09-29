create extension if not exists pgcrypto;
create schema if not exists private;

create type public.user_role as enum ('buyer','seller','admin');
create type public.product_kind as enum ('physical','digital');
create type public.order_payment_method as enum ('payos','cod');
create type public.payment_state as enum ('pending','paid','failed','cancelled');
create type public.seller_application_state as enum ('pending','approved','rejected');
create type public.shipment_state as enum ('pending','ready_to_ship','shipped','delivered','cancelled');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  phone text,
  role public.user_role not null default 'buyer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.categories (
  id uuid primary key default gen_random_uuid(), slug text not null unique,
  name jsonb not null, icon text, created_at timestamptz not null default now()
);
create table public.seller_applications (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  shop_name text not null, description text, contact_phone text not null,
  status public.seller_application_state not null default 'pending', reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz, created_at timestamptz not null default now(), unique(user_id)
);
create table public.products (
  id uuid primary key default gen_random_uuid(), seller_id uuid not null references public.profiles(id),
  category_id uuid references public.categories(id) on delete set null, title text not null, slug text not null unique,
  description text not null default '', price bigint not null check(price>0), product_type public.product_kind not null,
  images text[] not null default '{}', stock_quantity integer not null default 0 check(stock_quantity>=0),
  digital_file_path text, is_active boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check ((product_type='digital' and digital_file_path is not null) or product_type='physical')
);
create table public.marketplace_settings (
  id boolean primary key default true check (id), physical_seller_shipping_fee bigint not null default 30000 check(physical_seller_shipping_fee>=0),
  updated_at timestamptz not null default now()
);
insert into public.marketplace_settings(id,physical_seller_shipping_fee) values(true,30000) on conflict(id) do nothing;
create table public.orders (
  id uuid primary key default gen_random_uuid(), order_code bigint generated always as identity unique,
  buyer_id uuid not null references public.profiles(id), customer_name text not null, customer_email text not null,
  customer_phone text, shipping_address jsonb, payment_method public.order_payment_method not null,
  payment_status public.payment_state not null default 'pending', subtotal bigint not null check(subtotal>=0),
  shipping_total bigint not null default 0 check(shipping_total>=0), total_amount bigint not null check(total_amount>=0),
  payos_order_code bigint unique, payos_payment_link_id text, paid_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check(total_amount=subtotal+shipping_total)
);
create table public.order_items (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict, seller_id uuid not null references public.profiles(id),
  product_title text not null, product_type public.product_kind not null, quantity integer not null check(quantity>0),
  unit_price bigint not null check(unit_price>0), created_at timestamptz not null default now()
);
create table public.shipments (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id) on delete cascade,
  seller_id uuid not null references public.profiles(id), status public.shipment_state not null default 'pending',
  shipping_fee bigint not null check(shipping_fee>=0), carrier text, tracking_number text, shipped_at timestamptz,
  delivered_at timestamptz, created_at timestamptz not null default now(), unique(order_id,seller_id)
);
create table public.payment_events (
  id uuid primary key default gen_random_uuid(), provider text not null, provider_event_id text not null,
  order_id uuid references public.orders(id), order_code bigint, amount bigint not null, payload jsonb not null default '{}',
  processed_at timestamptz, created_at timestamptz not null default now(), unique(provider,provider_event_id)
);
create table public.digital_entitlements (
  id uuid primary key default gen_random_uuid(), order_item_id uuid not null references public.order_items(id) on delete cascade,
  buyer_id uuid not null references public.profiles(id) on delete cascade, product_id uuid not null references public.products(id),
  storage_path text not null, granted_at timestamptz not null default now(), unique(order_item_id)
);
create table public.reviews (
  id uuid primary key default gen_random_uuid(), product_id uuid not null references public.products(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade, rating integer not null check(rating between 1 and 5),
  comment text, created_at timestamptz not null default now(), unique(product_id,user_id)
);
create table public.seller_reconciliations (
  id uuid primary key default gen_random_uuid(), order_item_id uuid not null unique references public.order_items(id),
  seller_id uuid not null references public.profiles(id), gross_amount bigint not null check(gross_amount>=0),
  commission_amount bigint not null default 0 check(commission_amount=0), status text not null default 'pending' check(status in ('pending','reconciled')),
  reconciled_by uuid references public.profiles(id), reconciled_at timestamptz, created_at timestamptz not null default now()
);

create or replace function private.is_admin() returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin')
$$;
revoke all on function private.is_admin() from public,anon;
grant usage on schema private to authenticated;
grant execute on function private.is_admin() to authenticated;

create or replace function private.handle_new_user() returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.profiles(id,full_name,avatar_url) values(new.id,coalesce(new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'name'),new.raw_user_meta_data->>'avatar_url') on conflict(id) do nothing;
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.handle_new_user();

create or replace function public.create_marketplace_order(
  p_items jsonb,p_customer jsonb,p_payment_method public.order_payment_method
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_order uuid; v_user uuid:=auth.uid(); v_item jsonb; v_product public.products%rowtype; v_qty integer;
  v_subtotal bigint:=0; v_shipping bigint:=0; v_fee bigint; v_has_physical boolean:=false; v_has_digital boolean:=false;
  v_sellers uuid[]:='{}'; v_seller uuid; v_item_id uuid;
begin
  if v_user is null then raise exception 'authentication_required' using errcode='28000'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 or jsonb_array_length(p_items)>50 then raise exception 'invalid_items'; end if;
  if coalesce(length(trim(p_customer->>'name')),0)<2 or coalesce(length(trim(p_customer->>'email')),0)<3 then raise exception 'invalid_customer'; end if;
  if exists(select 1 from jsonb_array_elements(p_items) e group by e->>'productId' having count(*)>1) then raise exception 'duplicate_products'; end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty:=(v_item->>'quantity')::integer;
    if v_qty<1 or v_qty>99 then raise exception 'invalid_quantity'; end if;
    select * into v_product from public.products where id=(v_item->>'productId')::uuid and is_active=true for update;
    if not found then raise exception 'product_unavailable'; end if;
    if not exists(select 1 from public.profiles p where p.id=v_product.seller_id and p.role='seller') then raise exception 'seller_unavailable'; end if;
    if v_product.product_type='physical' and v_product.stock_quantity<v_qty then raise exception 'insufficient_stock'; end if;
    if v_product.product_type='digital' then v_has_digital:=true; else v_has_physical:=true; end if;
    v_subtotal:=v_subtotal+v_product.price*v_qty;
    if not v_product.seller_id=any(v_sellers) then v_sellers:=array_append(v_sellers,v_product.seller_id); end if;
  end loop;
  if v_has_physical and (coalesce(length(trim(p_customer->>'phone')),0)<7 or coalesce(length(trim(p_customer->>'address')),0)<8) then raise exception 'shipping_required'; end if;
  if p_payment_method='cod' and v_has_digital then raise exception 'cod_not_allowed_for_digital'; end if;
  if not v_has_physical and p_payment_method='cod' then raise exception 'cod_not_allowed_for_digital'; end if;
  select physical_seller_shipping_fee into v_fee from public.marketplace_settings where id=true;
  if v_has_physical then
    select count(distinct p.seller_id)*v_fee into v_shipping from public.products p join jsonb_array_elements(p_items) e on p.id=(e->>'productId')::uuid where p.product_type='physical';
  end if;
  insert into public.orders(buyer_id,customer_name,customer_email,customer_phone,shipping_address,payment_method,subtotal,shipping_total,total_amount)
  values(v_user,trim(p_customer->>'name'),lower(trim(p_customer->>'email')),nullif(trim(p_customer->>'phone'),''),case when v_has_physical then jsonb_build_object('address',trim(p_customer->>'address')) else null end,p_payment_method,v_subtotal,v_shipping,v_subtotal+v_shipping) returning id into v_order;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty:=(v_item->>'quantity')::integer;
    select * into v_product from public.products where id=(v_item->>'productId')::uuid;
    insert into public.order_items(order_id,product_id,seller_id,product_title,product_type,quantity,unit_price)
    values(v_order,v_product.id,v_product.seller_id,v_product.title,v_product.product_type,v_qty,v_product.price) returning id into v_item_id;
    if v_product.product_type='physical' then update public.products set stock_quantity=stock_quantity-v_qty where id=v_product.id; end if;
    if v_product.product_type='digital' then
      insert into public.digital_entitlements(order_item_id,buyer_id,product_id,storage_path)
      values(v_item_id,v_user,v_product.id,v_product.digital_file_path);
    end if;
    insert into public.seller_reconciliations(order_item_id,seller_id,gross_amount) values(v_item_id,v_product.seller_id,v_product.price*v_qty);
  end loop;
  foreach v_seller in array v_sellers loop
    if exists(select 1 from public.order_items where order_id=v_order and seller_id=v_seller and product_type='physical') then
      insert into public.shipments(order_id,seller_id,shipping_fee) values(v_order,v_seller,v_fee);
    end if;
  end loop;
  return v_order;
end; $$;
revoke all on function public.create_marketplace_order(jsonb,jsonb,public.order_payment_method) from public,anon;
grant execute on function public.create_marketplace_order(jsonb,jsonb,public.order_payment_method) to authenticated;

create or replace function public.confirm_payos_payment(p_order_code bigint,p_amount bigint,p_event_id text,p_payload jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare v_order public.orders%rowtype; v_new integer;
begin
  insert into public.payment_events(provider,provider_event_id,order_code,amount,payload)
  values('payos',p_event_id,p_order_code,p_amount,coalesce(p_payload,'{}')) on conflict(provider,provider_event_id) do nothing;
  get diagnostics v_new=row_count;
  if not v_new then return true; end if;
  select * into v_order from public.orders where order_code=p_order_code for update;
  if not found or v_order.total_amount<>p_amount or v_order.payment_method<>'payos' then raise exception 'payment_mismatch'; end if;
  if v_order.payment_status='paid' then update public.payment_events set processed_at=now(),order_id=v_order.id where provider='payos' and provider_event_id=p_event_id; return true; end if;
  update public.orders set payment_status='paid',paid_at=now(),updated_at=now() where id=v_order.id;
  update public.payment_events set order_id=v_order.id,processed_at=now() where provider='payos' and provider_event_id=p_event_id;
  return true;
end; $$;
revoke all on function public.confirm_payos_payment(bigint,bigint,text,jsonb) from public,anon,authenticated;

create or replace function public.is_order_paid(p_order_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.orders o where o.id=p_order_id and o.payment_status='paid')
$$;
revoke all on function public.is_order_paid(uuid) from public,anon;
grant execute on function public.is_order_paid(uuid) to authenticated;

create or replace function public.admin_review_seller_application(p_application_id uuid,p_approve boolean) returns void
language plpgsql security definer set search_path='' as $$
declare v_user uuid;
begin
  if not private.is_admin() then raise exception 'admin_required' using errcode='42501'; end if;
  update public.seller_applications set status=case when p_approve then 'approved'::public.seller_application_state else 'rejected'::public.seller_application_state end,
    reviewed_by=auth.uid(),reviewed_at=now() where id=p_application_id and status='pending' returning user_id into v_user;
  if v_user is null then raise exception 'application_not_pending'; end if;
  if p_approve then update public.profiles set role='seller',updated_at=now() where id=v_user; end if;
end; $$;
revoke all on function public.admin_review_seller_application(uuid,boolean) from public,anon;
grant execute on function public.admin_review_seller_application(uuid,boolean) to authenticated;

create or replace function public.set_payos_payment_link(p_order_id uuid,p_order_code bigint,p_link_id text) returns void
language plpgsql security definer set search_path='' as $$
begin
  update public.orders set payos_order_code=p_order_code,payos_payment_link_id=p_link_id,updated_at=now()
  where id=p_order_id and buyer_id=auth.uid() and payment_method='payos' and payment_status='pending';
  if not found then raise exception 'order_not_pending'; end if;
end; $$;
revoke all on function public.set_payos_payment_link(uuid,bigint,text) from public,anon;
grant execute on function public.set_payos_payment_link(uuid,bigint,text) to authenticated;

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.seller_applications enable row level security;
alter table public.products enable row level security;
alter table public.marketplace_settings enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.shipments enable row level security;
alter table public.payment_events enable row level security;
alter table public.digital_entitlements enable row level security;
alter table public.reviews enable row level security;
alter table public.seller_reconciliations enable row level security;

create policy "profiles readable by self or admin" on public.profiles for select to authenticated using(id=auth.uid() or private.is_admin());
create policy "profiles update self" on public.profiles for update to authenticated using(id=auth.uid() or private.is_admin()) with check(id=auth.uid() or private.is_admin());
create policy "categories public read" on public.categories for select to anon,authenticated using(true);
create policy "categories admin manage" on public.categories for all to authenticated using(private.is_admin()) with check(private.is_admin());
create policy "seller applications create self" on public.seller_applications for insert to authenticated with check(user_id=auth.uid() and status='pending');
create policy "seller applications own or admin read" on public.seller_applications for select to authenticated using(user_id=auth.uid() or private.is_admin());
create policy "seller application admin update" on public.seller_applications for update to authenticated using(private.is_admin()) with check(private.is_admin());
create policy "active products public read" on public.products for select to anon,authenticated using(is_active=true or seller_id=auth.uid() or private.is_admin());
create policy "seller products insert" on public.products for insert to authenticated with check(seller_id=auth.uid() and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='seller'));
create policy "seller products update" on public.products for update to authenticated using(seller_id=auth.uid() or private.is_admin()) with check(seller_id=auth.uid() or private.is_admin());
create policy "seller products delete" on public.products for delete to authenticated using(seller_id=auth.uid() or private.is_admin());
create policy "settings readable" on public.marketplace_settings for select to authenticated using(true);
create policy "settings admin manage" on public.marketplace_settings for all to authenticated using(private.is_admin()) with check(private.is_admin());
create policy "buyer or admin orders read" on public.orders for select to authenticated using(buyer_id=auth.uid() or private.is_admin());
create policy "seller or buyer or admin items read" on public.order_items for select to authenticated using(seller_id=auth.uid() or exists(select 1 from public.orders o where o.id=order_id and o.buyer_id=auth.uid()) or private.is_admin());
create policy "seller or buyer or admin shipments read" on public.shipments for select to authenticated using(seller_id=auth.uid() or exists(select 1 from public.orders o where o.id=order_id and o.buyer_id=auth.uid()) or private.is_admin());
create policy "seller updates shipment" on public.shipments for update to authenticated using(seller_id=auth.uid()) with check(seller_id=auth.uid());
create policy "admin sees payment events" on public.payment_events for select to authenticated using(private.is_admin());
create policy "buyer or seller or admin entitlement read" on public.digital_entitlements for select to authenticated using(buyer_id=auth.uid() or exists(select 1 from public.products p where p.id=product_id and p.seller_id=auth.uid()) or private.is_admin());
create policy "reviews public read" on public.reviews for select to anon,authenticated using(true);
create policy "buyer creates own review" on public.reviews for insert to authenticated with check(user_id=auth.uid() and exists(select 1 from public.order_items i join public.orders o on o.id=i.order_id where i.product_id=reviews.product_id and o.buyer_id=auth.uid() and o.payment_status='paid'));
create policy "buyer edits own review" on public.reviews for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy "buyer removes own review" on public.reviews for delete to authenticated using(user_id=auth.uid());
create policy "seller or admin reconciliation read" on public.seller_reconciliations for select to authenticated using(seller_id=auth.uid() or private.is_admin());
create policy "admin updates reconciliation" on public.seller_reconciliations for update to authenticated using(private.is_admin()) with check(private.is_admin());

grant select on public.categories,public.products,public.reviews to anon,authenticated;
grant select on public.profiles to authenticated;
grant update(full_name,avatar_url,phone) on public.profiles to authenticated;
grant select,insert,update,delete on public.products to authenticated;
grant select,insert,update,delete on public.reviews to authenticated;
grant select,insert,update on public.seller_applications to authenticated;
grant select on public.orders,public.order_items,public.shipments,public.digital_entitlements,public.seller_reconciliations,public.marketplace_settings to authenticated;
grant update(status,carrier,tracking_number,shipped_at,delivered_at) on public.shipments to authenticated;
grant update(status,reconciled_by,reconciled_at) on public.seller_reconciliations to authenticated;

insert into storage.buckets(id,name,public) values('product-images','product-images',true) on conflict(id) do nothing;
insert into storage.buckets(id,name,public) values('digital-assets','digital-assets',false) on conflict(id) do nothing;
create policy "public product image reads" on storage.objects for select to anon,authenticated using(bucket_id='product-images');
create policy "seller manages own product images" on storage.objects for insert to authenticated with check(bucket_id='product-images' and (storage.foldername(name))[1]=auth.uid()::text and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='seller'));
create policy "seller reads own digital assets" on storage.objects for select to authenticated using(bucket_id='digital-assets' and (storage.foldername(name))[1]=auth.uid()::text and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='seller'));
create policy "buyer downloads paid entitlement" on storage.objects for select to authenticated using(bucket_id='digital-assets' and exists(select 1 from public.digital_entitlements e join public.order_items i on i.id=e.order_item_id join public.orders o on o.id=i.order_id where e.buyer_id=auth.uid() and e.storage_path=name and o.payment_status='paid'));
create policy "seller manages own digital uploads" on storage.objects for insert to authenticated with check(bucket_id='digital-assets' and (storage.foldername(name))[1]=auth.uid()::text and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='seller'));
