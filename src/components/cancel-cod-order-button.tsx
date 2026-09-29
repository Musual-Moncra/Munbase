'use client';
import {useState} from 'react';
import {useRouter} from '@/i18n/navigation';
import {createSupabaseBrowserClient} from '@/lib/supabase/browser';
import {useTranslations} from 'next-intl';
export function CancelCodOrderButton({orderId}:{orderId:string}){const t=useTranslations('checkout');const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');const router=useRouter();async function cancel(){setBusy(true);setMessage('');const supabase=createSupabaseBrowserClient();if(!supabase){setMessage(t('cancelCodError'));setBusy(false);return;}const {data:{user}}=await supabase.auth.getUser();if(!user){setMessage(t('cancelCodError'));setBusy(false);return;}const {error}=await supabase.rpc('cancel_cod_order',{p_order_id:orderId});if(error)setMessage(t('cancelCodError'));else{setMessage(t('codCancelled'));router.refresh();}setBusy(false);}return <div><button className="button secondary" disabled={busy} onClick={cancel}>{busy?'…':t('cancelCod')}</button>{message&&<p role="status" className="muted">{message}</p>}</div>;}
