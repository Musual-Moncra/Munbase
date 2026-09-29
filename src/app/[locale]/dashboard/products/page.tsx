import {createSupabaseServerClient} from '@/lib/supabase/server';
import {SellerProductForm} from '@/components/seller-product-form';
import {ListingVisibilityButton} from '@/components/listing-visibility-button';
import {formatVnd} from '@/lib/catalog';
import {Link} from '@/i18n/navigation';
import {getTranslations} from 'next-intl/server';
export default async function SellerProductsPage({params}:{params:Promise<{locale:string}>}){
  const [{locale},t]=await Promise.all([params,getTranslations('productForm')]);const supabase=await createSupabaseServerClient();if(!supabase)return <main className="shell page-main"><h1 className="page-title">{t('manage')}</h1><div className="empty">{t('notConfigured')}</div></main>;
  const {data:auth}=await supabase.auth.getClaims();const claims=auth?.claims;if(!claims)return <main className="shell page-main"><h1 className="page-title">{t('manage')}</h1><div className="empty">{t('signIn')}</div></main>;
  const [{data:profile},{data:products},{data:categories}]=await Promise.all([
    supabase.from('profiles').select('role').eq('id',claims.sub).maybeSingle(),
    supabase.from('products').select('id,title,price,product_type,is_active,stock_quantity,updated_at').eq('seller_id',claims.sub).order('created_at',{ascending:false}),
    supabase.from('categories').select('id,name').order('slug'),
  ]);
  if(profile?.role!=='seller'&&profile?.role!=='admin')return <main className="shell page-main"><div className="empty">{t('sellerApprovalRequired')}</div></main>;
  const categoryOptions=(categories||[]).map(row=>({id:row.id,name:row.name as Record<string,string>}));
  return <main className="shell page-main"><span className="eyebrow">{t('sellerCenter')}</span><h1 className="page-title">{t('manage')}</h1><SellerProductForm categories={categoryOptions}/><h2>{t('listings')}</h2>{products?.length?products.map(p=><div className="card-panel" key={p.id}><div className="product-meta"><div><strong>{p.title}</strong><div className="shop-name">{p.product_type} · {t('stock')}: {p.stock_quantity} · {p.is_active?t('active'):t('hidden')}</div></div><strong>{formatVnd(p.price,locale)}</strong></div><div style={{display:'flex',gap:10,marginTop:14,flexWrap:'wrap'}}><Link className="button secondary" href={`/dashboard/products/${p.id}`}>{t('edit')}</Link><ListingVisibilityButton id={p.id} active={p.is_active}/></div></div>):<div className="empty">{t('noProducts')}</div>}</main>;
}
