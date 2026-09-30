'use client';
import {useTranslations} from 'next-intl';
import {usePathname,Link} from '@/i18n/navigation';
import {ClipboardList,LayoutDashboard,PackageCheck,Store} from 'lucide-react';

const links=[
  {href:'/admin',key:'title',Icon:LayoutDashboard},
  {href:'/admin/applications',key:'applications',Icon:Store},
  {href:'/admin/products',key:'products',Icon:PackageCheck},
  {href:'/admin/orders',key:'orders',Icon:ClipboardList}
] as const;
export function AdminDashboardNav(){const t=useTranslations('admin');const pathname=usePathname();return <aside className="seller-sidebar" aria-label={t('title')}>{links.map(({href,key,Icon})=>{const active=href==='/admin'?pathname==='/admin':pathname.startsWith(href);return <Link key={href} href={href} aria-current={active?'page':undefined}><Icon size={17} aria-hidden="true"/>{t(key)}</Link>;})}</aside>;}
