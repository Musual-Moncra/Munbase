import {getTranslations} from 'next-intl/server';
import {CheckoutForm} from '@/components/checkout-form';
export default async function CheckoutPage(){const t=await getTranslations('checkout');return <main className="shell page-main"><span className="eyebrow">Munbase</span><h1 className="page-title">{t('title')}</h1><CheckoutForm/></main>;}
