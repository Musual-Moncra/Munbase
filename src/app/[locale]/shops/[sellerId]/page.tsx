import {notFound} from 'next/navigation';
import {getTranslations} from 'next-intl/server';
import {createSupabaseServerClient} from '@/lib/supabase/server';
import {getProducts} from '@/lib/catalog-server';
import {formatVnd} from '@/lib/catalog';
import {Link} from '@/i18n/navigation';
export default async function ShopPage({params}:{params:Promise<{locale:string;sellerId:string}>}){
  const {locale,sellerId}=await params;const supabase=await createSupabaseServerClient();if(!supabase)notFound();
  const {data:shop}=await supabase.from('shops').select('seller_id,shop_name,description,logo_url').eq('seller_id',sellerId).eq('is_active',true).maybeSingle();if(!shop)notFound();
  const products=(await getProducts(locale)).filter(product=>product.sellerId===sellerId);const t=await getTranslations('products');
  return <main className="shell page-main"><span className="eyebrow">Munbase shop</span><h1 className="page-title">{shop.shop_name}</h1><p className="muted" style={{whiteSpace:'pre-wrap',maxWidth:720,lineHeight:1.8}}>{shop.description}</p><h2>{t('title')}</h2>{products.length?<div className="products">{products.map(product=><Link href={`/products/${product.slug}`} className="product-card" key={product.id}><div className="product-image" style={{background:product.color,...(product.image?{backgroundImage:`url(${product.image})`,backgroundSize:'cover',backgroundPosition:'center'}:{})}}><span className="badge">{product.type==='digital'?t('digital'):t('physical')}</span>{!product.image&&<span className="product-mark">{product.mark}</span>}</div><div className="product-meta"><span className="product-name">{product.title}</span><span className="price">{formatVnd(product.price,locale)}</span></div></Link>)}</div>:<div className="empty">{t('empty')}</div>}</main>;
}
