'use client';
import {useLocale,useTranslations} from 'next-intl';
import {Link} from '@/i18n/navigation';
import {products,formatVnd} from '@/lib/catalog';
import {updateCart,useCart} from '@/lib/cart';

export function CartView(){
  const cart=useCart();const locale=useLocale();const t=useTranslations('cart');
  const total=cart.reduce((sum,line)=>sum+(products.find(p=>p.id===line.productId)?.price||0)*line.quantity,0);
  if(!cart.length)return <div className="empty"><p>{t('empty')}</p><Link className="button secondary" href="/products">{t('shop')}</Link></div>;
  return <><div className="card-panel">{cart.map(line=>{const product=products.find(p=>p.id===line.productId);if(!product)return null;return <div key={line.productId} className="product-meta" style={{padding:'12px 0',borderBottom:'1px solid var(--line)'}}><div><strong>{product.title}</strong><div className="shop-name">{product.seller} · {formatVnd(product.price,locale)}</div></div><div style={{display:'flex',gap:10,alignItems:'center'}}><input aria-label={`Quantity ${product.title}`} className="field" type="number" min={0} max={99} value={line.quantity} style={{width:72}} onChange={e=>updateCart(cart.map(x=>x.productId===line.productId?{...x,quantity:Number(e.target.value)}:x))}/>{formatVnd(product.price*line.quantity,locale)}</div></div>})}<div className="product-meta" style={{paddingTop:20}}><strong>Total</strong><strong>{formatVnd(total,locale)}</strong></div></div><Link className="button" href="/checkout">{t('checkout')}</Link></>;
}
