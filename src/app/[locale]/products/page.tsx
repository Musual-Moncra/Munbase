import {getTranslations} from 'next-intl/server';
import {Link} from '@/i18n/navigation';
import {createSupabaseServerClient} from '@/lib/supabase/server';
import {getProducts} from '@/lib/catalog-server';
import {formatVnd} from '@/lib/catalog';

export default async function ProductsPage({searchParams,params}:{searchParams:Promise<{q?:string;type?:string;category?:string;min?:string;max?:string}>;params:Promise<{locale:string}>}){
  const [{q='',type='all',category='',min='',max=''}, {locale},t]=await Promise.all([searchParams,params,getTranslations('products')]);
  const supabase=await createSupabaseServerClient();
  const {data:categoryRows}=supabase?await supabase.from('categories').select('id,name,slug').order('slug'):{data:[]};
  const catalog=await getProducts(locale);
  const minimum=Number(min)||0; const maximum=Number(max)||Number.MAX_SAFE_INTEGER;
  const shown=catalog.filter(product=>(type==='all'||product.type===type)&&(!category||category===product.categoryId)&&product.price>=minimum&&product.price<=maximum&&`${product.title} ${product.seller} ${product.description||''}`.toLocaleLowerCase().includes(q.toLocaleLowerCase()));
  return <main className="shell page-main"><span className="eyebrow">Munbase marketplace</span><h1 className="page-title">{t('title')}</h1><p className="muted">{t('subtitle')}</p>
    <form className="filters" action="/products"><input className="field" name="q" defaultValue={q} placeholder={t('search')} style={{maxWidth:260}}/><select className="field" name="type" defaultValue={type} style={{maxWidth:180}}><option value="all">{t('all')}</option><option value="physical">{t('physical')}</option><option value="digital">{t('digital')}</option></select><select className="field" name="category" defaultValue={category} style={{maxWidth:220}}><option value="">{t('allCategories')}</option>{(categoryRows||[]).map(row=><option key={row.id} value={row.id}>{(row.name as Record<string,string>)[locale]||(row.name as Record<string,string>).vi}</option>)}</select><input className="field" name="min" type="number" min="0" defaultValue={min} placeholder={t('minPrice')} style={{maxWidth:130}}/><input className="field" name="max" type="number" min="0" defaultValue={max} placeholder={t('maxPrice')} style={{maxWidth:130}}/><button className="button" type="submit">{t('filter')}</button></form>
    {shown.length?<div className="products">{shown.map(product=><div className="product-card" key={product.id}><Link href={`/products/${product.slug}`}><div className="product-image" style={{background:product.color,...(product.image?{backgroundImage:`url(${product.image})`,backgroundSize:'cover',backgroundPosition:'center'}:{})}}><span className="badge">{product.type==='digital'?t('digital'):t('physical')}</span>{!product.image&&<span className="product-mark">{product.mark}</span>}</div><div className="product-meta"><span className="product-name">{product.title}</span><span className="price">{formatVnd(product.price,locale)}</span></div></Link>{product.sellerId&&<Link className="shop-name" href={`/shops/${product.sellerId}`}>{product.seller}</Link>}</div>)}</div>:<div className="empty">{catalog.length?t('noResults'):t('empty')}</div>}
  </main>;
}
