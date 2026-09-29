import type {MetadataRoute} from 'next';
const siteUrl=process.env.NEXT_PUBLIC_SITE_URL||'https://munbase.vercel.app';
export default function robots():MetadataRoute.Robots{return {rules:{userAgent:'*',allow:'/',disallow:['/api/','/*/account','/*/admin','/*/dashboard','/*/orders','/*/checkout']},sitemap:`${siteUrl}/sitemap.xml`};}
