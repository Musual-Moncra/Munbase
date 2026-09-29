import {redirect} from 'next/navigation';
import {getLocale,getTranslations} from 'next-intl/server';
import {createSupabaseServerClient} from '@/lib/supabase/server';
import {SellerApplicationForm} from '@/components/seller-application-form';
import {Link} from '@/i18n/navigation';

export default async function SellerApplicationPage(){
  const [locale,t]=await Promise.all([getLocale(),getTranslations('sellerApply')]);const supabase=await createSupabaseServerClient();
  if(!supabase)return <main className="shell page-main"><h1 className="page-title">{t('title')}</h1><div className="empty">{t('notConfigured')}</div></main>;
  const {data:auth}=await supabase.auth.getClaims();const claims=auth?.claims;
  if(!claims)return <main className="shell page-main"><h1 className="page-title">{t('title')}</h1><div className="empty">{t('signIn')} <Link className="button" href="/login">{t('signInButton')}</Link></div></main>;
  const userId=String(claims.sub);const [{data:profile},{data:application},{data:categories}]=await Promise.all([
    supabase.from('profiles').select('role').eq('id',userId).maybeSingle(),
    supabase.from('seller_applications').select('*').eq('user_id',userId).maybeSingle(),
    supabase.from('categories').select('id,name,slug').order('slug'),
  ]);
  if(profile?.role==='seller'||profile?.role==='admin')redirect(`/${locale}/dashboard`);
  if(application?.submitted_at&&application.status==='pending')return <main className="shell page-main"><span className="eyebrow">{t('eyebrow')}</span><h1 className="page-title">{t('title')}</h1><div className="application-status card-panel"><span className="status-pill">{t('pending')}</span><h2>{application.shop_name}</h2><p className="muted">{t('pendingDescription')}</p><Link className="button secondary" href="/account">{t('viewAccount')}</Link></div></main>;
  const [{data:payout}]=application?await Promise.all([supabase.from('seller_application_payout_accounts').select('bank_name,bank_account_number,bank_account_name').eq('application_id',application.id).maybeSingle()]):[{data:null}];
  const labels=(categories||[]).map(category=>({id:category.id,label:(category.name as Record<string,string>)[locale]||(category.name as Record<string,string>).vi||(category.name as Record<string,string>).en||category.slug}));
  return <main className="shell page-main seller-application-page"><span className="eyebrow">{t('eyebrow')}</span><h1 className="page-title">{t('title')}</h1><p className="muted application-intro">{t('subtitle')}</p>{application?.rejection_reason&&<div className="alert-note">{t('changesRequested')}: {application.rejection_reason}</div>}<SellerApplicationForm categories={labels} initial={application} payout={payout}/></main>;
}
