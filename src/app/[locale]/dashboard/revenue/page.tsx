import {createSupabaseServerClient} from '@/lib/supabase/server';
import {formatVnd} from '@/lib/catalog';
import {getLocale,getTranslations} from 'next-intl/server';
import {Link} from '@/i18n/navigation';
import {resolveSellerRevenuePeriod} from '@/lib/seller-revenue';

type RevenueSummary={gross_revenue:number;order_count:number;units_sold:number;pending_settlement:number;reconciled_total:number;daily:{date:string;amount:number}[];top_products:{product_id:string;title:string;quantity:number;amount:number}[]};

export default async function SellerRevenuePage({searchParams}:{searchParams:Promise<{from?:string;to?:string;days?:string}>}){
  const [{from,to,fromInput,toInput,dayCount:selectedDays},locale,t]=await Promise.all([searchParams.then(resolveSellerRevenuePeriod),getLocale(),getTranslations('dashboard')]);
  const supabase=await createSupabaseServerClient();
  if(!supabase)return <main className="seller-page page-main"><h1 className="page-title">{t('revenue')}</h1><div className="empty">Supabase</div></main>;
  const {data:auth}=await supabase.auth.getClaims();const sellerId=auth?.claims?.sub;
  if(!sellerId)return <main className="seller-page page-main"><h1 className="page-title">{t('revenue')}</h1><div className="empty">{t('signInRequired')} <Link className="nav-link" href="/login">{t('signIn')}</Link></div></main>;
  const [{data:profile},{data:summaryData},{data:reconciliations,error:reconciliationError}]=await Promise.all([
    supabase.from('profiles').select('role').eq('id',sellerId).maybeSingle(),
    supabase.rpc('seller_revenue_summary',{p_from:from.toISOString(),p_to:to.toISOString()}),
    supabase.from('seller_reconciliations').select('id,gross_amount,status,payout_reference,reconciled_at,created_at,order_items(product_title,order_id)').eq('seller_id',sellerId).order('created_at',{ascending:false}).limit(10)
  ]);
  if(profile?.role!=='seller'&&profile?.role!=='admin')return <main className="seller-page page-main"><div className="empty">{t('sellerAccessRequired')} <Link className="nav-link" href="/dashboard/apply">{t('applyNow')}</Link></div></main>;
  const summary=(summaryData||null) as RevenueSummary|null;
  if(!summary)return <main className="seller-page page-main"><h1 className="page-title">{t('revenue')}</h1><div className="alert-note">{t('notConfigured')}</div></main>;
  const maxDaily=Math.max(1,...summary.daily.map(day=>day.amount));
  const rangeLink=(days:number)=>`/dashboard/revenue?days=${days}`;
  return <main className="seller-page page-main"><div className="section-head"><div><span className="eyebrow">{t('sellerCenter')}</span><h1 className="page-title">{t('revenue')}</h1></div><div className="inline-actions">{[7,30,90].map(days=><Link className={`filter${selectedDays===days?' active':''}`} key={days} href={rangeLink(days)}>{t(`days${days}`)}</Link>)}</div></div>
    <form method="get" className="seller-filters"><label>{t('date')}<input className="field" type="date" name="from" defaultValue={fromInput}/></label><label>{t('date')}<input className="field" type="date" name="to" defaultValue={toInput}/></label><button className="button secondary">{t('applyFilters')}</button></form>
    <div className="metric-grid"><article className="metric-card"><span className="muted">{t('salesRevenue')}</span><strong>{formatVnd(summary.gross_revenue,locale)}</strong></article><article className="metric-card"><span className="muted">{t('orderCount')}</span><strong>{summary.order_count.toLocaleString(locale)}</strong></article><article className="metric-card"><span className="muted">{t('pendingSettlement')}</span><strong>{formatVnd(summary.pending_settlement,locale)}</strong></article><article className="metric-card"><span className="muted">{t('reconciled')}</span><strong>{formatVnd(summary.reconciled_total,locale)}</strong></article></div>
    <p className="form-help">{t('settlementNote')}</p><p className="form-help">{t('adjustmentNote')}</p>
    <section className="card-panel"><h2>{t('salesRevenue')}</h2>{summary.daily.every(day=>day.amount===0)?<div className="empty">{t('noPaidSales')}</div>:<div className="chart" role="img" aria-label={`${t('salesRevenue')}: ${formatVnd(summary.gross_revenue,locale)}`}>{summary.daily.map(day=><div key={day.date} className="chart-bar" title={`${day.date}: ${formatVnd(day.amount,locale)}`} style={{height:`${Math.max(3,day.amount/maxDaily*145)}px`}}/>)}</div>}<div className="seller-pagination"><span>{fromInput}</span><span>{toInput}</span></div></section>
    <section className="card-panel"><h2>{t('topProducts')}</h2>{summary.top_products.length?<div className="data-table-wrap"><table className="data-table"><thead><tr><th>{t('product')}</th><th>{t('quantity')}</th><th>{t('amount')}</th></tr></thead><tbody>{summary.top_products.map(item=><tr key={item.product_id}><td>{item.title}</td><td>{item.quantity}</td><td>{formatVnd(item.amount,locale)}</td></tr>)}</tbody></table></div>:<div className="empty">{t('noPaidSales')}</div>}</section>
    <section className="card-panel"><h2>{t('reconciliationHistory')}</h2>{reconciliationError?<p className="alert-note">{t('orderError')}</p>:reconciliations?.length?<div className="data-table-wrap"><table className="data-table"><thead><tr><th>{t('product')}</th><th>{t('date')}</th><th>{t('amount')}</th><th>{t('status')}</th><th>{t('payoutReference')}</th></tr></thead><tbody>{reconciliations.map(row=>{const item=Array.isArray(row.order_items)?row.order_items[0]:row.order_items;return <tr key={row.id}><td>{item?.product_title||'—'}</td><td>{new Date(row.reconciled_at||row.created_at).toLocaleDateString(locale)}</td><td>{formatVnd(row.gross_amount,locale)}</td><td><span className="status-pill">{row.status==='reconciled'?t('reconciled'):t('pendingSettlement')}</span></td><td>{row.payout_reference||'—'}</td></tr>;})}</tbody></table></div>:<div className="empty">{t('noReconciliation')}</div>}</section>
  </main>;
}
