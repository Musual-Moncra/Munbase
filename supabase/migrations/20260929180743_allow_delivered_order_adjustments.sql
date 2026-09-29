create or replace function public.admin_create_financial_adjustment(
  p_order_id uuid,p_delta_amount bigint,p_reason text,p_evidence_reference text,p_request_key uuid
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_order public.orders%rowtype; v_id uuid;
begin
  if not private.is_admin() then raise exception 'admin_required' using errcode='42501'; end if;
  if p_request_key is null or length(trim(coalesce(p_reason,'')))<3 or p_delta_amount=0 then raise exception 'invalid_adjustment'; end if;
  select id into v_id from public.order_adjustments where request_key=p_request_key;
  if found then return v_id; end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'order_not_found'; end if;
  select id into v_id from public.order_adjustments where request_key=p_request_key;
  if found then return v_id; end if;
  if v_order.payment_status<>'paid' and not exists(select 1 from public.shipments where order_id=p_order_id and status='delivered') then raise exception 'order_not_paid'; end if;
  insert into public.order_adjustments(order_id,kind,delta_amount,status,reason,evidence_reference,before_state,after_state,created_by,request_key)
    values(p_order_id,'financial',p_delta_amount,'pending',trim(p_reason),nullif(trim(p_evidence_reference),''),
      jsonb_build_object('payment_status',v_order.payment_status,'total_amount',v_order.total_amount),
      jsonb_build_object('recorded_delta',p_delta_amount,'settlement_required',true),(select auth.uid()),p_request_key)
    on conflict(request_key) do nothing returning id into v_id;
  if v_id is null then select id into v_id from public.order_adjustments where request_key=p_request_key; return v_id; end if;
  insert into public.admin_audit_log(actor_id,entity_type,entity_id,action,reason,before_state,after_state)
    values((select auth.uid()),'order',p_order_id,'create_financial_adjustment',trim(p_reason),
      jsonb_build_object('total_amount',v_order.total_amount),jsonb_build_object('adjustment_id',v_id,'delta_amount',p_delta_amount));
  return v_id;
end; $$;
revoke all on function public.admin_create_financial_adjustment(uuid,bigint,text,text,uuid) from public,anon;
grant execute on function public.admin_create_financial_adjustment(uuid,bigint,text,text,uuid) to authenticated;
