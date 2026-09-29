-- Ignore duplicate provider events without relying on an integer-as-boolean cast.
create or replace function public.confirm_payos_payment(p_order_code bigint,p_amount bigint,p_event_id text,p_payload jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare v_order public.orders%rowtype; v_new integer;
begin
  insert into public.payment_events(provider,provider_event_id,order_code,amount,payload)
  values('payos',p_event_id,p_order_code,p_amount,coalesce(p_payload,'{}')) on conflict(provider,provider_event_id) do nothing;
  get diagnostics v_new=row_count;
  if v_new=0 then return true; end if;
  select * into v_order from public.orders where order_code=p_order_code for update;
  if not found or v_order.total_amount<>p_amount or v_order.payment_method<>'payos' then raise exception 'payment_mismatch'; end if;
  if v_order.payment_status='paid' then
    update public.payment_events set processed_at=now(),order_id=v_order.id where provider='payos' and provider_event_id=p_event_id;
    return true;
  end if;
  update public.orders set payment_status='paid',paid_at=now(),updated_at=now() where id=v_order.id;
  update public.payment_events set order_id=v_order.id,processed_at=now() where provider='payos' and provider_event_id=p_event_id;
  return true;
end; $$;
revoke all on function public.confirm_payos_payment(bigint,bigint,text,jsonb) from public,anon,authenticated;
