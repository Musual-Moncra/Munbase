-- Require a confirmed delivered shipment for COD remittance and require a
-- saved seller payout account before marking any seller balance paid.
create or replace function public.admin_confirm_cod_remittance(p_order_id uuid,p_reference text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_order public.orders%rowtype;
begin
  if not private.is_admin() then raise exception 'admin_required' using errcode = '42501'; end if;
  if length(trim(coalesce(p_reference,''))) not between 3 and 120 then raise exception 'remittance_reference_required'; end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found or v_order.payment_method<>'cod' then raise exception 'cod_order_not_found'; end if;
  if v_order.payment_status='paid' and v_order.cod_remitted_at is not null then raise exception 'cod_already_reconciled'; end if;
  if v_order.payment_status<>'pending'
     or not exists(select 1 from public.shipments where order_id=p_order_id)
     or exists(select 1 from public.shipments where order_id=p_order_id and status<>'delivered') then
    raise exception 'cod_not_delivered';
  end if;
  update public.orders set payment_status='paid',paid_at=now(),cod_remitted_at=now(),cod_remittance_reference=trim(p_reference),updated_at=now() where id=p_order_id;
end; $$;
revoke all on function public.admin_confirm_cod_remittance(uuid,text) from public,anon;
grant execute on function public.admin_confirm_cod_remittance(uuid,text) to authenticated;

create or replace function public.admin_mark_reconciled(p_reconciliation_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_order public.orders%rowtype; v_seller uuid; v_item_id uuid;
begin
  if not private.is_admin() then raise exception 'admin_required' using errcode = '42501'; end if;
  select seller_id,order_item_id into v_seller,v_item_id from public.seller_reconciliations where id=p_reconciliation_id for update;
  if not found then raise exception 'reconciliation_not_found'; end if;
  select o.* into v_order from public.order_items i join public.orders o on o.id=i.order_id where i.id=v_item_id;
  if v_order.payment_status<>'paid' then raise exception 'order_not_paid'; end if;
  if not exists(select 1 from public.seller_payout_accounts where seller_id=v_seller) then raise exception 'payout_account_missing'; end if;
  if exists(select 1 from public.order_items i where i.id=v_item_id and i.product_type='physical') then
    if not exists(select 1 from public.shipments where order_id=v_order.id and seller_id=v_seller)
       or exists(select 1 from public.shipments where order_id=v_order.id and seller_id=v_seller and status<>'delivered') then
      raise exception 'shipment_not_delivered';
    end if;
  end if;
  if v_order.payment_method='cod' and v_order.cod_remitted_at is null then raise exception 'cod_not_remitted'; end if;
  update public.seller_reconciliations set status='reconciled',reconciled_by=(select auth.uid()),reconciled_at=now()
    where id=p_reconciliation_id and status='pending';
  if not found then raise exception 'already_reconciled'; end if;
end; $$;
revoke all on function public.admin_mark_reconciled(uuid) from public,anon;
grant execute on function public.admin_mark_reconciled(uuid) to authenticated;
