create or replace function public.admin_allocate_payment(
  p_event_id uuid, p_order_id uuid, p_amount bigint, p_reason text, p_evidence text, p_request_key uuid
) returns void language plpgsql security definer set search_path = '' as $$
declare v_event public.payment_events%rowtype; v_order public.orders%rowtype; v_event_allocated bigint; v_refunded bigint; v_order_total bigint; v_order_allocated bigint;
begin
  if not private.is_admin() then raise exception 'admin_required' using errcode = '42501'; end if;
  if p_request_key is null or p_amount <= 0 or length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'invalid_payment_review'; end if;
  if exists(select 1 from public.payment_allocations where request_key = p_request_key and payment_event_id = p_event_id and order_id = p_order_id and amount = p_amount) then return; end if;
  perform pg_advisory_xact_lock(hashtext(p_order_id::text), hashtext('payment-allocation'));
  select * into v_event from public.payment_events where id = p_event_id for update;
  select * into v_order from public.orders where id = p_order_id for update;
  if v_event.id is null or v_order.id is null or v_event.provider <> 'sepay' or v_order.payment_method <> 'sepay' then raise exception 'payment_not_found'; end if;
  select coalesce(sum(amount), 0) into v_event_allocated from public.payment_allocations where payment_event_id = p_event_id;
  select coalesce(sum(amount), 0) into v_refunded from public.payment_refunds where payment_event_id = p_event_id;
  select total_amount into v_order_total from public.orders where id = p_order_id;
  select coalesce(sum(amount), 0) into v_order_allocated from public.payment_allocations where order_id = p_order_id;
  if p_amount > v_event.amount - v_event_allocated - v_refunded then raise exception 'payment_amount_exceeded'; end if;
  if p_amount > v_order_total - v_order_allocated then raise exception 'order_amount_exceeded'; end if;
  if v_order.payment_status <> 'pending' or v_order.expires_at is null or v_order.expires_at <= now() then raise exception 'order_not_payable'; end if;
  insert into public.payment_allocations(payment_event_id, order_id, amount, request_key, created_by)
    values(p_event_id, p_order_id, p_amount, p_request_key, (select auth.uid()));
  select coalesce(sum(amount), 0) into v_order_allocated from public.payment_allocations where order_id = p_order_id;
  update public.payment_events set order_id = p_order_id,
    review_status = case when v_event.amount <= v_event_allocated + p_amount + v_refunded then 'applied' else 'needs_review' end,
    reviewed_by = (select auth.uid()), reviewed_at = now(), review_note = trim(p_reason), processed_at = now() where id = p_event_id;
  if v_order_allocated >= v_order_total then
    update public.orders set payment_status = 'paid', paid_at = now(), updated_at = now() where id = p_order_id;
    update public.payment_events e set review_status = case when e.amount <= coalesce(a.allocated,0)+coalesce(r.refunded,0) then 'applied' else 'needs_review' end
      from (select payment_event_id, sum(amount) allocated from public.payment_allocations where order_id = p_order_id group by payment_event_id) a
      left join (select payment_event_id, sum(amount) refunded from public.payment_refunds group by payment_event_id) r on r.payment_event_id = a.payment_event_id
      where e.id = a.payment_event_id;
    perform private.queue_order_email(p_order_id, 'order:' || p_order_id::text || ':paid', 'payment_confirmed');
  end if;
  insert into public.admin_audit_log(actor_id, entity_type, entity_id, action, reason, after_state)
    values((select auth.uid()), 'payment_event', p_event_id, 'allocate_payment', trim(p_reason), jsonb_build_object('order_id', p_order_id, 'amount', p_amount, 'evidence', p_evidence));
end; $$;

create or replace function public.admin_complete_payment_refund(p_refund_id uuid, p_reference text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_refund public.payment_refunds%rowtype; v_event public.payment_events%rowtype; v_allocated bigint; v_refunded bigint;
begin
  if not private.is_admin() then raise exception 'admin_required' using errcode = '42501'; end if;
  select * into v_refund from public.payment_refunds where id = p_refund_id for update;
  if not found or length(trim(coalesce(p_reference, ''))) < 3 then raise exception 'refund_not_found_or_reference_required'; end if;
  update public.payment_refunds set status = 'refunded', refund_reference = trim(p_reference), refunded_by = (select auth.uid()), refunded_at = now()
    where id = p_refund_id and status = 'pending';
  select * into v_event from public.payment_events where id = v_refund.payment_event_id for update;
  select coalesce(sum(amount), 0) into v_allocated from public.payment_allocations where payment_event_id = v_event.id;
  select coalesce(sum(amount), 0) into v_refunded from public.payment_refunds where payment_event_id = v_event.id and status = 'refunded';
  update public.payment_events set review_status = case when v_allocated + v_refunded >= v_event.amount then 'refunded' else 'needs_review' end
    where id = v_event.id;
end; $$;
