import {notFound} from 'next/navigation';
import {getTranslations} from 'next-intl/server';
import {getProduct} from '@/lib/catalog-server';
import {formatVnd} from '@/lib/catalog';
import {AddToCart} from '@/components/add-to-cart';
import {Link} from '@/i18n/navigation';
import type {Metadata} from 'next';

export async function generateMetadata({params}:{params:Promise<{slug:string;locale:string}>}):Promise<Metadata>{
  const {slug,locale}=await params;const product=await getProduct(slug,locale);if(!product)return {};
  return {title:`${product.title} · Munbase`,description:product.description?.slice(0,160)||`${product.title} from ${product.seller} on Munbase.`,alternates:{canonical:`/${locale}/products/${slug}`},openGraph:{type:'website',title:product.title,description:product.description?.slice(0,160)||product.seller,images:product.image?[product.image]:[]}};
}

export default async function ProductPage({params}:{params:Promise<{slug:string;locale:string}>}){
  const {slug,locale}=await params; const product=await getProduct(slug,locale); if(!product)notFound(); const t=await getTranslations('products');
  return <main className="shell page-main"><div className="product-detail"><div className="product-image" style={{height:440,background:product.color,...(product.image?{backgroundImage:`url(${product.image})`,backgroundSize:'cover',backgroundPosition:'center'}:{})}}>{!product.image&&<span className="product-mark">{product.mark}</span>}</div><div><span className="eyebrow">{product.category} · {product.type==='digital'?t('digital'):t('physical')}</span><h1 className="page-title">{product.title}</h1><p className="muted">{t('by')} {product.sellerId?<Link className="nav-link" href={`/shops/${product.sellerId}`}>{product.seller}</Link>:product.seller}</p><h2>{formatVnd(product.price,locale)}</h2>{product.type==='physical'&&<p className="muted">{t('stock')}: {product.stockQuantity}</p>}<p className="muted" style={{lineHeight:1.8,whiteSpace:'pre-wrap'}}>{product.description}</p><AddToCart product={product}/></div></div></main>;
}
