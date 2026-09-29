-- Keep profile role changes out of user-controlled profile updates.
revoke update on public.profiles from authenticated;
grant update(full_name, avatar_url, phone) on public.profiles to authenticated;

-- A paid-order check must not reveal payment state for arbitrary order IDs.
create or replace function public.is_order_paid(p_order_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.orders o
    where o.id=p_order_id and o.payment_status='paid'
      and (
        o.buyer_id=(select auth.uid())
        or private.is_admin()
        or exists(select 1 from public.order_items i where i.order_id=o.id and i.seller_id=(select auth.uid()))
      )
  )
$$;
revoke all on function public.is_order_paid(uuid) from public,anon;
grant execute on function public.is_order_paid(uuid) to authenticated;

-- Bind the PayOS order code to the DB-generated order code and only save a link once.
create or replace function public.set_payos_payment_link(p_order_id uuid,p_order_code bigint,p_link_id text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if coalesce(length(trim(p_link_id)),0)<4 then raise exception 'invalid_payment_link'; end if;
  update public.orders set payos_order_code=p_order_code,payos_payment_link_id=trim(p_link_id),updated_at=now()
  where id=p_order_id and buyer_id=(select auth.uid()) and payment_method='payos' and payment_status='pending'
    and order_code=p_order_code and payos_order_code is null and payos_payment_link_id is null;
  if not found then raise exception 'order_not_pending'; end if;
end; $$;
revoke all on function public.set_payos_payment_link(uuid,bigint,text) from public,anon;
grant execute on function public.set_payos_payment_link(uuid,bigint,text) to authenticated;

-- A buyer may edit their review text/rating but cannot retarget it to another product.
drop policy if exists "buyer edits own review" on public.reviews;
create policy "buyer edits own review" on public.reviews for update to authenticated
  using(user_id=(select auth.uid()))
  with check(user_id=(select auth.uid()) and exists(
    select 1 from public.order_items i join public.orders o on o.id=i.order_id
    where i.product_id=reviews.product_id and o.buyer_id=(select auth.uid())
      and (o.payment_status='paid' or (o.payment_method='cod' and exists(
        select 1 from public.shipments s where s.order_id=o.id and s.seller_id=i.seller_id and s.status='delivered'
      )))
  ));
