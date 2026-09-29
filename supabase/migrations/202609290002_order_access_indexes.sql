create or replace function public.is_order_paid(p_order_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.orders o where o.id=p_order_id and o.payment_status='paid' and (o.buyer_id=(select auth.uid()) or private.is_admin()))
$$;
revoke all on function public.is_order_paid(uuid) from public,anon;
grant execute on function public.is_order_paid(uuid) to authenticated;

create index if not exists products_seller_created_idx on public.products(seller_id,created_at desc);
create index if not exists products_category_id_idx on public.products(category_id);
create index if not exists seller_applications_reviewer_idx on public.seller_applications(reviewed_by);
create index if not exists orders_buyer_created_idx on public.orders(buyer_id,created_at desc);
create index if not exists order_items_order_id_idx on public.order_items(order_id);
create index if not exists order_items_product_id_idx on public.order_items(product_id);
create index if not exists order_items_seller_id_idx on public.order_items(seller_id);
create index if not exists payment_events_order_id_idx on public.payment_events(order_id);
create index if not exists digital_entitlements_buyer_id_idx on public.digital_entitlements(buyer_id);
create index if not exists digital_entitlements_product_id_idx on public.digital_entitlements(product_id);
create index if not exists reviews_user_id_idx on public.reviews(user_id);
create index if not exists seller_reconciliations_seller_created_idx on public.seller_reconciliations(seller_id,created_at desc);
create index if not exists seller_reconciliations_reconciled_by_idx on public.seller_reconciliations(reconciled_by);
create index if not exists shipments_seller_created_idx on public.shipments(seller_id,created_at desc);

drop policy if exists "categories admin manage" on public.categories;
create policy "categories admin write" on public.categories for all to authenticated using(private.is_admin()) with check(private.is_admin());
