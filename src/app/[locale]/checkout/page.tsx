import {getTranslations} from 'next-intl/server';
import {CheckoutForm} from '@/components/checkout-form';
import {getCheckoutCatalog} from '@/lib/catalog-server';
export default async function CheckoutPage({params}:{params:Promise<{locale:string}>}){const [{locale},t]=await Promise.all([params,getTranslations('checkout')]);const catalog=await getCheckoutCatalog(locale);return <main className="shell page-main"><span className="eyebrow">Munbase</span><h1 className="page-title">{t('title')}</h1><CheckoutForm products={catalog.products} shippingFee={catalog.shippingFee}/></main>;}
