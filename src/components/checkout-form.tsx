'use client';

import {useMemo,useState} from 'react';
import {useLocale,useTranslations} from 'next-intl';
import {useRouter,Link} from '@/i18n/navigation';
import {useCart,updateCart} from '@/lib/cart';
import {formatVnd,type Product} from '@/lib/catalog';
import {summarizeCart} from '@/lib/cart-summary';
import type {Tables} from '@/lib/database.types';

type Address=Pick<Tables<'shipping_addresses'>,'id'|'recipient_name'|'phone'|'province'|'district'|'ward'|'address_line'|'note'|'is_default'>;
export function CheckoutForm({products,shippingFee,addresses=[],initialName='',initialEmail=''}:{products:Product[];shippingFee:number;addresses?:Address[];initialName?:string;initialEmail?:string}){
  const t=useTranslations('checkout');
  const cart=useCart();
  const locale=useLocale();
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [addressId,setAddressId]=useState(addresses.find(address=>address.is_default)?.id||'');
  const router=useRouter();
  const productsById=useMemo(()=>new Map(products.map(product=>[product.id,product])),[products]);
  const summary=summarizeCart(cart,products,shippingFee);

  async function submit(form:FormData){
    setBusy(true);
    setMessage('');
    try{
      const selectedAddress=String(form.get('addressId')||'');
      const address=selectedAddress?undefined:{recipient_name:form.get('recipient_name'),phone:form.get('phone'),province:form.get('province'),district:form.get('district'),ward:form.get('ward'),address_line:form.get('address_line'),note:form.get('note')};
      const response=await fetch('/api/orders',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({items:summary.lines.map(({line})=>line),customer:{name:form.get('name'),email:form.get('email'),phone:form.get('phone'),addressId:selectedAddress||undefined,address},paymentMethod:form.get('paymentMethod')})});
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

  return <form onSubmit={event=>{event.preventDefault();void submit(new FormData(event.currentTarget));}} className="card-panel form-grid">
    {summary.unavailableCount>0&&<div className="empty" role="status">
      <p>{t('unavailable',{count:summary.unavailableCount})}</p>
      <button type="button" className="button secondary" onClick={()=>updateCart(cart.filter(line=>productsById.has(line.productId)))}>{t('removeUnavailable')}</button>
    </div>}
    <p className="muted">{t('serverRechecks')}</p>
    <label>{t('name')}<input className="field" name="name" required autoComplete="name" defaultValue={initialName}/></label>
    <label>{t('email')}<input className="field" name="email" type="email" required autoComplete="email" defaultValue={initialEmail}/></label>
    {summary.hasPhysical&&<>
      {addresses.length>0&&<label>{t('savedAddress')}<select className="field" value={addressId} onChange={event=>setAddressId(event.target.value)}><option value="">{t('manualAddress')}</option>{addresses.map(address=><option value={address.id} key={address.id}>{address.recipient_name} · {address.address_line}, {address.province}</option>)}</select></label>}
      {addressId&&addresses.some(address=>address.id===addressId)?<input type="hidden" name="addressId" value={addressId}/>:null}
      <label>{t('recipient')}<input key={addressId||'manual-recipient'} className="field" name="recipient_name" required minLength={2} autoComplete="name" defaultValue={addresses.find(address=>address.id===addressId)?.recipient_name||initialName}/></label>
      <label>{t('phone')}<input key={addressId||'manual-phone'} className="field" name="phone" type="tel" required autoComplete="tel" defaultValue={addresses.find(address=>address.id===addressId)?.phone||''}/></label>
      {!addressId&&<div className="shipping-address-fields"><label>{t('province')}<input className="field" name="province" required minLength={2}/></label><label>{t('district')}<input className="field" name="district" required minLength={2}/></label><label>{t('ward')}<input className="field" name="ward" required minLength={2}/></label><label>{t('addressLine')}<input className="field" name="address_line" required minLength={4} autoComplete="street-address"/></label><label>{t('addressNote')}<input className="field" name="note" maxLength={300}/></label></div>}
      {addressId&&<p className="muted">{[addresses.find(address=>address.id===addressId)?.address_line,addresses.find(address=>address.id===addressId)?.ward,addresses.find(address=>address.id===addressId)?.district,addresses.find(address=>address.id===addressId)?.province].filter(Boolean).join(', ')}</p>}
    </>}
    <label className="muted">{t('paymentMethod')}
      <select className="field" name="paymentMethod" defaultValue="sepay">
        <option value="sepay">{t('sepay')}</option>
        {summary.codEligible&&<option value="cod">{t('cod')}</option>}
      </select>
    </label>
    <div className="product-meta"><span>{t('itemsSubtotal')}</span><strong>{formatVnd(summary.subtotal,locale)}</strong></div>
    {summary.hasPhysical&&<div className="product-meta"><span>{t('shippingEstimate',{sellers:summary.physicalSellerCount})}</span><strong>{formatVnd(summary.shippingTotal,locale)}</strong></div>}
    <div className="product-meta"><strong>{t('estimatedTotal')}</strong><strong>{formatVnd(summary.total,locale)}</strong></div>
    <button className="button" disabled={busy||summary.unavailableCount>0||summary.lines.length===0}>{busy?'…':t('submit')}</button>
    {message&&<p role="alert" className="muted">{message}</p>}
  </form>;
}
