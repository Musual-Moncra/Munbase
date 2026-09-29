'use client';

import {useMemo,useState} from 'react';
import {useLocale,useTranslations} from 'next-intl';
import {useRouter,Link} from '@/i18n/navigation';
import {useCart,updateCart} from '@/lib/cart';
import {formatVnd,type Product} from '@/lib/catalog';
import {summarizeCart} from '@/lib/cart-summary';

export function CheckoutForm({products,shippingFee}:{products:Product[];shippingFee:number}){
  const t=useTranslations('checkout');
  const cart=useCart();
  const locale=useLocale();
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const router=useRouter();
  const productsById=useMemo(()=>new Map(products.map(product=>[product.id,product])),[products]);
  const summary=summarizeCart(cart,products,shippingFee);

  async function submit(form:FormData){
    setBusy(true);
    setMessage('');
    try{
      const response=await fetch('/api/orders',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({items:summary.lines.map(({line})=>line),customer:{name:form.get('name'),email:form.get('email'),phone:form.get('phone'),address:form.get('address')},paymentMethod:form.get('paymentMethod')})});
      const result=await response.json() as {error?:string;orderId?:string;checkoutUrl?:string};
      if(!response.ok)throw new Error(result.error||'Unable to create order');
      localStorage.removeItem('munbase-cart');
      window.dispatchEvent(new Event('munbase-cart-change'));
      if(result.checkoutUrl){window.location.assign(result.checkoutUrl);return;}
      router.push(`/orders/${result.orderId}`);
    }catch(error){
      setMessage(error instanceof Error?error.message:'Checkout unavailable');
    }finally{
      setBusy(false);
    }
  }

  if(!cart.length)return <div className="empty">{t('emptyCart')} <Link href="/products">{t('shop')}</Link></div>;

  return <form action={submit} className="card-panel form-grid">
    {summary.unavailableCount>0&&<div className="empty" role="status">
      <p>{t('unavailable',{count:summary.unavailableCount})}</p>
      <button type="button" className="button secondary" onClick={()=>updateCart(cart.filter(line=>productsById.has(line.productId)&&!productsById.get(line.productId)?.preview))}>{t('removeUnavailable')}</button>
    </div>}
    <p className="muted">{t('serverRechecks')}</p>
    <label>{t('name')}<input className="field" name="name" required autoComplete="name"/></label>
    <label>{t('email')}<input className="field" name="email" type="email" required autoComplete="email"/></label>
    {summary.hasPhysical&&<>
      <label>{t('phone')}<input className="field" name="phone" required autoComplete="tel"/></label>
      <label>{t('address')}<textarea className="field" name="address" required autoComplete="street-address" rows={3}/></label>
    </>}
    <label className="muted">{t('paymentMethod')}
      <select className="field" name="paymentMethod" defaultValue="sepay">
        <option value="sepay">{t('sepay')}</option>
        <option value="payos">{t('payos')}</option>
        {summary.onlyPhysical&&<option value="cod">{t('cod')}</option>}
      </select>
    </label>
    <div className="product-meta"><span>{t('itemsSubtotal')}</span><strong>{formatVnd(summary.subtotal,locale)}</strong></div>
    {summary.hasPhysical&&<div className="product-meta"><span>{t('shippingEstimate',{sellers:summary.physicalSellerCount})}</span><strong>{formatVnd(summary.shippingTotal,locale)}</strong></div>}
    <div className="product-meta"><strong>{t('estimatedTotal')}</strong><strong>{formatVnd(summary.total,locale)}</strong></div>
    <button className="button" disabled={busy||summary.unavailableCount>0||summary.lines.length===0}>{busy?'…':t('submit')}</button>
    {message&&<p role="alert" className="muted">{message}</p>}
  </form>;
}
