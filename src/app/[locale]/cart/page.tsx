import {getTranslations} from 'next-intl/server';
import {CartView} from '@/components/cart-view';
import {getProducts} from '@/lib/catalog-server';
export default async function CartPage({params}:{params:Promise<{locale:string}>}){const [{locale},t]=await Promise.all([params,getTranslations('cart')]);const products=await getProducts(locale);return <main className="shell page-main"><span className="eyebrow">Munbase</span><h1 className="page-title">{t('title')}</h1><CartView products={products}/></main>;}
