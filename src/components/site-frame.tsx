import {NextIntlClientProvider} from 'next-intl';
import {getMessages,getTranslations} from 'next-intl/server';
import {SiteHeader} from './site-header';
import {Link} from '@/i18n/navigation';

export async function SiteFrame({children,locale}:{children:React.ReactNode;locale:string}) {
  const [messages,t]=await Promise.all([getMessages(),getTranslations('footer')]);
  return <NextIntlClientProvider messages={messages}><SiteHeader locale={locale}/>{children}<footer className="shell footer"><span>{t('copyright')}</span><div style={{display:'flex',gap:18}}><Link href="/products">{t('marketplace')}</Link><Link href="/dashboard">{t('seller')}</Link><Link href="/admin">{t('admin')}</Link></div></footer></NextIntlClientProvider>;
}
