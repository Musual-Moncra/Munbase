'use client';

import {useState} from 'react';
import {useTranslations} from 'next-intl';
import {useRouter} from '@/i18n/navigation';
import {createSupabaseBrowserClient} from '@/lib/supabase/browser';

type Shipment={id:string;order_id:string;status:string;tracking_number:string|null;orders?:Array<{customer_name:string;customer_phone:string|null;shipping_address:{address?:string}|null}>};

export function ShipmentEditor({shipment}:{shipment:Shipment}){
  const t=useTranslations('shipment');
  const router=useRouter();
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const [isError,setIsError]=useState(false);

  async function update(form:FormData){
    setBusy(true);
    setMessage('');setIsError(false);
    try{
      const supabase=createSupabaseBrowserClient();
      if(!supabase){setMessage(t('notConfigured'));setIsError(true);return;}
      const status=String(form.get('status'));
      const {error}=await supabase.rpc('seller_update_shipment',{p_shipment_id:shipment.id,p_status:status,p_carrier:String(form.get('carrier')||''),p_tracking_number:String(form.get('tracking')||'')});
      setMessage(error?error.message:t('updated'));setIsError(Boolean(error));
      if(!error)router.refresh();
    }catch{setMessage(t('notConfigured'));setIsError(true);}
    finally{setBusy(false);}
  }

  const order=shipment.orders?.[0];
  return <form onSubmit={event=>{event.preventDefault();void update(new FormData(event.currentTarget));}} className="card-panel form-grid">
    <strong>{t('order')} {shipment.order_id.slice(0,8)}</strong>
    <span className="muted">{order?.customer_name} · {order?.customer_phone||t('noContact')} · {order?.shipping_address?.address||''}</span>
    <span className="muted">{t('status')}: {shipment.status}</span>
    <select className="field" name="status" defaultValue={shipment.status}>
      {shipment.status==='pending'&&<><option value="pending">{t('pending')}</option><option value="ready_to_ship">{t('ready')}</option></>}
      {shipment.status==='ready_to_ship'&&<><option value="ready_to_ship">{t('ready')}</option><option value="shipped">{t('shipped')}</option></>}
      {shipment.status==='shipped'&&<><option value="shipped">{t('shipped')}</option><option value="delivered">{t('delivered')}</option></>}
      {shipment.status==='delivered'&&<option value="delivered">{t('delivered')}</option>}
    </select>
    <input className="field" name="carrier" placeholder={t('carrier')}/>
    <input className="field" name="tracking" defaultValue={shipment.tracking_number||''} placeholder={t('tracking')}/>
    <button className="button" disabled={busy}>{busy?t('saving'):t('save')}</button>
    {message&&<span role={isError?'alert':'status'} className={isError?'form-error':'form-success'}>{message}</span>}
  </form>;
}
