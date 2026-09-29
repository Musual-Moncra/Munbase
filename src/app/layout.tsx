import type {Metadata} from 'next';
import './globals.css';
import {ThemeProvider} from '@/components/theme-provider';
import {getLocale} from 'next-intl/server';

const siteUrl=process.env.NEXT_PUBLIC_SITE_URL||'https://munbase.vercel.app';
export const metadata: Metadata = {
  title: 'Munbase — Chợ tuyển chọn từ Việt Nam',
  description: 'Khám phá sản phẩm Việt Nam và gặp gỡ những người làm ra chúng.',
  metadataBase:new URL(siteUrl),
  alternates:{languages:{vi:'/vi',en:'/en',ko:'/ko',zh:'/zh',ja:'/ja'}},
  openGraph:{type:'website',siteName:'Munbase',title:'Munbase — Chợ tuyển chọn từ Việt Nam',description:'Khám phá sản phẩm Việt Nam và gặp gỡ những người làm ra chúng.',url:siteUrl},
  robots:{index:true,follow:true},
};

export default async function RootLayout({children}: Readonly<{children: React.ReactNode}>) {
  const locale=await getLocale();
  return <html lang={locale} suppressHydrationWarning data-scroll-behavior="smooth"><body><ThemeProvider>{children}</ThemeProvider></body></html>;
}
