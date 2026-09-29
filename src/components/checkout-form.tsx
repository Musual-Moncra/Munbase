'use client';
import {useState} from 'react';
import {useTranslations} from 'next-intl';
import {useRouter} from '@/i18n/navigation';
import {Link} from '@/i18n/navigation';
import {useCart} from '@/lib/cart';
import {products,formatVnd} from '@/lib/catalog';

export function CheckoutForm(){
  const t=useTranslations('checkout');const cart=useCart();const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');const router=useRouter();
  const physical=cart.some(x=>products.find(p=>p.id===x.productId)?.type==='physical');
  const total=cart.reduce((n,x)=>n+(products.find(p=>p.id===x.productId)?.price||0)*x.quantity,0);
  async function submit(form:FormData){setBusy(true);setMessage('');try{const response=await fetch('/api/orders',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({items:cart,customer:{name:form.get('name'),email:form.get('email'),phone:form.get('phone'),address:form.get('address')},paymentMethod:form.get('paymentMethod')})});const result=await response.json() as {error?:string;orderId?:string;checkoutUrl?:string};if(!response.ok)throw new Error(result.error||'Unable to create order');localStorage.removeItem('munbase-cart');window.dispatchEvent(new Event('munbase-cart-change'));if(result.checkoutUrl){window.location.href=result.checkoutUrl;return;}router.push(`/orders/${result.orderId}`);}catch(e){setMessage(e instanceof Error?e.message:'Checkout unavailable');}finally{setBusy(false);}}
  if(!cart.length)return <div className="empty">Giỏ hàng đang trống. <Link href="/products">Khám phá sản phẩm</Link></div>;
  return <form action={submit} className="card-panel form-grid"><p className="muted">Giá hiển thị là ước tính. Máy chủ sẽ tải lại giá, tồn kho và phí vận chuyển trước khi tạo đơn.</p><input className="field" name="name" required placeholder="Họ tên"/><input className="field" name="email" type="email" required placeholder="Email nhận hóa đơn"/>{physical&&<><input className="field" name="phone" required placeholder="Số điện thoại"/><textarea className="field" name="address" required placeholder="Địa chỉ giao hàng" rows={3}/></>}<label className="muted">Phương thức thanh toán<select className="field" name="paymentMethod"><option value="sepay">{t('sepay')}</option><option value="payos">{t('payos')}</option>{physical&&<option value="cod">{t('cod')}</option>}</select></label><div className="product-meta"><strong>Items subtotal</strong><strong>{formatVnd(total)}</strong></div><button className="button" disabled={busy}>{busy?'…':t('submit')}</button>{message&&<p role="alert" className="muted">{message}</p>}</form>;
}
