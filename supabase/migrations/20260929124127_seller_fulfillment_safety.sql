-- Seller fulfillment cannot start on an unpaid SePay order. Product listings
-- are hidden/restored through is_active; sellers never hard-delete listings.
create or replace function public.seller_update_shipment(
  p_shipment_id uuid,p_status public.shipment_state,p_carrier text,p_tracking_number text
) returns void
language plpgsql security definer set search_path='' as $$
declare v_shipment public.shipments%rowtype; v_order_id uuid; v_payment public.payment_state; v_method public.order_payment_method;
begin
  select order_id into v_order_id from public.shipments where id=p_shipment_id and seller_id=(select auth.uid());
  if not found then raise exception 'shipment_not_found'; end if;
  -- Match the buyer cancellation lock order (order, then shipment).
  select payment_status,payment_method into v_payment,v_method from public.orders where id=v_order_id for update;
  select * into v_shipment from public.shipments where id=p_shipment_id and seller_id=(select auth.uid()) for update;
  if not found then raise exception 'shipment_not_found'; end if;
  if v_payment<>'paid' and not (v_method='cod' and v_payment='pending') then raise exception 'order_not_ready_for_fulfillment'; end if;
  if p_status not in ('ready_to_ship','shipped','delivered') then raise exception 'invalid_shipment_status'; end if;
  if (v_shipment.status='pending' and p_status<>'ready_to_ship')
     or (v_shipment.status='ready_to_ship' and p_status<>'shipped')
     or (v_shipment.status='shipped' and p_status<>'delivered')
     or v_shipment.status in ('delivered','cancelled') then raise exception 'invalid_status_transition'; end if;
  if p_status='shipped' and coalesce(length(trim(p_tracking_number)),0)<3 then raise exception 'tracking_number_required'; end if;
  update public.shipments set status=p_status,carrier=nullif(trim(p_carrier),''),tracking_number=nullif(trim(p_tracking_number),''),
    shipped_at=case when p_status='shipped' then now() else shipped_at end,
    delivered_at=case when p_status='delivered' then now() else delivered_at end where id=p_shipment_id;
end; $$;
revoke all on function public.seller_update_shipment(uuid,public.shipment_state,text,text) from public,anon;
grant execute on function public.seller_update_shipment(uuid,public.shipment_state,text,text) to authenticated;

revoke delete on public.products from authenticated;
drop policy if exists "seller products delete" on public.products;
