import {getTranslations} from 'next-intl/server';
import {createSupabaseServerClient} from '@/lib/supabase/server';
import {ReconciliationList} from '@/components/reconciliation-list';
import {AdminPaymentActions} from '@/components/admin-payment-actions';
import {PaymentEventList} from '@/components/payment-event-list';
import {AdminListingControls} from '@/components/admin-listing-controls';
import {formatVnd} from '@/lib/catalog';
import {AdminCategoryForm} from '@/components/admin-category-form';
export default async function AdminPage({params}:{params:Promise<{locale:string}>}){
  const [{locale},t]=await Promise.all([params,getTranslations('admin')]);const supabase=await createSupabaseServerClient();if(!supabase)return <main className="shell page-main"><h1 className="page-title">{t('title')}</h1><div className="empty">Connect Supabase to use admin tools.</div></main>;
  const {data:auth}=await supabase.auth.getClaims();const claims=auth?.claims;if(!claims)return <main className="shell page-main"><h1 className="page-title">{t('title')}</h1><div className="empty">Administrator sign-in required.</div></main>;
  const {data:profile}=await supabase.from('profiles').select('role').eq('id',claims.sub).maybeSingle();if(profile?.role!=='admin')return <main className="shell page-main"><h1 className="page-title">{t('title')}</h1><div className="empty">This account does not have administrator access.</div></main>;
  const [{data:applications},{data:reconciliations},{data:payoutAccounts},{data:events},{data:deliveredShipments},{data:listings},{data:categories}]=await Promise.all([
    supabase.from('seller_applications').select('id,shop_name,description,contact_phone,created_at').eq('status','pending').order('created_at'),
    supabase.from('seller_reconciliations').select('id,gross_amount,status,seller_id,order_item_id').order('created_at',{ascending:false}).limit(50),
    supabase.from('seller_payout_accounts').select('seller_id,bank_name,bank_account_number,bank_account_name'),
    supabase.from('payment_events').select('id,provider,provider_event_id,order_code,amount,created_at,order_id,processed_at').is('processed_at',null).order('created_at',{ascending:false}).limit(50),
    supabase.from('shipments').select('order_id').eq('status','delivered'),
    supabase.from('products').select('id,title,price,is_active,seller_id').order('created_at',{ascending:false}).limit(100),
    supabase.from('categories').select('id,slug,name,icon').order('slug'),
  ]);
  const deliveredIds=[...new Set((deliveredShipments||[]).map(shipment=>shipment.order_id))];
  const {data:codOrders}=deliveredIds.length?await supabase.from('orders').select('id,order_code,total_amount').in('id',deliveredIds).eq('payment_method','cod').eq('payment_status','pending'):{data:[]};
  const payoutMap=Object.fromEntries((payoutAccounts||[]).map(account=>[account.seller_id,account]));
  const listingSellers=[...new Set((listings||[]).map(listing=>listing.seller_id))];
  const {data:shopRows}=listingSellers.length?await supabase.from('shops').select('seller_id,shop_name').in('seller_id',listingSellers):{data:[]};
  const shopMap=new Map((shopRows||[]).map(shop=>[shop.seller_id,shop.shop_name]));
  return <main className="shell page-main"><span className="eyebrow">Admin portal</span><h1 className="page-title">{t('title')}</h1><p className="muted">{t('subtitle')}</p>
    <h2>{t('applications')}</h2>{applications?.length?applications.map(a=><div className="card-panel" key={a.id}><strong>{a.shop_name}</strong><p className="muted">{a.contact_phone} · {a.description}</p><form action="/api/admin/sellers" method="post" style={{display:'flex',gap:10}}><input type="hidden" name="applicationId" value={a.id}/><input type="hidden" name="locale" value={locale}/><button className="button" name="approve" value="true">{t('approve')}</button><button className="button secondary" name="approve" value="false">{t('reject')}</button></form></div>):<div className="empty">{t('noApplications')}</div>}
    <h2>{t('transfers')}</h2>{events?.length?<PaymentEventList rows={events} locale={locale}/>:<div className="empty">{t('noTransfers')}</div>}
    <h2>{t('codRemittance')}</h2>{codOrders?.length?<AdminPaymentActions orders={codOrders}/>:<div className="empty">{t('noCodRemittance')}</div>}
    <h2>{t('payoutQueue')}</h2>{reconciliations?.length?<ReconciliationList rows={reconciliations} payouts={payoutMap}/>:<div className="empty">{t('noPayoutQueue')}</div>}
    <h2>{t('listings')}</h2>{listings?.length?listings.map(listing=><div className="card-panel product-meta" key={listing.id}><div><strong>{listing.title}</strong><div className="shop-name">{shopMap.get(listing.seller_id)||listing.seller_id.slice(0,8)} · {listing.is_active?t('listingLive'):t('listingHidden')}</div><strong>{formatVnd(listing.price,locale)}</strong></div><AdminListingControls id={listing.id} active={listing.is_active}/></div>):<div className="empty">{t('noListings')}</div>}
    <h2>{t('categories')}</h2>{categories?.map(category=><div className="card-panel product-meta" key={category.id}><span>{category.icon} · {category.slug}</span><span>{(category.name as Record<string,string>)[locale]||(category.name as Record<string,string>).vi}</span></div>)}<AdminCategoryForm/>
  </main>;
}
