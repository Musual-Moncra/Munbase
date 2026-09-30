'use client';

import {useTranslations} from 'next-intl';
import {usePathname, Link} from '@/i18n/navigation';
import {ChartNoAxesCombined, ClipboardList, LayoutDashboard, Package, Settings2} from 'lucide-react';

const items = [
  {href:'/dashboard', key:'overview', Icon:LayoutDashboard},
  {href:'/dashboard/products', key:'productsNav', Icon:Package},
  {href:'/dashboard/orders', key:'allOrders', Icon:ClipboardList},
  {href:'/dashboard/revenue', key:'revenue', Icon:ChartNoAxesCombined},
  {href:'/dashboard/settings', key:'settings', Icon:Settings2}
] as const;

export function SellerDashboardNav(){
  const t=useTranslations('dashboard');
  const pathname=usePathname();
  return <aside className="seller-sidebar" aria-label={t('sellerCenter')}>
    {items.map(({href,key,Icon})=>{
      const active=href==='/dashboard'?pathname==='/dashboard':pathname===href||pathname.startsWith(`${href}/`);
      return <Link key={href} href={href} aria-current={active?'page':undefined}><Icon size={17} aria-hidden="true"/>{t(key)}</Link>;
    })}
  </aside>;
}
