import {getLocale,getTranslations} from 'next-intl/server';
import {createSupabaseServerClient} from '@/lib/supabase/server';
import {notFound} from 'next/navigation';
import {Link} from '@/i18n/navigation';
import {formatVnd} from '@/lib/catalog';
import {AdminPaymentActions} from '@/components/admin-payment-actions';
import {ReconciliationList} from '@/components/reconciliation-list';

type Filters={q?:string;status?:string};
export default async function AdminOrdersPage({searchParams}:{searchParams:Promise<Filters>}){
  const [locale,t,adminT,filters]=await Promise.all([getLocale(),getTranslations('adminOrders'),getTranslations('admin'),searchParams]);
  const q=(filters.q||'').trim().slice(0,100).replace(/[%,]/g,' ');
  const status=['pending','paid','cancelled'].includes(filters.status||'')?filters.status:null;
  const supabase=await createSupabaseServerClient();if(!supabase)notFound();
  const {data:auth}=await supabase.auth.getClaims();if(!auth?.claims)notFound();
  const {data:profile}=await supabase.from('profiles').select('role').eq('id',auth.claims.sub).maybeSingle();if(profile?.role!=='admin')notFound();
  let orderQuery=supabase.from('orders').select('id,order_code,customer_name,customer_email,payment_method,payment_status,total_amount,created_at').order('created_at',{ascending:false}).limit(200);
  if(q)orderQuery=orderQuery.ilike('customer_email',`%${q}%`);if(status)orderQuery=orderQuery.eq('payment_status',status);
  const [{data:orders},{data:delivered},{data:reconciliations}]=await Promise.all([
    orderQuery,
    supabase.from('shipments').select('order_id').eq('status','delivered').limit(500),
    supabase.from('seller_reconciliations').select('id,gross_amount,status,seller_id,order_item_id').eq('status','pending').order('created_at',{ascending:false}).limit(100),
  ]);
  const deliveredIds=[...new Set((delivered||[]).map(row=>row.order_id))];
  const [{data:codOrders},{data:payoutRows}]=await Promise.all([
    deliveredIds.length?supabase.from('orders').select('id,order_code,total_amount').in('id',deliveredIds).eq('payment_method','cod').eq('payment_status','pending'):{data:[]},
    reconciliations?.length?supabase.from('seller_payout_accounts').select('seller_id,bank_name,bank_account_number,bank_account_name').in('seller_id',[...new Set(reconciliations.map(row=>row.seller_id))]):{data:[]},
  ]);
  const payouts=Object.fromEntries((payoutRows||[]).map(row=>[row.seller_id,row]));
  return <main className="shell page-main">
    <h1 className="page-title">{t('title')}</h1><p className="muted">{t('subtitle')}</p>
    <form className="inline-form admin-filter-form" method="get"><label>{t('search')}<input className="field" name="q" defaultValue={q}/></label><label>{t('filter')}<select className="field" name="status" defaultValue={status||''}><option value="">{t('all')}</option><option value="pending">{t('pending')}</option><option value="paid">{t('paid')}</option><option value="cancelled">{t('cancelled')}</option></select></label><button className="button secondary">{t('search')}</button></form>
    <h2>{adminT('codRemittance')}</h2>{codOrders?.length?<AdminPaymentActions orders={codOrders}/>:<div className="empty">{adminT('noCodRemittance')}</div>}
    <h2>{adminT('payoutQueue')}</h2>{reconciliations?.length?<ReconciliationList rows={reconciliations} payouts={payouts}/>:<div className="empty">{adminT('noPayoutQueue')}</div>}
    <h2>{t('title')}</h2>{orders?.length?orders.map(order=><article className="card-panel product-meta" key={order.id}><div><strong>#{order.order_code} · {order.customer_name}</strong><p className="muted">{order.customer_email} · {order.payment_method} · {order.payment_status}</p></div><div><strong>{formatVnd(order.total_amount,locale)}</strong><p><Link className="button secondary" href={`/admin/orders/${order.id}`}>{t('details')}</Link></p></div></article>):<div className="empty">{t('noOrders')}</div>}
  </main>;
}
