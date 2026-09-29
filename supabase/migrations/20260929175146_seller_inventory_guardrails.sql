-- The legacy two-argument reviewer bypasses mandatory decision reasons.
revoke all on function public.admin_review_seller_application(uuid,boolean) from public,anon,authenticated;

create or replace function public.seller_set_product_stock(p_product_id uuid,p_stock integer) returns void
language plpgsql security definer set search_path='' as $$
begin
  if (select auth.uid()) is null then raise exception 'authentication_required' using errcode='28000'; end if;
  if p_stock<0 or p_stock>100000 then raise exception 'invalid_stock'; end if;
  update public.products set stock_quantity=p_stock,updated_at=now()
    where id=p_product_id and seller_id=(select auth.uid()) and product_type='physical';
  if not found then raise exception 'product_not_found'; end if;
end; $$;
revoke all on function public.seller_set_product_stock(uuid,integer) from public,anon;
grant execute on function public.seller_set_product_stock(uuid,integer) to authenticated;

alter table public.products add column if not exists admin_block_reason text;

create or replace function public.admin_remove_product(p_product_id uuid,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare v_before jsonb;
begin
  if not private.is_admin() then raise exception 'admin_required' using errcode='42501'; end if;
  if length(trim(coalesce(p_reason,'')))<3 then raise exception 'reason_required'; end if;
  select jsonb_build_object('title',title,'price',price,'is_active',is_active,'admin_blocked',admin_blocked) into v_before
    from public.products where id=p_product_id for update;
  if not found then raise exception 'product_not_found'; end if;
  update public.products set is_active=false,admin_blocked=true,admin_block_reason=trim(p_reason),updated_at=now() where id=p_product_id;
  insert into public.admin_audit_log(actor_id,entity_type,entity_id,action,reason,before_state,after_state)
    values((select auth.uid()),'product',p_product_id,'remove_listing',trim(p_reason),v_before,'{"is_active":false,"admin_blocked":true}'::jsonb);
end; $$;
revoke all on function public.admin_remove_product(uuid,text) from public,anon;
grant execute on function public.admin_remove_product(uuid,text) to authenticated;

-- Sellers may submit a correction for an admin-blocked listing; only an admin
-- approval can clear the block and republish it.
create or replace function public.save_product_submission(p_submission_id uuid,p_product_id uuid,p_payload jsonb,p_submit boolean default false) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_user uuid := (select auth.uid()); v_id uuid; v_type public.product_kind; v_path text; v_images text[]; v_status text;
  v_title text; v_slug text; v_price bigint; v_stock integer; v_category uuid;
begin
  if v_user is null then raise exception 'authentication_required' using errcode='28000'; end if;
  if not exists(select 1 from public.profiles p where p.id=v_user and p.role in ('seller','admin')) then raise exception 'seller_approval_required' using errcode='42501'; end if;
  v_title:=trim(coalesce(p_payload->>'title',''));v_slug:=trim(coalesce(p_payload->>'slug',''));v_type:=(p_payload->>'product_type')::public.product_kind;
  v_price:=(p_payload->>'price')::bigint;v_stock:=greatest(coalesce((p_payload->>'stock')::integer,0),0);v_category:=nullif(p_payload->>'category_id','')::uuid;
  v_path:=nullif(trim(coalesce(p_payload->>'digital_file_path','')),'');v_images:=array(select jsonb_array_elements_text(coalesce(p_payload->'images','[]'::jsonb)));
  if length(v_title) not between 3 and 120 or length(trim(coalesce(p_payload->>'description',''))) not between 10 and 6000 or v_price<=0 or cardinality(v_images)>5 then raise exception 'invalid_product'; end if;
  if v_type='digital' and (v_path is null or split_part(v_path,'/',1)<>v_user::text or not exists(select 1 from storage.objects o where o.bucket_id='digital-assets' and o.name=v_path)) then raise exception 'invalid_digital_asset'; end if;
  if exists(select 1 from unnest(v_images) i where split_part(split_part(i,'/product-images/',2),'/',1)<>v_user::text) then raise exception 'invalid_product_image'; end if;
  if p_product_id is not null and not exists(select 1 from public.products p where p.id=p_product_id and p.seller_id=v_user) then raise exception 'product_not_editable'; end if;
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
