'use client';

import {useState} from 'react';
import {useRouter} from '@/i18n/navigation';
import {useTranslations} from 'next-intl';
import {createSupabaseBrowserClient} from '@/lib/supabase/browser';

type Event={id:string;amount:number;order_code:number|null;bank_reference:string|null;review_note:string|null;environment:string};
type Refund={id:string;amount:number;reason:string;payment_event_id:string};
type FailedEmail={id:string;recipient:string;template:string;last_error:string|null;attempt_count:number};
type JobRun={id:string;job:string;environment:string|null;status:string;started_at:string;completed_at:string|null;processed_count:number;checkpoint_id:string|null;error_message:string|null};

export function AdminPaymentReview({events,refunds,failedEmails,runs}:{events:Event[];refunds:Refund[];failedEmails:FailedEmail[];runs:JobRun[]}){
  const t=useTranslations('adminOrders');const router=useRouter();const [busy,setBusy]=useState('');const [message,setMessage]=useState('');
  async function allocate(event:Event,form:FormData){
    const code=String(form.get('orderCode')||'').replace(/^MB/i,'').trim();const amount=Number(form.get('amount'));const reason=String(form.get('reason')||'').trim();const evidence=String(form.get('evidence')||'').trim();
    if(!/^\d{1,15}$/.test(code)||!Number.isSafeInteger(amount)||amount<1||reason.length<3){setMessage(t('invalidAmount'));return;}
    const supabase=createSupabaseBrowserClient();if(!supabase){setMessage(t('notConfigured'));return;}
    setBusy(event.id);setMessage('');
    try{
      const {data:order,error:lookupError}=await supabase.from('orders').select('id').eq('order_code',Number(code)).eq('payment_method','sepay').maybeSingle();
      if(lookupError||!order){setMessage(t('noOrders'));return;}
      const {error}=await supabase.rpc('admin_allocate_payment',{p_event_id:event.id,p_order_id:order.id,p_amount:amount,p_reason:reason,p_evidence:evidence,p_request_key:crypto.randomUUID()});
      setMessage(error?error.message:t('paymentSaved'));if(!error)router.refresh();
    }finally{setBusy('');}
  }
  async function refund(event:Event,form:FormData){
    const amount=Number(form.get('refundAmount'));const reason=String(form.get('reason')||'').trim();const evidence=String(form.get('evidence')||'').trim();
    if(!Number.isSafeInteger(amount)||amount<1||reason.length<3){setMessage(t('invalidAmount'));return;}
    const supabase=createSupabaseBrowserClient();if(!supabase){setMessage(t('notConfigured'));return;}
    setBusy(event.id);setMessage('');
    try{
      const {error}=await supabase.rpc('admin_record_payment_refund',{p_event_id:event.id,p_amount:amount,p_order_id:null,p_reason:reason,p_evidence:evidence,p_request_key:crypto.randomUUID()} as never);
      setMessage(error?error.message:t('refundSaved'));if(!error)router.refresh();
    }finally{setBusy('');}
  }
  async function completeRefund(refundId:string,form:FormData){const reference=String(form.get('reference')||'').trim();if(reference.length<3){setMessage(t('referenceRequired'));return;}const supabase=createSupabaseBrowserClient();if(!supabase){setMessage(t('notConfigured'));return;}setBusy(refundId);const {error}=await supabase.rpc('admin_complete_payment_refund',{p_refund_id:refundId,p_reference:reference});setMessage(error?error.message:t('refundSaved'));if(!error)router.refresh();setBusy('');}
  async function retryEmail(id:string){const supabase=createSupabaseBrowserClient();if(!supabase){setMessage(t('notConfigured'));return;}setBusy(id);const {error}=await supabase.rpc('admin_retry_customer_email',{p_id:id});setMessage(error?error.message:t('emailRetrySaved'));if(!error)router.refresh();setBusy('');}
  return <section className="form-grid"><h2>{t('paymentExceptions')}</h2>{events.length?events.map(event=><article className="card-panel form-grid" key={event.id}><strong>{event.environment.toUpperCase()} · {new Intl.NumberFormat('vi-VN').format(event.amount)} ₫ · {event.bank_reference||event.id}</strong><p className="muted">{event.order_code?`MB${event.order_code}`:t('findOrderCode')} · {event.review_note||'needs_review'}</p><form className="form-grid" onSubmit={e=>{e.preventDefault();void allocate(event,new FormData(e.currentTarget));}}><label>{t('findOrderCode')}<input className="field" name="orderCode" defaultValue={event.order_code?`MB${event.order_code}`:''}/></label><label>{t('amount')}<input className="field" name="amount" type="number" min={1} max={event.amount} defaultValue={event.amount}/></label><label>{t('reviewReason')}<input className="field" name="reason" minLength={3} required/></label><label>{t('evidence')}<input className="field" name="evidence"/></label><button className="button" disabled={busy===event.id}>{busy===event.id?'…':t('allocate')}</button></form><details><summary>{t('prepareRefund')}</summary><form className="form-grid" onSubmit={e=>{e.preventDefault();void refund(event,new FormData(e.currentTarget));}}><label>{t('amount')}<input className="field" name="refundAmount" type="number" min={1} max={event.amount} required/></label><label>{t('reviewReason')}<input className="field" name="reason" minLength={3} required/></label><label>{t('evidence')}<input className="field" name="evidence"/></label><button className="button secondary" disabled={busy===event.id}>{t('prepareRefund')}</button></form></details></article>):<div className="empty">—</div>}
    <h2>{t('pendingRefunds')}</h2>{refunds.length?refunds.map(refund=><form className="card-panel inline-form" key={refund.id} onSubmit={e=>{e.preventDefault();void completeRefund(refund.id,new FormData(e.currentTarget));}}><span>{new Intl.NumberFormat('vi-VN').format(refund.amount)} ₫ · {refund.reason}</span><input className="field" name="reference" minLength={3} required placeholder={t('refundReference')}/><button className="button secondary" disabled={busy===refund.id}>{t('confirmRefund')}</button></form>):<div className="empty">—</div>}
    <h2>{t('failedEmails')}</h2>{failedEmails.length?failedEmails.map(email=><article className="card-panel product-meta" key={email.id}><div><strong>{email.template} · {email.recipient}</strong><p className="muted">{email.last_error} · {email.attempt_count}/5</p></div><button className="button secondary" disabled={busy===email.id} onClick={()=>void retryEmail(email.id)}>{t('retryEmail')}</button></article>):<div className="empty">—</div>}{message&&<p role="status" className="muted">{message}</p>}
    <h2>{t('paymentJobHistory')}</h2>{runs.length?runs.map(run=><article className="card-panel" key={run.id}><strong>{run.job} · {run.environment||'—'} · {run.status}</strong><p className="muted">{new Date(run.started_at).toLocaleString()} · {run.processed_count} · {run.error_message||''}</p>{run.checkpoint_id&&<code>{run.checkpoint_id}</code>}</article>):<div className="empty">—</div>}
  </section>;
}
