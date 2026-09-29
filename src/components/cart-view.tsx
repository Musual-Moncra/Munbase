'use client';

import {useLocale,useTranslations} from 'next-intl';
import {Link} from '@/i18n/navigation';
import {formatVnd,type Product} from '@/lib/catalog';
import {updateCart,useCart} from '@/lib/cart';
import {summarizeCart} from '@/lib/cart-summary';

export function CartView({products}:{products:Product[]}){
  const cart=useCart();
  const locale=useLocale();
  const t=useTranslations('cart');
  const summary=summarizeCart(cart,products,0);
  const productsById=new Map(products.map(product=>[product.id,product]));

  if(!cart.length)return <div className="empty"><p>{t('empty')}</p><Link className="button secondary" href="/products">{t('shop')}</Link></div>;

  return <>
    {summary.unavailableCount>0&&<div className="empty" role="status">
      <p>{t('unavailable',{count:summary.unavailableCount})}</p>
      <button className="button secondary" onClick={()=>updateCart(cart.filter(line=>productsById.has(line.productId)&&!productsById.get(line.productId)?.preview))}>{t('removeUnavailable')}</button>
    </div>}
    {summary.lines.length>0&&<div className="card-panel">
      {summary.lines.map(({line,product})=><div key={line.productId} className="product-meta" style={{padding:'12px 0',borderBottom:'1px solid var(--line)'}}>
        <div><strong>{product.title}</strong><div className="shop-name">{product.seller} · {formatVnd(product.price,locale)}</div></div>
        <div style={{display:'flex',gap:10,alignItems:'center'}}>
          <input aria-label={`${t('quantity')} ${product.title}`} className="field" type="number" min={0} max={99} value={line.quantity} style={{width:72}} onChange={event=>updateCart(cart.map(item=>item.productId===line.productId?{...item,quantity:Number(event.target.value)}:item))}/>
          {formatVnd(product.price*line.quantity,locale)}
        </div>
      </div>)}
      <div className="product-meta" style={{paddingTop:20}}><strong>{t('subtotal')}</strong><strong>{formatVnd(summary.subtotal,locale)}</strong></div>
    </div>}
    {summary.lines.length>0&&<Link className="button" href="/checkout">{t('checkout')}</Link>}
  </>;
}
