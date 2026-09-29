import {NextIntlClientProvider} from 'next-intl';
import {getMessages} from 'next-intl/server';
import {SiteHeader} from './site-header';
import {Link} from '@/i18n/navigation';

export async function SiteFrame({children,locale}:{children:React.ReactNode;locale:string}) {
  const messages=await getMessages();
  return <NextIntlClientProvider messages={messages}><SiteHeader locale={locale}/>{children}<footer className="shell footer"><span>© 2026 Munbase · Made with care in Vietnam</span><div style={{display:'flex',gap:18}}><Link href="/products">Marketplace</Link><Link href="/dashboard">Seller center</Link><Link href="/admin">Admin</Link></div></footer></NextIntlClientProvider>;
}
