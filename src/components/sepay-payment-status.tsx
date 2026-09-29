'use client';

import {useEffect} from 'react';
import {useRouter} from '@/i18n/navigation';
import {useTranslations} from 'next-intl';

export function SePayPaymentStatus(){
  const router=useRouter();
  const t=useTranslations('checkout');
  useEffect(()=>{
    let refreshes=0;
    const timer=window.setInterval(()=>{
      refreshes+=1;
      router.refresh();
      if(refreshes>=180)window.clearInterval(timer);
    },5000);
    return ()=>window.clearInterval(timer);
  },[router]);
  return <p className="muted" role="status" aria-live="polite">{t('waitingPayment')}</p>;
}
