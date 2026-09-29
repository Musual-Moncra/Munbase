import {NextIntlClientProvider} from 'next-intl';
import {getMessages,getTranslations} from 'next-intl/server';
import {SiteHeader} from './site-header';
import {Link} from '@/i18n/navigation';
import {createSupabaseServerClient} from '@/lib/supabase/server';

export async function SiteFrame({children,locale}:{children:React.ReactNode;locale:string}) {
  const [messages,t,supabase]=await Promise.all([getMessages(),getTranslations('footer'),createSupabaseServerClient()]);
  let isAdmin=false;if(supabase){const {data:auth}=await supabase.auth.getClaims();if(auth?.claims?.sub){const {data}=await supabase.from('profiles').select('role').eq('id',auth.claims.sub).maybeSingle();isAdmin=data?.role==='admin';}}
  return <NextIntlClientProvider messages={messages}><SiteHeader locale={locale}/>{children}<footer className="shell footer"><span>{t('copyright')}</span><div style={{display:'flex',gap:18}}><Link href="/products">{t('marketplace')}</Link><Link href="/dashboard">{t('seller')}</Link>{isAdmin&&<Link href="/admin">{t('admin')}</Link>}</div></footer></NextIntlClientProvider>;
}
