'use client';

import {useState} from 'react';
import {useTranslations} from 'next-intl';
import {useRouter} from '@/i18n/navigation';
import {createSupabaseBrowserClient} from '@/lib/supabase/browser';

type Settings={shop_name:string;description:string;bank_name:string;bank_account_number:string;bank_account_name:string};

export function SellerSettingsForm({initial}:{initial:Settings}){
  const t=useTranslations('sellerSettings');
  const router=useRouter();
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [isError,setIsError]=useState(false);

  async function save(form:FormData){
    setBusy(true);
    setMessage('');
    setIsError(false);
    try{
      const supabase=createSupabaseBrowserClient();
      if(!supabase){setMessage(t('notConfigured'));setIsError(true);return;}
      const {data:{user},error:authError}=await supabase.auth.getUser();
      if(authError||!user){setMessage(t('signIn'));setIsError(true);return;}

      const now=new Date().toISOString();
      const shop={seller_id:user.id,shop_name:String(form.get('shop')||'').trim(),description:String(form.get('description')||'').trim(),updated_at:now};
      const payout={seller_id:user.id,bank_name:String(form.get('bank')||'').trim(),bank_account_number:String(form.get('number')||'').trim(),bank_account_name:String(form.get('holder')||'').trim(),updated_at:now};
      const [shopResult,payoutResult]=await Promise.all([
        supabase.from('shops').upsert(shop),
        supabase.from('seller_payout_accounts').upsert(payout)
      ]);
      const shopFailed=Boolean(shopResult.error);
      const payoutFailed=Boolean(payoutResult.error);
      if(shopFailed&&payoutFailed){setMessage(t('saveFailed'));setIsError(true);}
      else if(shopFailed){setMessage(t('shopSaveFailed'));setIsError(true);}
      else if(payoutFailed){setMessage(t('payoutSaveFailed'));setIsError(true);}
      else{setMessage(t('saved'));}
      if(!shopFailed||!payoutFailed)router.refresh();
    }catch{
      setMessage(t('saveFailed'));
      setIsError(true);
    }finally{
      setBusy(false);
    }
  }

  return <form onSubmit={event=>{event.preventDefault();void save(new FormData(event.currentTarget));}} className="card-panel form-grid">
    <h2>{t('title')}</h2>
    <label>{t('shop')} *<input className="field" name="shop" required minLength={2} maxLength={100} autoComplete="organization" defaultValue={initial.shop_name}/></label>
    <label>{t('description')}<textarea className="field" name="description" maxLength={3000} rows={3} defaultValue={initial.description}/></label>
    <h3>{t('payout')}</h3>
    <p className="muted">{t('private')}</p>
    <label>{t('bank')} *<input className="field" name="bank" required minLength={2} maxLength={80} autoComplete="off" defaultValue={initial.bank_name}/></label>
    <label>{t('accountNumber')} *<input className="field" name="number" required minLength={6} maxLength={40} inputMode="numeric" autoComplete="off" defaultValue={initial.bank_account_number}/></label>
    <label>{t('accountName')} *<input className="field" name="holder" required minLength={2} maxLength={120} autoComplete="off" defaultValue={initial.bank_account_name}/></label>
    <button className="button" disabled={busy}>{busy?t('saving'):t('save')}</button>
    {message&&<p role={isError?'alert':'status'} className={isError?'form-error':'form-success'}>{message}</p>}
  </form>;
}
