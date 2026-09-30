create or replace function public.seller_revenue_summary(p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_seller_id uuid := (select auth.uid());
  v_summary jsonb;
begin
  if v_seller_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = v_seller_id and p.role in ('seller', 'admin')
  ) then
    raise exception 'seller_access_required' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '366 days' then
    raise exception 'invalid_reporting_period' using errcode = '22023';
  end if;

  with paid_items as (
    select i.order_id, i.product_id, i.product_title, i.quantity,
           i.unit_price, o.paid_at
    from public.order_items i
    join public.orders o on o.id = i.order_id
    where i.seller_id = v_seller_id
      and o.payment_status = 'paid'
      and o.paid_at >= p_from and o.paid_at < p_to
      and (o.payment_method <> 'cod' or o.cod_remitted_at is not null)
  ), daily as (
    select date_trunc('day', paid_at)::date as day,
           sum(quantity * unit_price)::bigint as amount
    from paid_items group by 1
  ), days as (
    select d::date as day from generate_series(
      date_trunc('day', p_from), date_trunc('day', p_to - interval '1 second'), interval '1 day'
    ) d
  ), best_sellers as (
    select product_id, product_title as title, sum(quantity)::bigint as quantity,
           sum(quantity * unit_price)::bigint as amount
    from paid_items group by product_id, product_title
    order by amount desc, title asc limit 5
  ), paid_totals as (
    select coalesce(sum(quantity * unit_price), 0)::bigint as revenue,
           count(distinct order_id)::bigint as orders,
           coalesce(sum(quantity), 0)::bigint as units
    from paid_items
  ), settlement_totals as (
    select coalesce(sum(case when r.status = 'pending' then r.gross_amount else 0 end), 0)::bigint as pending,
           coalesce(sum(case when r.status = 'reconciled' then r.gross_amount else 0 end), 0)::bigint as reconciled
    from public.seller_reconciliations r
    join public.order_items i on i.id = r.order_item_id and i.seller_id = v_seller_id
    join public.orders o on o.id = i.order_id
    where r.seller_id = v_seller_id
      and o.payment_status = 'paid'
      and o.paid_at >= p_from and o.paid_at < p_to
      and (o.payment_method <> 'cod' or o.cod_remitted_at is not null)
  )
  select jsonb_build_object(
    'gross_revenue', pt.revenue,
    'order_count', pt.orders,
    'units_sold', pt.units,
    'pending_settlement', st.pending,
    'reconciled_total', st.reconciled,
    'daily', coalesce((select jsonb_agg(jsonb_build_object('date', d.day, 'amount', coalesce(x.amount, 0)) order by d.day)
                       from days d left join daily x using(day)), '[]'::jsonb),
    'top_products', coalesce((select jsonb_agg(jsonb_build_object('product_id', b.product_id, 'title', b.title, 'quantity', b.quantity, 'amount', b.amount)) from best_sellers b), '[]'::jsonb)
  ) into v_summary
  from paid_totals pt cross join settlement_totals st;

  return v_summary;
end;
$$;

revoke all on function public.seller_revenue_summary(timestamptz, timestamptz) from public, anon;
grant execute on function public.seller_revenue_summary(timestamptz, timestamptz) to authenticated;

create index if not exists order_items_seller_order_idx on public.order_items(seller_id, order_id);
create index if not exists orders_paid_at_payment_status_idx on public.orders(paid_at, payment_status, id);
