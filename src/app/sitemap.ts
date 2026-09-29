import type {MetadataRoute} from 'next';
import {routing} from '@/i18n/routing';
import {getProducts} from '@/lib/catalog-server';
const siteUrl=process.env.NEXT_PUBLIC_SITE_URL||'https://munbase.vercel.app';
export default async function sitemap():Promise<MetadataRoute.Sitemap>{
  const rows:MetadataRoute.Sitemap=[];
  for(const locale of routing.locales){
    rows.push({url:`${siteUrl}/${locale}`,changeFrequency:'weekly',priority:1});
    rows.push({url:`${siteUrl}/${locale}/products`,changeFrequency:'daily',priority:.9});
    const products=await getProducts(locale);
    for(const product of products)rows.push({url:`${siteUrl}/${locale}/products/${product.slug}`,lastModified:new Date(),changeFrequency:'weekly',priority:.7});
    for(const sellerId of new Set(products.map(product=>product.sellerId).filter((id):id is string=>Boolean(id))))rows.push({url:`${siteUrl}/${locale}/shops/${sellerId}`,changeFrequency:'weekly',priority:.5});
  }
  return rows;
}
