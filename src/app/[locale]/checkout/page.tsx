import {getTranslations} from 'next-intl/server';
import {CheckoutForm} from '@/components/checkout-form';
import {getCheckoutCatalog} from '@/lib/catalog-server';
import {createSupabaseServerClient} from '@/lib/supabase/server';

export default async function CheckoutPage({params}:{params:Promise<{locale:string}>}){
  const [{locale},t]=await Promise.all([params,getTranslations('checkout')]);const catalog=await getCheckoutCatalog(locale);const supabase=await createSupabaseServerClient();
  let addresses:NonNullable<Parameters<typeof CheckoutForm>[0]['addresses']>=[];let initialName='';let initialEmail='';
  if(supabase){const {data:auth}=await supabase.auth.getClaims();const userId=auth?.claims?.sub;if(typeof userId==='string'){
    const [{data:rows},{data:profile}]=await Promise.all([supabase.from('shipping_addresses').select('id,recipient_name,phone,province,district,ward,address_line,note,is_default').eq('user_id',userId).order('is_default',{ascending:false}),supabase.from('profiles').select('full_name').eq('id',userId).maybeSingle()]);
    addresses=rows||[];initialName=profile?.full_name||'';initialEmail=typeof auth?.claims?.email==='string'?auth.claims.email:'';
  }}
  return <main className="shell page-main"><span className="eyebrow">Munbase</span><h1 className="page-title">{t('title')}</h1><CheckoutForm products={catalog.products} shippingFee={catalog.shippingFee} addresses={addresses} initialName={initialName} initialEmail={initialEmail}/></main>;
}
