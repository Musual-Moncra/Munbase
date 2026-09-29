import {getTranslations} from 'next-intl/server';
import {CartView} from '@/components/cart-view';
export default async function CartPage(){const t=await getTranslations('cart');return <main className="shell page-main"><span className="eyebrow">Munbase</span><h1 className="page-title">{t('title')}</h1><CartView/></main>;}
