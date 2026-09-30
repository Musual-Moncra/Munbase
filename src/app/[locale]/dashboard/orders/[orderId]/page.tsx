import {notFound} from 'next/navigation';
import {getLocale,getTranslations} from 'next-intl/server';
import {createSupabaseServerClient} from '@/lib/supabase/server';
import {formatVnd} from '@/lib/catalog';
import {Link} from '@/i18n/navigation';
import {ShipmentEditor} from '@/components/shipment-editor';

export default async function SellerOrderDetailPage({params}:{params:Promise<{orderId:string}>}){
  const [{orderId},locale,t]=await Promise.all([params,getLocale(),getTranslations('dashboard')]);
  const supabase=await createSupabaseServerClient();if(!supabase)notFound();
  const {data:auth}=await supabase.auth.getClaims();const sellerId=auth?.claims?.sub;if(!sellerId)notFound();
  const {data:profile}=await supabase.from('profiles').select('role').eq('id',sellerId).maybeSingle();
  if(profile?.role!=='seller'&&profile?.role!=='admin')notFound();
  const [{data:order},{data:shipment}]=await Promise.all([
    supabase.from('orders').select('id,order_code,created_at,paid_at,payment_status,payment_method,customer_name,customer_email,customer_phone,shipping_address,order_items!inner(id,product_title,product_type,quantity,unit_price,seller_id)').eq('id',orderId).eq('order_items.seller_id',sellerId).maybeSingle(),
    supabase.from('shipments').select('id,order_id,status,tracking_number,carrier').eq('order_id',orderId).eq('seller_id',sellerId).maybeSingle()
  ]);
  if(!order)notFound();
  const items=order.order_items;const subtotal=items.reduce((sum,item)=>sum+item.quantity*item.unit_price,0);
  const digitalItemIds=items.filter(item=>item.product_type==='digital').map(item=>item.id);
  const {data:entitlements}=digitalItemIds.length?await supabase.from('digital_entitlements').select('order_item_id').in('order_item_id',digitalItemIds):{data:[]};
  const entitledItems=new Set((entitlements||[]).map(item=>item.order_item_id));
  const address=order.shipping_address&&typeof order.shipping_address==='object'&&!Array.isArray(order.shipping_address)?String((order.shipping_address as Record<string,unknown>).address||''):'';
  return <main className="seller-page page-main"><Link className="nav-link" href="/dashboard/orders">← {t('backToOrders')}</Link><span className="eyebrow">{t('orderDetails')}</span><h1 className="page-title">#{order.order_code}</h1>
    <div className="metric-grid"><article className="metric-card"><span className="muted">{t('payment')}</span><strong>{t(order.payment_status)}</strong><span>{order.payment_method==='cod'?'COD':'SePay'} · {order.paid_at?new Date(order.paid_at).toLocaleString(locale):'—'}</span></article><article className="metric-card"><span className="muted">{t('fulfillment')}</span><strong>{shipment?.status||items.map(item=>item.product_type==='digital'?t('digital'):t('physical')).join(' · ')}</strong><span>{shipment?.tracking_number||'—'}</span></article><article className="metric-card"><span className="muted">{t('customer')}</span><strong>{order.customer_name}</strong><span>{order.customer_email} · {order.customer_phone||'—'}</span></article><article className="metric-card"><span className="muted">{t('total')}</span><strong>{formatVnd(subtotal,locale)}</strong><span>{new Date(order.created_at).toLocaleString(locale)}</span></article></div>
    {address&&<div className="card-panel"><strong>{t('fulfillment')}</strong><p>{address}</p></div>}
    <section className="card-panel"><h2>{t('product')}</h2><div className="data-table-wrap"><table className="data-table"><thead><tr><th>{t('product')}</th><th>{t('fulfillment')}</th><th>{t('quantity')}</th><th>{t('amount')}</th></tr></thead><tbody>{items.map(item=><tr key={item.id}><td>{item.product_title}</td><td>{item.product_type==='digital'?t('digital'):t('physical')}</td><td>{item.quantity}</td><td>{formatVnd(item.quantity*item.unit_price,locale)}</td></tr>)}</tbody></table></div></section>
    {shipment&&<section><h2>{t('fulfillment')}</h2><ShipmentEditor shipment={{...shipment,orders:[{customer_name:order.customer_name,customer_phone:order.customer_phone,shipping_address:order.shipping_address as {address?:string}|null}]}}/></section>}
    {items.some(item=>item.product_type==='digital')&&<section className="card-panel"><h2>{t('digital')}</h2>{items.filter(item=>item.product_type==='digital').map(item=><p key={item.id}>{item.product_title}: <span className="status-pill">{entitledItems.has(item.id)?t('readyToDownload'):t('notAvailableYet')}</span></p>)}</section>}
  </main>;
}
