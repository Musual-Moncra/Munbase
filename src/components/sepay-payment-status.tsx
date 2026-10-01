'use client';

import {useEffect,useState} from 'react';
import {useRouter} from '@/i18n/navigation';
import {useTranslations} from 'next-intl';
import Image from 'next/image';

export function SePayPaymentStatus({orderId,expiresAt,qrUrl,amount,reference,accountHolder,accountNumber}:{orderId:string;expiresAt:string|null;qrUrl:string;amount:string;reference:string;accountHolder:string;accountNumber:string}){
  const router=useRouter();
  const t=useTranslations('checkout');
  const [checking,setChecking]=useState(false);
  const [terminal,setTerminal]=useState(false);
  const [expired,setExpired]=useState(false);
  useEffect(()=>{
    let active=true;
    let done=false;
    const deadline=expiresAt?new Date(expiresAt).getTime():0;
    const check=async()=>{
      if(!active||done||document.visibilityState==='hidden')return;
      if(deadline&&Date.now()>=deadline){done=true;setTerminal(true);setExpired(true);router.refresh();return;}
      try{
        const response=await fetch(`/api/orders/${orderId}/status`,{cache:'no-store'});
        if(!response.ok)return;
        const data=await response.json() as {paymentStatus?:string};
        if(data.paymentStatus&&data.paymentStatus!=='pending'){done=true;setTerminal(true);router.refresh();}
      }catch{/* The next check or manual refresh can recover a transient network error. */}
    };
    const timer=window.setInterval(()=>void check(),5000);
    return ()=>{active=false;window.clearInterval(timer);};
  },[expiresAt,orderId,router]);
  const refresh=async()=>{setChecking(true);try{const response=await fetch(`/api/orders/${orderId}/status`,{cache:'no-store'});if(response.ok){const data=await response.json() as {paymentStatus?:string};if(data.paymentStatus&&data.paymentStatus!=='pending')setTerminal(true);}}finally{setChecking(false);router.refresh();}};
  return <section className="card-panel form-grid" style={{marginTop:24,maxWidth:520}}><h2>{t('scanQr')}</h2>{!expired&&<><Image src={qrUrl} alt={t('scanQr')} width={320} height={320} unoptimized style={{width:'min(100%,320px)',height:'auto',margin:'0 auto'}}/><p className="muted">{t('transferExactAmount')} <strong>{amount}</strong></p><p className="muted">{t('receivingAccount')}: <strong>{accountNumber}</strong></p><p className="muted">{t('transferReference')} <strong>{reference}</strong></p>{accountHolder&&<p className="muted">{t('accountHolder')}: <strong>{accountHolder}</strong></p>}</>}<p className="muted" role="status" aria-live="polite">{expired?t('paymentExpired'):terminal?t('paymentStatusUpdated'):t('waitingPayment')}</p><button className="button secondary" type="button" disabled={checking} onClick={()=>void refresh()}>{checking?t('checkingPayment'):t('refreshPayment')}</button></section>;
}
