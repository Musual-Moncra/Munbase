import {notFound} from 'next/navigation';
import {createSupabaseServerClient} from '@/lib/supabase/server';
import {SellerProductForm} from '@/components/seller-product-form';
import {Link} from '@/i18n/navigation';
import {getTranslations} from 'next-intl/server';
export default async function EditSellerProductPage({params}:{params:Promise<{productId:string}>}){
  const [{productId},t]=await Promise.all([params,getTranslations('productForm')]);const supabase=await createSupabaseServerClient();if(!supabase)notFound();
  const {data:auth}=await supabase.auth.getClaims();const claims=auth?.claims;if(!claims)notFound();
  const [{data:profile},{data:product},{data:categories},{data:submission}]=await Promise.all([
    supabase.from('profiles').select('role').eq('id',claims.sub).maybeSingle(),
    supabase.from('products').select('id,title,slug,description,price,product_type,category_id,stock_quantity,digital_file_path,images,admin_blocked,admin_block_reason').eq('id',productId).eq('seller_id',claims.sub).maybeSingle(),
    supabase.from('categories').select('id,name').order('slug'),
    supabase.from('product_submissions').select('id,product_id,status,title,slug,description,price,product_type,category_id,initial_stock,digital_file_path,images,rejection_reason').eq('product_id',productId).eq('seller_id',claims.sub).order('created_at',{ascending:false}).limit(1).maybeSingle(),
  ]);
  if((profile?.role!=='seller'&&profile?.role!=='admin')||!product)notFound();
  if(submission?.status==='pending')return <main className="shell page-main"><h1 className="page-title">{t('editListing')}</h1><p className="status-pill">{t('pendingReview')}</p><p>{t('pendingDescription')}</p><Link className="button secondary" href="/dashboard/products">{t('listings')}</Link></main>;
  const categoryOptions=(categories||[]).map(row=>({id:row.id,name:row.name as Record<string,string>}));
  return <main className="shell page-main"><span className="eyebrow">{t('sellerCenter')}</span><h1 className="page-title">{t('editListing')}</h1><Link className="nav-link" href="/dashboard/products">← {t('listings')}</Link>{product.admin_blocked&&<p className="alert-note">{t('adminReason')}: {product.admin_block_reason||t('adminBlockedHint')}</p>}<SellerProductForm categories={categoryOptions} product={product} submission={submission?.status==='rejected'||submission?.status==='draft'?submission:null}/></main>;
}
