import {getTranslations} from 'next-intl/server';
import {Link,redirect} from '@/i18n/navigation';
import {createSupabaseServerClient} from '@/lib/supabase/server';
import {AccountProfileForm} from '@/components/account-profile-form';
import {formatVnd} from '@/lib/catalog';
export default async function AccountPage({params}:{params:Promise<{locale:string}>}){
  const [{locale},t]=await Promise.all([params,getTranslations('account')]);const supabase=await createSupabaseServerClient();
  if(!supabase)return <main className="shell page-main"><h1 className="page-title">{t('title')}</h1><div className="empty">{t('notConfigured')}</div></main>;
  const {data:auth}=await supabase.auth.getClaims();const userId=auth?.claims?.sub;const email=typeof auth?.claims?.email==='string'?auth.claims.email:'';if(typeof userId!=='string'){redirect({href:'/login',locale});}
  const [{data:profile},{data:application},{data:orders}]=await Promise.all([
    supabase.from('profiles').select('full_name,phone,avatar_url,role').eq('id',userId).maybeSingle(),
    supabase.from('seller_applications').select('status,shop_name,created_at').eq('user_id',userId).maybeSingle(),
    supabase.from('orders').select('id,order_code,total_amount,payment_status,payment_method,created_at').eq('buyer_id',userId).order('created_at',{ascending:false}).limit(25),
  ]);
  return <main className="shell page-main"><span className="eyebrow">Munbase account</span><h1 className="page-title">{t('title')}</h1><p className="muted">{email}</p><h2>{t('profile')}</h2>{profile&&<AccountProfileForm initial={profile}/>}<h2>{t('sellerStatus')}</h2><div className="card-panel"><p>{t('role')}: <strong>{profile?.role||'buyer'}</strong></p>{profile?.role==='seller'||profile?.role==='admin'?<p>{t('shopApproved')} <Link className="nav-link" href="/dashboard">{t('sellerDashboard')}</Link></p>:application?<p>{application.shop_name} · {t(application.status)}</p>:<p>{t('notApplied')} <Link className="nav-link" href="/dashboard">{t('apply')}</Link></p>}</div><h2>{t('orders')}</h2>{orders?.length?orders.map(order=><Link className="card-panel product-meta" href={`/orders/${order.id}`} key={order.id}><div><strong>#{order.order_code}</strong><div className="shop-name">{new Date(order.created_at).toLocaleDateString(locale)}</div></div><span>{order.payment_status} · {order.payment_method}</span><strong>{formatVnd(order.total_amount,locale)}</strong></Link>):<div className="empty">{t('noOrders')}</div>}</main>;
}
