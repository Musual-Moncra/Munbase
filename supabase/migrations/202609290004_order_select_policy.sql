drop policy if exists "buyer or admin orders read" on public.orders;
drop policy if exists "seller reads own fulfillment orders" on public.orders;
create policy "buyer seller admin orders read" on public.orders for select to authenticated using(
  buyer_id=(select auth.uid()) or private.is_admin() or exists(
    select 1 from public.order_items i where i.order_id=orders.id and i.seller_id=(select auth.uid())
  )
);
