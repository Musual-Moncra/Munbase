'use client';
import {useState} from 'react';
import {useTranslations} from 'next-intl';
import {createSupabaseBrowserClient} from '@/lib/supabase/browser';
export function SellerApplicationForm(){
  const t=useTranslations('sellerForm');const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);
  async function submit(data:FormData){setBusy(true);setMessage('');const supabase=createSupabaseBrowserClient();if(!supabase){setMessage(t('notConfigured'));setBusy(false);return;}
    const {data:{user},error:authError}=await supabase.auth.getUser();if(authError||!user){setMessage(t('signInAgain'));setBusy(false);return;}
    const {error}=await supabase.rpc('submit_seller_application',{p_shop_name:String(data.get('shop')),p_contact_phone:String(data.get('phone')),p_description:String(data.get('description')||'')});
    setMessage(error?error.message:t('pending'));setBusy(false);
  }
  return <form action={submit} className="card-panel form-grid"><input className="field" name="shop" required minLength={2} maxLength={100} placeholder={t('shop')}/><input className="field" name="phone" type="tel" required minLength={7} maxLength={30} placeholder={t('phone')}/><textarea className="field" name="description" rows={4} maxLength={3000} placeholder={t('description')}/><button className="button" disabled={busy}>{busy?t('submitting'):t('submit')}</button>{message&&<p role="status" className="muted">{message}</p>}</form>;
}
