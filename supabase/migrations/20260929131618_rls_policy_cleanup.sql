-- Cache JWT/helper lookups once per statement and remove overlapping shop read
-- policies. Private seller payout data stays visible only to owner/admin.
drop policy if exists "profiles readable by self or admin" on public.profiles;
create policy "profiles readable by self or admin" on public.profiles for select to authenticated
  using (id=(select auth.uid()) or (select private.is_admin()));
drop policy if exists "profiles update self" on public.profiles;
create policy "profiles update self" on public.profiles for update to authenticated
  using (id=(select auth.uid()) or (select private.is_admin()))
  with check (id=(select auth.uid()) or (select private.is_admin()));

drop policy if exists "seller applications create self" on public.seller_applications;
create policy "seller applications create self" on public.seller_applications for insert to authenticated
  with check (user_id=(select auth.uid()) and status='pending');
drop policy if exists "seller applications own or admin read" on public.seller_applications;
create policy "seller applications own or admin read" on public.seller_applications for select to authenticated
  using (user_id=(select auth.uid()) or (select private.is_admin()));

drop policy if exists "active products public read" on public.products;
create policy "active products public read" on public.products for select to anon,authenticated
  using (is_active=true or seller_id=(select auth.uid()) or (select private.is_admin()));

drop policy if exists "buyer or seller or admin entitlement read" on public.digital_entitlements;
create policy "buyer or seller or admin entitlement read" on public.digital_entitlements for select to authenticated
  using (buyer_id=(select auth.uid()) or exists(select 1 from public.products p where p.id=product_id and p.seller_id=(select auth.uid())) or (select private.is_admin()));
drop policy if exists "buyer removes own review" on public.reviews;
create policy "buyer removes own review" on public.reviews for delete to authenticated using(user_id=(select auth.uid()));

drop policy if exists "active shops public read" on public.shops;
drop policy if exists "seller manages own shop" on public.shops;
create policy "active shops public read" on public.shops for select to anon using(is_active);
create policy "seller or admin reads shop" on public.shops for select to authenticated
  using(is_active or seller_id=(select auth.uid()) or (select private.is_admin()));
create policy "seller creates own shop" on public.shops for insert to authenticated
  with check ((seller_id=(select auth.uid()) or (select private.is_admin()))
    and exists(select 1 from public.profiles p where p.id=seller_id and p.role in ('seller','admin')));
create policy "seller updates own shop" on public.shops for update to authenticated
  using(seller_id=(select auth.uid()) or (select private.is_admin()))
  with check ((seller_id=(select auth.uid()) or (select private.is_admin()))
    and exists(select 1 from public.profiles p where p.id=seller_id and p.role in ('seller','admin')));
revoke delete on public.shops from authenticated;

drop policy if exists "seller or admin reads payout account" on public.seller_payout_accounts;
drop policy if exists "seller manages own payout account" on public.seller_payout_accounts;
create policy "seller or admin reads payout account" on public.seller_payout_accounts for select to authenticated
  using(seller_id=(select auth.uid()) or (select private.is_admin()));
create policy "seller creates payout account" on public.seller_payout_accounts for insert to authenticated
  with check ((seller_id=(select auth.uid()) or (select private.is_admin()))
    and exists(select 1 from public.profiles p where p.id=seller_id and p.role in ('seller','admin')));
create policy "seller updates payout account" on public.seller_payout_accounts for update to authenticated
  using(seller_id=(select auth.uid()) or (select private.is_admin()))
  with check ((seller_id=(select auth.uid()) or (select private.is_admin()))
    and exists(select 1 from public.profiles p where p.id=seller_id and p.role in ('seller','admin')));
revoke delete on public.seller_payout_accounts from authenticated;

-- PayOS is not available for launch. Retire its leftover client RPC entrypoint.
revoke all on function public.set_payos_payment_link(uuid,bigint,text) from public,anon,authenticated;
revoke all on function public.confirm_payos_payment(bigint,bigint,text,jsonb) from public,anon,authenticated,service_role;
