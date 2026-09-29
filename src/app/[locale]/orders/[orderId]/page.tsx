import {notFound} from 'next/navigation';
import {createSupabaseServerClient} from '@/lib/supabase/server';
import {formatVnd} from '@/lib/catalog';
import {Link} from '@/i18n/navigation';
import Image from 'next/image';
import {SePayPaymentStatus} from '@/components/sepay-payment-status';
import {getTranslations} from 'next-intl/server';

export default async function OrderDetailPage({params}:{params:Promise<{locale:string;orderId:string}>}){
  const {orderId,locale}=await params;
  const t=await getTranslations('checkout');
  const supabase=await createSupabaseServerClient();
  if(!supabase)return <main className="shell page-main"><div className="empty">Connect Supabase to view this order.</div></main>;
  const {data:claimsData}=await supabase.auth.getClaims();
  const claims=claimsData?.claims;
  if(!claims)return <main className="shell page-main"><div className="empty">Sign in to view your order. <Link href="/login">Sign in</Link></div></main>;
  const {data:order}=await supabase.from('orders').select('id,order_code,payment_status,payment_method,total_amount,shipping_total,created_at').eq('id',orderId).maybeSingle();
  if(!order)notFound();
  const {data:items}=await supabase.from('order_items').select('id,product_title,quantity,unit_price,product_type').eq('order_id',orderId);
  const {data:entitlements}=await supabase.from('digital_entitlements').select('id,order_item_id').eq('buyer_id',claims.sub);
  let qrUrl:string|null=null;
  if(order.payment_method==='sepay'&&order.payment_status==='pending'&&process.env.SEPAY_BANK_ACCOUNT&&process.env.SEPAY_BANK_CODE){
    const qr=new URL('https://vietqr.app/img');
    qr.searchParams.set('acc',process.env.SEPAY_BANK_ACCOUNT);
    qr.searchParams.set('bank',process.env.SEPAY_BANK_CODE);
    qr.searchParams.set('amount',String(order.total_amount));
    qr.searchParams.set('des',`MB${order.order_code}`);
    qr.searchParams.set('template','compact');
    if(process.env.SEPAY_ACCOUNT_NAME)qr.searchParams.set('holder',process.env.SEPAY_ACCOUNT_NAME);
    qrUrl=qr.toString();
  }
  return <main className="shell page-main">
    <span className="eyebrow">Order #{order.order_code}</span>
    <h1 className="page-title">Order details</h1>
    <div className="card-panel">
      <p>Payment: <strong>{order.payment_status}</strong> · {order.payment_method}</p>
      {items?.map(item=><div className="product-meta" key={item.id} style={{padding:'12px 0',borderTop:'1px solid var(--line)'}}><span>{item.product_title} × {item.quantity}</span><span>{formatVnd(item.unit_price*item.quantity,locale)}</span></div>)}
      <div className="product-meta" style={{borderTop:'1px solid var(--line)',paddingTop:16}}><span>Shipping</span><span>{formatVnd(order.shipping_total,locale)}</span></div>
      <div className="product-meta"><strong>Total</strong><strong>{formatVnd(order.total_amount,locale)}</strong></div>
    </div>
    {qrUrl&&<section className="card-panel form-grid" style={{marginTop:24,maxWidth:520}}>
      <h2>{t('scanQr')}</h2>
      <Image src={qrUrl} alt={t('scanQr')} width={320} height={320} unoptimized style={{width:'min(100%,320px)',height:'auto',margin:'0 auto'}} />
      <p className="muted">{t('transferExactAmount')} <strong>{formatVnd(order.total_amount,locale)}</strong></p>
      <p className="muted">{t('transferReference')} <strong>{`MB${order.order_code}`}</strong></p>
      {process.env.SEPAY_ACCOUNT_NAME&&<p className="muted">{t('accountHolder')}: <strong>{process.env.SEPAY_ACCOUNT_NAME}</strong></p>}
      <SePayPaymentStatus />
    </section>}
    {order.payment_status==='paid'&&items?.some(i=>i.product_type==='digital')&&<section><h2>Digital downloads</h2>{items.filter(i=>i.product_type==='digital').map(item=>{const entitlement=entitlements?.find(e=>e.order_item_id===item.id);return <div className="card-panel product-meta" key={item.id}><span>{item.product_title}</span>{entitlement?<a className="button" href={`/api/downloads/${entitlement.id}`}>Download securely</a>:<span className="muted">Preparing download</span>}</div>;})}</section>}
    <Link className="button secondary" href="/orders">All orders</Link>
  </main>;
}
