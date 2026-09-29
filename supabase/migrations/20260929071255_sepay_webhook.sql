-- Server-only confirmation for SePay bank transfer events.
create or replace function public.confirm_sepay_payment(
  p_order_code bigint,
  p_amount bigint,
  p_event_id text,
  p_payload jsonb
) returns boolean
language plpgsql security definer set search_path='' as $$
declare
  v_order public.orders%rowtype;
  v_inserted integer;
begin
  if coalesce(length(trim(p_event_id)),0)=0 or coalesce(p_amount,0)<=0 then
    raise exception 'invalid_payment_event';
  end if;

  insert into public.payment_events(provider,provider_event_id,order_code,amount,payload)
  values('sepay',trim(p_event_id),p_order_code,p_amount,coalesce(p_payload,'{}'))
  on conflict(provider,provider_event_id) do nothing;
  get diagnostics v_inserted=row_count;
  if v_inserted=0 then return true; end if;

  if p_order_code is null then return false; end if;
  select * into v_order from public.orders
    where order_code=p_order_code and payment_method='sepay'
    for update;
  if not found then return false; end if;

  update public.payment_events set order_id=v_order.id
    where provider='sepay' and provider_event_id=trim(p_event_id);

  -- Keep short, overpaid, late, and repeated transfers pending for manual review.
  if v_order.payment_status<>'pending' or v_order.total_amount<>p_amount then return false; end if;

  update public.orders set payment_status='paid',paid_at=now(),updated_at=now()
    where id=v_order.id and payment_status='pending';
  if not found then return false; end if;

  update public.payment_events set processed_at=now()
    where provider='sepay' and provider_event_id=trim(p_event_id);
  return true;
end; $$;

revoke all on function public.confirm_sepay_payment(bigint,bigint,text,jsonb) from public,anon,authenticated;
grant execute on function public.confirm_sepay_payment(bigint,bigint,text,jsonb) to service_role;
