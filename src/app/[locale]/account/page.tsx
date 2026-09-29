import {getTranslations} from 'next-intl/server';
import {Link,redirect} from '@/i18n/navigation';
import {createSupabaseServerClient} from '@/lib/supabase/server';
import {AccountProfileForm} from '@/components/account-profile-form';
import {AccountSecuritySettings} from '@/components/account-security-settings';
import {AccountThemeSettings} from '@/components/account-theme-settings';
import {ShippingAddressBook} from '@/components/shipping-address-book';
import {formatVnd} from '@/lib/catalog';

export default async function AccountPage({params}:{params:Promise<{locale:string}>}){
  const [{locale},t]=await Promise.all([params,getTranslations('account')]);const supabase=await createSupabaseServerClient();
  if(!supabase)return <main className="shell page-main"><h1 className="page-title">{t('title')}</h1><div className="empty">{t('notConfigured')}</div></main>;
  const {data:auth}=await supabase.auth.getClaims();const userId=auth?.claims?.sub;const email=typeof auth?.claims?.email==='string'?auth.claims.email:'';
  if(typeof userId!=='string')redirect({href:'/login',locale});
  const [{data:profile},{data:application},{data:orders},{data:addresses}]=await Promise.all([
    supabase.from('profiles').select('full_name,phone,avatar_url,role,theme_preference').eq('id',userId).maybeSingle(),
    supabase.from('seller_applications').select('status,shop_name,created_at,submitted_at,rejection_reason').eq('user_id',userId).maybeSingle(),
    supabase.from('orders').select('id,order_code,total_amount,payment_status,payment_method,created_at').eq('buyer_id',userId).order('created_at',{ascending:false}).limit(25),
    supabase.from('shipping_addresses').select('*').eq('user_id',userId).order('is_default',{ascending:false}).order('created_at',{ascending:false}),
  ]);
  const sellerHref=profile?.role==='seller'||profile?.role==='admin'?'/dashboard':application?'/dashboard/apply':'/dashboard/apply';
  return <main className="shell page-main account-page">
    <span className="eyebrow">Munbase account</span><h1 className="page-title">{t('title')}</h1><p className="muted">{email}</p>
    <nav className="account-nav" aria-label={t('sections')}>{[['profile-section','profile'],['address-section','addresses'],['security-section','security'],['appearance-section','appearance'],['orders-section','orders'],['seller-section','sellerStatus']].map(([id,label])=><a key={id} href={`#${id}`}>{t(label)}</a>)}</nav>
    <div className="account-layout"><div className="account-primary" id="profile-section"><AccountProfileForm initial={{full_name:profile?.full_name||null,phone:profile?.phone||null,avatar_url:profile?.avatar_url||null}} email={email}/>
      <div id="address-section"><ShippingAddressBook initial={addresses||[]}/></div>
    </div><aside className="account-secondary">
      <div id="security-section"><AccountSecuritySettings/></div><div id="appearance-section"><AccountThemeSettings initial={profile?.theme_preference||'system'}/></div>
      <section className="card-panel account-section" id="seller-section"><h2>{t('sellerStatus')}</h2><p>{t('role')}: <strong>{t(`role_${profile?.role||'buyer'}`)}</strong></p>{profile?.role==='seller'||profile?.role==='admin'?<p><Link className="nav-link" href="/dashboard">{t('sellerDashboard')}</Link></p>:application?<div><p><strong>{application.shop_name}</strong> · {t(application.submitted_at?application.status:'draft')}</p>{application.rejection_reason&&<p className="alert-note">{application.rejection_reason}</p>}<Link className="button secondary" href={sellerHref}>{application.status==='rejected'?t('editApplication'):t('viewApplication')}</Link></div>:<p>{t('notApplied')} <Link className="nav-link" href={sellerHref}>{t('apply')}</Link></p>}</section>
    </aside></div>
    <section className="account-orders" id="orders-section"><h2>{t('orders')}</h2>{orders?.length?orders.map(order=><Link className="card-panel product-meta account-order" href={`/orders/${order.id}`} key={order.id}><div><strong>#{order.order_code}</strong><div className="shop-name">{new Date(order.created_at).toLocaleDateString(locale)}</div></div><span>{t(`paymentStatus_${order.payment_status}`)} · {t(`paymentMethod_${order.payment_method}`)}</span><strong>{formatVnd(order.total_amount,locale)}</strong></Link>):<div className="empty">{t('noOrders')}</div>}</section>
  </main>;
}
