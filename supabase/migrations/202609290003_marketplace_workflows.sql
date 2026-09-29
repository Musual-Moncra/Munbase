-- Keep user submitted applications from setting review metadata.
revoke insert,update on public.seller_applications from authenticated;
grant select on public.seller_applications to authenticated;
grant insert(user_id,shop_name,description,contact_phone) on public.seller_applications to authenticated;
grant update(status,reviewed_by,reviewed_at) on public.seller_applications to authenticated;

-- A digital product can only reference a file uploaded in its seller's own folder.
drop policy if exists "seller products insert" on public.products;
create policy "seller products insert" on public.products for insert to authenticated
  with check(seller_id=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='seller')
    and (product_type<>'digital' or (storage.foldername(digital_file_path))[1]=(select auth.uid())::text));
drop policy if exists "seller products update" on public.products;
create policy "seller products update" on public.products for update to authenticated
  using(seller_id=(select auth.uid()) or private.is_admin())
  with check((seller_id=(select auth.uid()) or private.is_admin()) and (product_type<>'digital' or (storage.foldername(digital_file_path))[1]=seller_id::text));

-- Sellers can read address and contact details only for orders containing their products.
create policy "seller reads own fulfillment orders" on public.orders for select to authenticated
  using(exists(select 1 from public.order_items i where i.order_id=orders.id and i.seller_id=(select auth.uid())));

-- Avoid overlapping public read and admin write policies.
drop policy if exists "categories admin write" on public.categories;
create policy "categories admin insert" on public.categories for insert to authenticated with check(private.is_admin());
create policy "categories admin update" on public.categories for update to authenticated using(private.is_admin()) with check(private.is_admin());
create policy "categories admin delete" on public.categories for delete to authenticated using(private.is_admin());
drop policy if exists "settings admin manage" on public.marketplace_settings;
create policy "settings admin insert" on public.marketplace_settings for insert to authenticated with check(private.is_admin());
create policy "settings admin update" on public.marketplace_settings for update to authenticated using(private.is_admin()) with check(private.is_admin());
create policy "settings admin delete" on public.marketplace_settings for delete to authenticated using(private.is_admin());
grant update(physical_seller_shipping_fee) on public.marketplace_settings to authenticated;

-- Enforce seller shipment progression in one checked server-side operation.
drop policy if exists "seller updates shipment" on public.shipments;
revoke update(status,carrier,tracking_number,shipped_at,delivered_at) on public.shipments from authenticated;
create or replace function public.seller_update_shipment(p_shipment_id uuid,p_status public.shipment_state,p_carrier text,p_tracking_number text) returns void
language plpgsql security definer set search_path='' as $$
declare v_status public.shipment_state;
begin
  select status into v_status from public.shipments where id=p_shipment_id and seller_id=(select auth.uid()) for update;
  if not found then raise exception 'shipment_not_found'; end if;
  if p_status not in ('ready_to_ship','shipped','delivered') then raise exception 'invalid_shipment_status'; end if;
  if (v_status='pending' and p_status<>'ready_to_ship') or (v_status='ready_to_ship' and p_status<>'shipped') or (v_status='shipped' and p_status<>'delivered') or v_status in ('delivered','cancelled') then raise exception 'invalid_status_transition'; end if;
  if p_status='shipped' and coalesce(length(trim(p_tracking_number)),0)<3 then raise exception 'tracking_number_required'; end if;
  update public.shipments set status=p_status,carrier=nullif(trim(p_carrier),''),tracking_number=nullif(trim(p_tracking_number),''),
    shipped_at=case when p_status='shipped' then now() else shipped_at end,
    delivered_at=case when p_status='delivered' then now() else delivered_at end where id=p_shipment_id;
end; $$;
revoke all on function public.seller_update_shipment(uuid,public.shipment_state,text,text) from public,anon;
grant execute on function public.seller_update_shipment(uuid,public.shipment_state,text,text) to authenticated;

-- Reconcile only completed COD deliveries or orders confirmed paid through PayOS.
drop policy if exists "admin updates reconciliation" on public.seller_reconciliations;
revoke update(status,reconciled_by,reconciled_at) on public.seller_reconciliations from authenticated;
create or replace function public.admin_mark_reconciled(p_reconciliation_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v_order public.orders%rowtype; v_seller uuid;
begin
  if not private.is_admin() then raise exception 'admin_required' using errcode='42501'; end if;
  select seller_id into v_seller from public.seller_reconciliations where id=p_reconciliation_id for update;
  if not found then raise exception 'reconciliation_not_found'; end if;
  select o.* into v_order from public.seller_reconciliations r join public.order_items i on i.id=r.order_item_id join public.orders o on o.id=i.order_id where r.id=p_reconciliation_id;
  if not (v_order.payment_status='paid' or (v_order.payment_method='cod' and exists(select 1 from public.shipments s where s.order_id=v_order.id and s.seller_id=v_seller and s.status='delivered'))) then raise exception 'order_not_complete'; end if;
  update public.seller_reconciliations set status='reconciled',reconciled_by=(select auth.uid()),reconciled_at=now() where id=p_reconciliation_id and status='pending';
  if not found then raise exception 'already_reconciled'; end if;
end; $$;
revoke all on function public.admin_mark_reconciled(uuid) from public,anon;
grant execute on function public.admin_mark_reconciled(uuid) to authenticated;

drop policy if exists "buyer creates own review" on public.reviews;
create policy "buyer creates own review" on public.reviews for insert to authenticated with check(user_id=(select auth.uid()) and exists(
  select 1 from public.order_items i join public.orders o on o.id=i.order_id where i.product_id=reviews.product_id and o.buyer_id=(select auth.uid())
    and (o.payment_status='paid' or (o.payment_method='cod' and exists(select 1 from public.shipments s where s.order_id=o.id and s.seller_id=i.seller_id and s.status='delivered')))
));

create index if not exists shipments_order_seller_idx on public.shipments(order_id,seller_id);
create index if not exists seller_applications_status_created_idx on public.seller_applications(status,created_at desc);
