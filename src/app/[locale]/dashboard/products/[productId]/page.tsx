import {notFound} from 'next/navigation';
import {createSupabaseServerClient} from '@/lib/supabase/server';
import {SellerProductForm} from '@/components/seller-product-form';
import {Link} from '@/i18n/navigation';
import {getTranslations} from 'next-intl/server';
export default async function EditSellerProductPage({params}:{params:Promise<{productId:string}>}){
  const [{productId},t]=await Promise.all([params,getTranslations('productForm')]);const supabase=await createSupabaseServerClient();if(!supabase)notFound();
  const {data:auth}=await supabase.auth.getClaims();const claims=auth?.claims;if(!claims)notFound();
  const [{data:profile},{data:product},{data:categories}]=await Promise.all([
    supabase.from('profiles').select('role').eq('id',claims.sub).maybeSingle(),
    supabase.from('products').select('id,title,description,price,product_type,category_id,stock_quantity,digital_file_path,images').eq('id',productId).eq('seller_id',claims.sub).maybeSingle(),
    supabase.from('categories').select('id,name').order('slug'),
  ]);
  if((profile?.role!=='seller'&&profile?.role!=='admin')||!product)notFound();
  const categoryOptions=(categories||[]).map(row=>({id:row.id,name:row.name as Record<string,string>}));
  return <main className="shell page-main"><span className="eyebrow">{t('sellerCenter')}</span><h1 className="page-title">{t('editListing')}</h1><Link className="nav-link" href="/dashboard/products">← {t('listings')}</Link><SellerProductForm categories={categoryOptions} product={product}/></main>;
}
