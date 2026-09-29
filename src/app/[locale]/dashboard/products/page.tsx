import {createSupabaseServerClient} from '@/lib/supabase/server';
import {SellerProductForm} from '@/components/seller-product-form';
import {ListingVisibilityButton} from '@/components/listing-visibility-button';
import {SellerInventoryControl} from '@/components/seller-inventory-control';
import {formatVnd} from '@/lib/catalog';
import {Link} from '@/i18n/navigation';
import {getLocale,getTranslations} from 'next-intl/server';
export default async function SellerProductsPage(){
  const [locale,t]=await Promise.all([getLocale(),getTranslations('productForm')]);const supabase=await createSupabaseServerClient();if(!supabase)return <main className="shell page-main"><h1 className="page-title">{t('manage')}</h1><div className="empty">{t('notConfigured')}</div></main>;
  const {data:auth}=await supabase.auth.getClaims();const claims=auth?.claims;if(!claims)return <main className="shell page-main"><h1 className="page-title">{t('manage')}</h1><div className="empty">{t('signIn')}</div></main>;
  const [{data:profile},{data:products},{data:categories},{data:submissions}]=await Promise.all([
    supabase.from('profiles').select('role').eq('id',claims.sub).maybeSingle(),
    supabase.from('products').select('id,title,price,product_type,is_active,stock_quantity,updated_at,admin_blocked,admin_block_reason').eq('seller_id',claims.sub).order('created_at',{ascending:false}),
    supabase.from('categories').select('id,name').order('slug'),
    supabase.from('product_submissions').select('id,product_id,status,title,rejection_reason,submitted_at,created_at').eq('seller_id',claims.sub).order('created_at',{ascending:false}),
  ]);
  if(profile?.role!=='seller'&&profile?.role!=='admin')return <main className="shell page-main"><div className="empty">{t('sellerApprovalRequired')}</div></main>;
  const categoryOptions=(categories||[]).map(row=>({id:row.id,name:row.name as Record<string,string>}));
  const pendingByProduct=new Map((submissions||[]).filter(x=>x.status==='pending').map(x=>[x.product_id,x]));
  return <main className="shell page-main"><span className="eyebrow">{t('sellerCenter')}</span><h1 className="page-title">{t('manage')}</h1><SellerProductForm categories={categoryOptions}/><h2>{t('listings')}</h2>{products?.length?products.map(p=>{const pending=pendingByProduct.get(p.id);return <div className="card-panel seller-listing-card" key={p.id}><div className="product-meta"><div><strong>{p.title}</strong><div className="shop-name">{p.product_type} · {t('stock')}: {p.stock_quantity} · {p.admin_blocked?t('adminBlocked'):p.is_active?t('active'):t('hidden')}</div>{p.admin_block_reason&&<p className="alert-note">{t('adminReason')}: {p.admin_block_reason}</p>}{pending&&<p className="status-pill">{t('pendingReview')}</p>}</div><strong>{formatVnd(p.price,locale)}</strong></div>{p.product_type==='physical'&&<SellerInventoryControl id={p.id} stock={p.stock_quantity}/>}<div className="inline-actions">{!pending&&<Link className="button secondary" href={`/dashboard/products/${p.id}`}>{t('edit')}</Link>}<ListingVisibilityButton id={p.id} active={p.is_active} blocked={p.admin_blocked}/></div></div>}) : <div className="empty">{t('noProducts')}</div>}{submissions?.some(s=>s.product_id===null)?<section><h2>{t('submissionHistory')}</h2>{submissions.filter(s=>s.product_id===null).map(s=><div className="card-panel" key={s.id}><strong>{s.title}</strong><p className="muted">{t(s.status==='pending'?'pendingReview':s.status==='rejected'?'rejectedReview':s.status==='draft'?'draft':'approvedReview')}</p>{s.rejection_reason&&<p className="alert-note">{t('adminReason')}: {s.rejection_reason}</p>}{(s.status==='draft'||s.status==='rejected')&&<Link className="button secondary" href={`/dashboard/products/submissions/${s.id}`}>{t('edit')}</Link>}</div>)}</section>:null}</main>;
}
