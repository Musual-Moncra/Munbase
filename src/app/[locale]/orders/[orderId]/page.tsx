import {notFound} from 'next/navigation';
import {createSupabaseServerClient} from '@/lib/supabase/server';
import {formatVnd} from '@/lib/catalog';
import {Link} from '@/i18n/navigation';
import {SePayPaymentStatus} from '@/components/sepay-payment-status';
import {CancelCodOrderButton} from '@/components/cancel-cod-order-button';
import {getTranslations} from 'next-intl/server';

export default async function OrderDetailPage({params}:{params:Promise<{locale:string;orderId:string}>}){
  const {orderId,locale}=await params;const [t,a]=await Promise.all([getTranslations('checkout'),getTranslations('account')]);const supabase=await createSupabaseServerClient();
  if(!supabase)return <main className="shell page-main"><div className="empty">{t('notConfigured')}</div></main>;
  const {data:auth}=await supabase.auth.getClaims();const claims=auth?.claims;if(!claims)return <main className="shell page-main"><div className="empty">{t('signInToView')} <Link href="/login">{t('signInLink')}</Link></div></main>;
  const [{data:order},{data:items},{data:entitlements},{data:shipments}]=await Promise.all([
    supabase.from('orders').select('id,buyer_id,order_code,payment_status,payment_method,total_amount,shipping_total,created_at,expires_at,cancelled_at,cod_remitted_at').eq('id',orderId).maybeSingle(),
    supabase.from('order_items').select('id,product_title,quantity,unit_price,product_type').eq('order_id',orderId),
    supabase.from('digital_entitlements').select('id,order_item_id').eq('buyer_id',claims.sub),
    supabase.from('shipments').select('status').eq('order_id',orderId),
  ]);
  if(!order||order.buyer_id!==claims.sub)notFound();
  let qrUrl:string|null=null;
  if(order.payment_method==='sepay'&&order.payment_status==='pending'&&order.expires_at&&process.env.SEPAY_BANK_ACCOUNT&&process.env.SEPAY_BANK_CODE){
    const qr=new URL('https://vietqr.app/img');qr.searchParams.set('acc',process.env.SEPAY_BANK_ACCOUNT);qr.searchParams.set('bank',process.env.SEPAY_BANK_CODE);qr.searchParams.set('amount',String(order.total_amount));qr.searchParams.set('des',`MB${order.order_code}`);qr.searchParams.set('template','compact');if(process.env.SEPAY_ACCOUNT_NAME)qr.searchParams.set('holder',process.env.SEPAY_ACCOUNT_NAME);qrUrl=qr.toString();
  }
  return <main className="shell page-main"><span className="eyebrow">{t('order')} #{order.order_code}</span><h1 className="page-title">{t('orderDetails')}</h1>
    <div className="card-panel"><p>{t('payment')}: <strong>{a(`paymentStatus_${order.payment_status}`)}</strong> · {a(`paymentMethod_${order.payment_method}`)}</p>{order.expires_at&&order.payment_status==='pending'&&<p className="muted">{t('paymentDeadline')}: {new Date(order.expires_at).toLocaleString(locale)}</p>}{order.cancelled_at&&<p className="muted">{t('cancelledAt')}: {new Date(order.cancelled_at).toLocaleString(locale)}</p>}{order.cod_remitted_at&&<p className="muted">{t('codRemittedAt')}: {new Date(order.cod_remitted_at).toLocaleString(locale)}</p>}{items?.map(item=><div className="product-meta" key={item.id} style={{padding:'12px 0',borderTop:'1px solid var(--line)'}}><span>{item.product_title} × {item.quantity}</span><span>{formatVnd(item.unit_price*item.quantity,locale)}</span></div>)}<div className="product-meta" style={{borderTop:'1px solid var(--line)',paddingTop:16}}><span>{t('shipping')}</span><span>{formatVnd(order.shipping_total,locale)}</span></div><div className="product-meta"><strong>{t('total')}</strong><strong>{formatVnd(order.total_amount,locale)}</strong></div></div>
    {qrUrl&&<SePayPaymentStatus orderId={order.id} expiresAt={order.expires_at} qrUrl={qrUrl} amount={formatVnd(order.total_amount,locale)} reference={`MB${order.order_code}`} accountHolder={process.env.SEPAY_ACCOUNT_NAME||''} accountNumber={process.env.SEPAY_BANK_ACCOUNT||''}/>}
    {order.payment_method==='cod'&&order.payment_status==='pending'&&shipments?.length&&shipments.every(item=>item.status==='pending')&&<section className="card-panel"><p>{t('codPending')}</p><CancelCodOrderButton orderId={order.id}/></section>}
    {order.payment_status==='paid'&&items?.some(i=>i.product_type==='digital')&&<section><h2>{t('downloads')}</h2>{items.filter(i=>i.product_type==='digital').map(item=>{const entitlement=entitlements?.find(e=>e.order_item_id===item.id);return <div className="card-panel product-meta" key={item.id}><span>{item.product_title}</span>{entitlement?<a className="button" href={`/api/downloads/${entitlement.id}`}>{t('download')}</a>:<span className="muted">{t('downloadPreparing')}</span>}</div>;})}</section>}
    <Link className="button secondary" href="/orders">{t('allOrders')}</Link>
  </main>;
}
