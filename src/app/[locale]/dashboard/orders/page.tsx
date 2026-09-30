import {createSupabaseServerClient} from '@/lib/supabase/server';
import {getLocale,getTranslations} from 'next-intl/server';
import {formatVnd} from '@/lib/catalog';
import {Link} from '@/i18n/navigation';

export default async function SellerOrdersPage({searchParams}:{searchParams:Promise<{q?:string;status?:string;page?:string}>}){
  const [query,locale,t]=await Promise.all([searchParams,getLocale(),getTranslations('dashboard')]);
  const supabase=await createSupabaseServerClient();
  if(!supabase)return <main className="seller-page page-main"><h1 className="page-title">{t('allOrders')}</h1><div className="empty">{t('notConfigured')}</div></main>;
  const {data:auth}=await supabase.auth.getClaims();const sellerId=auth?.claims?.sub;
  if(!sellerId)return <main className="seller-page page-main"><h1 className="page-title">{t('allOrders')}</h1><div className="empty">{t('signInRequired')} <Link href="/login">{t('signIn')}</Link></div></main>;
  const {data:profile}=await supabase.from('profiles').select('role').eq('id',sellerId).maybeSingle();
  if(profile?.role!=='seller'&&profile?.role!=='admin')return <main className="seller-page page-main"><div className="empty">{t('sellerAccessRequired')} <Link href="/dashboard/apply">{t('applyNow')}</Link></div></main>;
  const page=Math.max(1,Number(query.page)||1);const pageSize=20;const term=query.q?.trim().slice(0,80)||'';
  let ordersQuery=supabase.from('orders').select('id,order_code,created_at,payment_status,payment_method,paid_at,customer_name,order_items!inner(id,product_title,product_type,quantity,unit_price,seller_id)',{count:'exact'}).eq('order_items.seller_id',sellerId);
  if(['pending','paid','failed','cancelled'].includes(query.status||''))ordersQuery=ordersQuery.eq('payment_status',query.status as 'pending'|'paid'|'failed'|'cancelled');
  if(term)ordersQuery=ordersQuery.ilike('customer_name',`%${term.replace(/[%_]/g,'\\$&')}%`);
  const {data:orders,count,error}=await ordersQuery.order('created_at',{ascending:false}).range((page-1)*pageSize,page*pageSize-1);
  const rows=orders||[];const orderIds=rows.map(row=>row.id);
  const {data:shipments}=orderIds.length?await supabase.from('shipments').select('order_id,status').eq('seller_id',sellerId).in('order_id',orderIds):{data:[]};
  const shipmentByOrder=new Map((shipments||[]).map(s=>[s.order_id,s.status]));
  const digitalItemIds=rows.flatMap(order=>order.order_items.filter(item=>item.product_type==='digital').map(item=>item.id));
  const {data:entitlements}=digitalItemIds.length?await supabase.from('digital_entitlements').select('order_item_id').in('order_item_id',digitalItemIds):{data:[]};
  const entitledItems=new Set((entitlements||[]).map(item=>item.order_item_id));
  const pageCount=Math.max(1,Math.ceil((count||0)/pageSize));
  function pageHref(nextPage:number){const params=new URLSearchParams();if(term)params.set('q',term);if(query.status)params.set('status',query.status);params.set('page',String(nextPage));return `/dashboard/orders?${params.toString()}`;}
  return <main className="seller-page page-main"><span className="eyebrow">{t('sellerCenter')}</span><h1 className="page-title">{t('allOrders')}</h1>
    <form className="seller-filters" method="get"><label>{t('searchOrders')}<input className="field" type="search" name="q" defaultValue={term}/></label><label>{t('payment')}<select className="field" name="status" defaultValue={query.status||''}><option value="">{t('allStatuses')}</option>{['pending','paid','failed','cancelled'].map(value=><option key={value} value={value}>{t(value)}</option>)}</select></label><button className="button secondary">{t('applyFilters')}</button></form>
    {error?<div className="alert-note">{t('orderError')}</div>:rows.length?<><div className="data-table-wrap"><table className="data-table"><thead><tr><th>{t('orderCode')}</th><th>{t('createdAt')}</th><th>{t('customer')}</th><th>{t('product')}</th><th>{t('amount')}</th><th>{t('payment')}</th><th>{t('fulfillment')}</th><th></th></tr></thead><tbody>{rows.map(order=>{const items=order.order_items;const subtotal=items.reduce((sum,item)=>sum+item.quantity*item.unit_price,0);const kinds=[...new Set(items.map(item=>item.product_type))];const physical=items.some(item=>item.product_type==='physical');const digitalItems=items.filter(item=>item.product_type==='digital');const shipmentStatus=shipmentByOrder.get(order.id);const fulfillment=[physical?(shipmentStatus||t('pending')):'',digitalItems.length?(digitalItems.every(item=>entitledItems.has(item.id))?t('readyToDownload'):t('notAvailableYet')):''].filter(Boolean).join(' · ');return <tr key={order.id}><td>#{order.order_code}</td><td>{new Date(order.created_at).toLocaleDateString(locale)}</td><td>{order.customer_name}</td><td><div>{items.length} · {kinds.map(kind=>kind==='digital'?t('digital'):t('physical')).join(' / ')}</div></td><td>{formatVnd(subtotal,locale)}</td><td><span className="status-pill">{t(order.payment_status)}</span><div className="form-help">{order.payment_method==='cod'?'COD':'SePay'}</div></td><td>{fulfillment}</td><td><Link className="nav-link" href={`/dashboard/orders/${order.id}`}>{t('viewOrder')}</Link></td></tr>;})}</tbody></table></div><div className="seller-pagination"><span>{count||0} · {t('page')} {page}/{pageCount}</span><div>{page>1&&<Link className="button secondary" href={pageHref(page-1)}>{t('previous')}</Link>}{page<pageCount&&<Link className="button secondary" href={pageHref(page+1)}>{t('next')}</Link>}</div></div></>:<div className="empty">{t('noMatchingOrders')}</div>}
  </main>;
}
