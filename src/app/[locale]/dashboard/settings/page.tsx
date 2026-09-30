import {createSupabaseServerClient} from '@/lib/supabase/server';
import {getTranslations} from 'next-intl/server';
import {SellerSettingsForm} from '@/components/seller-settings-form';
import {Link} from '@/i18n/navigation';

export default async function SellerSettingsPage(){
  const [t,supabase]=await Promise.all([getTranslations('dashboard'),createSupabaseServerClient()]);
  if(!supabase)return <main className="seller-page page-main"><h1 className="page-title">{t('settings')}</h1><div className="empty">{t('notConfigured')}</div></main>;
  const {data:auth}=await supabase.auth.getClaims();const sellerId=auth?.claims?.sub;
  if(!sellerId)return <main className="seller-page page-main"><h1 className="page-title">{t('settings')}</h1><div className="empty">{t('signInRequired')} <Link href="/login">{t('signIn')}</Link></div></main>;
  const [{data:profile},{data:shop},{data:payout}]=await Promise.all([
    supabase.from('profiles').select('role').eq('id',sellerId).maybeSingle(),
    supabase.from('shops').select('shop_name,description').eq('seller_id',sellerId).maybeSingle(),
    supabase.from('seller_payout_accounts').select('bank_name,bank_account_number,bank_account_name').eq('seller_id',sellerId).maybeSingle()
  ]);
  if(profile?.role!=='seller'&&profile?.role!=='admin')return <main className="seller-page page-main"><div className="empty">{t('sellerAccessRequired')} <Link href="/dashboard/apply">{t('applyNow')}</Link></div></main>;
  return <main className="seller-page page-main"><span className="eyebrow">{t('sellerCenter')}</span><h1 className="page-title">{t('settings')}</h1><SellerSettingsForm initial={{shop_name:shop?.shop_name||'',description:shop?.description||'',bank_name:payout?.bank_name||'',bank_account_number:payout?.bank_account_number||'',bank_account_name:payout?.bank_account_name||''}}/></main>;
}
