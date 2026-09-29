drop policy if exists "seller or admin reconciliation read" on public.seller_reconciliations;
create policy "seller or admin reconciliation read"
  on public.seller_reconciliations
  for select
  to authenticated
  using (seller_id = (select auth.uid()) or private.is_admin());
