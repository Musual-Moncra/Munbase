import {getLocale,getTranslations} from 'next-intl/server';
import {Link} from '@/i18n/navigation';
import {createSupabaseServerClient} from '@/lib/supabase/server';
import {formatVnd} from '@/lib/catalog';

type Summary={gross_revenue:number;order_count:number;units_sold:number;pending_settlement:number;reconciled_total:number};

export default async function DashboardPage(){
  const [t,locale]=await Promise.all([getTranslations('dashboard'),getLocale()]);const supabase=await createSupabaseServerClient();
  if(!supabase)return <main className="seller-page page-main"><h1 className="page-title">{t('title')}</h1><div className="empty">{t('notConfigured')}</div></main>;
  const {data:auth}=await supabase.auth.getClaims();const claims=auth?.claims;
  if(!claims)return <main className="seller-page page-main"><h1 className="page-title">{t('title')}</h1><p className="muted">{t('signInToApply')}</p><Link className="button" href="/login">{t('signIn')}</Link></main>;
  const [{data:profile},{data:application}]=await Promise.all([supabase.from('profiles').select('role').eq('id',claims.sub).maybeSingle(),supabase.from('seller_applications').select('status,shop_name,submitted_at,rejection_reason').eq('user_id',claims.sub).maybeSingle()]);
  if(profile?.role!=='seller'&&profile?.role!=='admin')return <main className="seller-page page-main"><span className="eyebrow">{t('eyebrow')}</span><h1 className="page-title">{t('title')}</h1><p className="muted">{t('subtitle')}</p>{application&&<div className="card-panel">{application.shop_name} · {t(application.submitted_at?`application_${application.status}`:'application_draft')}{application.rejection_reason&&<p className="alert-note">{application.rejection_reason}</p>}</div>}<Link className="button" href="/dashboard/apply">{application?.status==='rejected'?t('editApplication'):t('applyNow')}</Link></main>;
  const end=new Date();const start=new Date(end.getTime()-30*86400000);
  const [{count:productCount},{data:summaryData},{data:orders,error}]=await Promise.all([
    supabase.from('products').select('id',{count:'exact',head:true}).eq('seller_id',claims.sub),
    supabase.rpc('seller_revenue_summary',{p_from:start.toISOString(),p_to:end.toISOString()}),
    supabase.from('orders').select('id,order_code,created_at,payment_status,order_items!inner(id,product_type,seller_id)').eq('order_items.seller_id',claims.sub).order('created_at',{ascending:false}).limit(8)
  ]);
  const summary=summaryData as Summary|null;
  return <main className="seller-page page-main"><span className="eyebrow">{t('sellerCenter')}</span><h1 className="page-title">{t('title')}</h1><p className="muted">{t('subtitle')}</p>
    <div className="metric-grid"><article className="metric-card"><span className="muted">{t('products')}</span><strong>{productCount||0}</strong><Link className="nav-link" href="/dashboard/products">{t('manageProducts')} →</Link></article><article className="metric-card"><span className="muted">{t('salesRevenue')}</span><strong>{summary?formatVnd(summary.gross_revenue,locale):'—'}</strong><Link className="nav-link" href="/dashboard/revenue">{t('revenue')} →</Link></article><article className="metric-card"><span className="muted">{t('orderCount')}</span><strong>{summary?.order_count??'—'}</strong><Link className="nav-link" href="/dashboard/orders">{t('allOrders')} →</Link></article><article className="metric-card"><span className="muted">{t('pendingSettlement')}</span><strong>{summary?formatVnd(summary.pending_settlement,locale):'—'}</strong><Link className="nav-link" href="/dashboard/revenue">{t('reconciliationHistory')} →</Link></article></div>
    <section className="card-panel"><div className="section-head"><h2>{t('allOrders')}</h2><Link className="nav-link" href="/dashboard/orders">{t('viewOrder')} →</Link></div>{error?<p className="alert-note">{t('orderError')}</p>:orders?.length?<div className="data-table-wrap"><table className="data-table"><thead><tr><th>{t('orderCode')}</th><th>{t('createdAt')}</th><th>{t('payment')}</th><th>{t('fulfillment')}</th><th></th></tr></thead><tbody>{orders.map(order=><tr key={order.id}><td>#{order.order_code}</td><td>{new Date(order.created_at).toLocaleDateString(locale)}</td><td><span className="status-pill">{t(order.payment_status)}</span></td><td>{[...new Set(order.order_items.map(item=>item.product_type))].map(kind=>kind==='digital'?t('digital'):t('physical')).join(' / ')}</td><td><Link className="nav-link" href={`/dashboard/orders/${order.id}`}>{t('viewOrder')}</Link></td></tr>)}</tbody></table></div>:<div className="empty">{t('noOrders')}</div>}</section>
  </main>;
}
