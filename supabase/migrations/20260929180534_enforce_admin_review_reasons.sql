create or replace function public.admin_review_product_submission(p_submission_id uuid,p_approve boolean,p_reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_sub public.product_submissions%rowtype; v_product_id uuid;
begin
  if not private.is_admin() then raise exception 'admin_required' using errcode='42501'; end if;
  if length(trim(coalesce(p_reason,'')))<3 then raise exception 'decision_reason_required'; end if;
  select * into v_sub from public.product_submissions where id=p_submission_id and status='pending' for update;
  if not found then raise exception 'submission_not_pending'; end if;
  v_product_id:=v_sub.product_id;
  insert into public.product_submission_reviews(submission_id,reviewer_id,decision,reason)
    values(v_sub.id,(select auth.uid()),case when p_approve then 'approved' else 'rejected' end,trim(p_reason));
  if p_approve then
    if v_product_id is null then
      insert into public.products(seller_id,category_id,title,slug,description,price,product_type,images,stock_quantity,digital_file_path,is_active,admin_blocked,admin_block_reason)
      values(v_sub.seller_id,v_sub.category_id,v_sub.title,v_sub.slug,v_sub.description,v_sub.price,v_sub.product_type,v_sub.images,
        case when v_sub.product_type='physical' then v_sub.initial_stock else 0 end,v_sub.digital_file_path,true,false,null) returning id into v_product_id;
    else
      update public.products set category_id=v_sub.category_id,title=v_sub.title,description=v_sub.description,price=v_sub.price,product_type=v_sub.product_type,
        images=v_sub.images,digital_file_path=v_sub.digital_file_path,is_active=true,admin_blocked=false,admin_block_reason=null,updated_at=now()
        where id=v_product_id and seller_id=v_sub.seller_id;
      if not found then raise exception 'product_not_found'; end if;
    end if;
    update public.product_submissions set status='approved',rejection_reason=null,reviewed_by=(select auth.uid()),reviewed_at=now(),updated_at=now() where id=v_sub.id;
  else
    update public.product_submissions set status='rejected',rejection_reason=trim(p_reason),reviewed_by=(select auth.uid()),reviewed_at=now(),updated_at=now() where id=v_sub.id;
  end if;
  insert into public.admin_audit_log(actor_id,entity_type,entity_id,action,reason,before_state,after_state)
    values((select auth.uid()),'product_submission',v_sub.id,case when p_approve then 'approve' else 'reject' end,trim(p_reason),
      jsonb_build_object('status','pending','product_id',v_sub.product_id),jsonb_build_object('status',case when p_approve then 'approved' else 'rejected' end,'product_id',v_product_id));
  return v_product_id;
end; $$;
revoke all on function public.admin_review_product_submission(uuid,boolean,text) from public,anon;
grant execute on function public.admin_review_product_submission(uuid,boolean,text) to authenticated;

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
  if v_order.payment_status<>'paid' then raise exception 'order_not_paid'; end if;
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
