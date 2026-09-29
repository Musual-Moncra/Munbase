import {getTranslations} from 'next-intl/server';
import {Link} from '@/i18n/navigation';
import {createSupabaseServerClient} from '@/lib/supabase/server';
import {ShipmentEditor} from '@/components/shipment-editor';
import {SellerSettingsForm} from '@/components/seller-settings-form';
export default async function DashboardPage(){
  const t=await getTranslations('dashboard');const supabase=await createSupabaseServerClient();if(!supabase)return <main className="shell page-main"><h1 className="page-title">{t('title')}</h1><div className="empty">{t('notConfigured')}</div></main>;
  const {data:auth}=await supabase.auth.getClaims();const claims=auth?.claims;if(!claims)return <main className="shell page-main"><h1 className="page-title">{t('title')}</h1><p className="muted">{t('signInToApply')}</p><Link className="button" href="/login">{t('signIn')}</Link></main>;
  const [{data:profile},{data:application}]=await Promise.all([supabase.from('profiles').select('role').eq('id',claims.sub).maybeSingle(),supabase.from('seller_applications').select('status,shop_name,submitted_at,rejection_reason').eq('user_id',claims.sub).maybeSingle()]);
  if(profile?.role!=='seller'&&profile?.role!=='admin')return <main className="shell page-main"><span className="eyebrow">{t('eyebrow')}</span><h1 className="page-title">{t('title')}</h1><p className="muted">{t('subtitle')}</p>{application&&<div className="card-panel">{application.shop_name} · {t(application.submitted_at?`application_${application.status}`:'application_draft')}{application.rejection_reason&&<p className="alert-note">{application.rejection_reason}</p>}</div>}<Link className="button" href="/dashboard/apply">{application?.status==='rejected'?t('editApplication'):t('applyNow')}</Link></main>;
  const [{count:productCount},{count:orderCount},{data:shipments},{data:shop},{data:payout}]=await Promise.all([
    supabase.from('products').select('*',{count:'exact',head:true}).eq('seller_id',claims.sub),
    supabase.from('shipments').select('*',{count:'exact',head:true}).eq('seller_id',claims.sub),
    supabase.from('shipments').select('id,status,tracking_number,order_id,orders(customer_name,customer_phone,shipping_address)').eq('seller_id',claims.sub).order('created_at',{ascending:false}).limit(50),
    supabase.from('shops').select('shop_name,description').eq('seller_id',claims.sub).maybeSingle(),
    supabase.from('seller_payout_accounts').select('bank_name,bank_account_number,bank_account_name').eq('seller_id',claims.sub).maybeSingle(),
  ]);
  const initial={shop_name:shop?.shop_name||'',description:shop?.description||'',bank_name:payout?.bank_name||'',bank_account_number:payout?.bank_account_number||'',bank_account_name:payout?.bank_account_name||''};
  return <main className="shell page-main"><span className="eyebrow">{t('sellerCenter')}</span><h1 className="page-title">{t('title')}</h1><p className="muted">{t('subtitle')}</p><div style={{display:'flex',gap:12,flexWrap:'wrap'}}><Link className="button" href="/dashboard/products">{t('manageProducts')}</Link><Link className="button secondary" href="/account">{t('account')}</Link></div><div className="categories" style={{marginTop:22}}><div className="category"><span className="muted">{t('products')}</span><strong>{productCount||0}</strong></div><div className="category"><span className="muted">{t('orders')}</span><strong>{orderCount||0}</strong></div></div><SellerSettingsForm initial={initial}/><h2>{t('orders')}</h2>{shipments?.length?shipments.map(shipment=><ShipmentEditor key={shipment.id} shipment={shipment}/>):<div className="empty">{t('noOrders')}</div>}</main>;
}
