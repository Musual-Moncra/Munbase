'use client';

import {useState} from 'react';
import {useRouter} from '@/i18n/navigation';
import {useTranslations} from 'next-intl';
import {createSupabaseBrowserClient} from '@/lib/supabase/browser';

type CodOrder={id:string;order_code:number;total_amount:number};

export function AdminPaymentActions({orders}:{orders:CodOrder[]}){
  const t=useTranslations('admin');
  const router=useRouter();
  const [busy,setBusy]=useState<string|null>(null);
  const [message,setMessage]=useState('');
  const [isError,setIsError]=useState(false);

  async function mark(orderId:string,form:FormData){
    setBusy(orderId);setMessage('');setIsError(false);
    try{
      const supabase=createSupabaseBrowserClient();
      if(!supabase){setMessage(t('notConfigured'));setIsError(true);return;}
      const reference=String(form.get('reference')||'');
      const {error}=await supabase.rpc('admin_confirm_cod_remittance',{p_order_id:orderId,p_reference:reference});
      if(error){setMessage(t('transferReview'));setIsError(true);return;}
      setMessage(t('remittanceSaved'));
      router.refresh();
    }catch{
      setMessage(t('transferReview'));setIsError(true);
    }finally{setBusy(null);}
  }

  return <>{orders.map(order=><form onSubmit={event=>{event.preventDefault();void mark(order.id,new FormData(event.currentTarget));}} className="card-panel form-grid" key={order.id}>
    <strong>{t('order')} #{order.order_code} · {new Intl.NumberFormat('vi-VN').format(order.total_amount)} ₫</strong>
    <label>{t('transferReference')}<input className="field" name="reference" required minLength={3} maxLength={120}/></label>
    <button className="button" disabled={busy===order.id}>{busy===order.id?t('saving'):t('confirmReceived')}</button>
  </form>)}{message&&<p role={isError?'alert':'status'} className={isError?'form-error':'form-success'}>{message}</p>}</>;
}
