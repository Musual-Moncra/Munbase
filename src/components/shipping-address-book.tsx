'use client';

import {useState} from 'react';
import {useTranslations} from 'next-intl';
import {useRouter} from '@/i18n/navigation';
import {createSupabaseBrowserClient} from '@/lib/supabase/browser';
import type {Tables} from '@/lib/database.types';

type Address=Tables<'shipping_addresses'>;
const empty={recipient_name:'',phone:'',province:'',district:'',ward:'',address_line:'',note:''};

export function ShippingAddressBook({initial}:{initial:Address[]}){
  const t=useTranslations('addressBook');
  const router=useRouter();
  const [addresses,setAddresses]=useState(initial);
  const [editing,setEditing]=useState<Address|null>(null);
  const [adding,setAdding]=useState(false);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [isError,setIsError]=useState(false);

  async function save(form:FormData){
    setBusy(true);setMessage('');setIsError(false);
    try{
      const supabase=createSupabaseBrowserClient();
      if(!supabase){setMessage(t('notConfigured'));setIsError(true);return;}
      const {data:{user},error:authError}=await supabase.auth.getUser();
      if(authError||!user){setMessage(t('signIn'));setIsError(true);return;}
      const values={recipient_name:String(form.get('recipient_name')||'').trim(),phone:String(form.get('phone')||'').trim(),province:String(form.get('province')||'').trim(),district:String(form.get('district')||'').trim(),ward:String(form.get('ward')||'').trim(),address_line:String(form.get('address_line')||'').trim(),note:String(form.get('note')||'').trim(),updated_at:new Date().toISOString()};
      const result=editing?await supabase.from('shipping_addresses').update(values).eq('id',editing.id).eq('user_id',user.id).select().single():await supabase.from('shipping_addresses').insert({...values,user_id:user.id,is_default:false}).select().single();
      if(result.error){setMessage(result.error.message);setIsError(true);return;}
      setAddresses([...addresses.filter(item=>item.id!==result.data.id),result.data]);
      setEditing(null);setAdding(false);setMessage(t('saved'));router.refresh();
    }catch{setMessage(t('saveFailed'));setIsError(true);}
    finally{setBusy(false);}
  }

  async function makeDefault(id:string){
    setBusy(true);setMessage('');setIsError(false);
    try{
      const supabase=createSupabaseBrowserClient();
      if(!supabase){setMessage(t('notConfigured'));setIsError(true);return;}
      const {error}=await supabase.rpc('set_default_shipping_address',{p_address_id:id});
      if(error){setMessage(error.message);setIsError(true);return;}
      setAddresses(addresses.map(item=>({...item,is_default:item.id===id})));setMessage(t('defaultSaved'));router.refresh();
    }catch{setMessage(t('saveFailed'));setIsError(true);}
    finally{setBusy(false);}
  }

  async function remove(id:string){
    if(!window.confirm(t('confirmDelete')))return;
    setBusy(true);setMessage('');setIsError(false);
    try{
      const supabase=createSupabaseBrowserClient();
      if(!supabase){setMessage(t('notConfigured'));setIsError(true);return;}
      const {error}=await supabase.from('shipping_addresses').delete().eq('id',id);
      if(error){setMessage(error.message);setIsError(true);return;}
      const removed=addresses.find(item=>item.id===id);
      const next=addresses.filter(item=>item.id!==id);
      setAddresses(next);
      if(removed?.is_default&&next[0]){
        const {error:defaultError}=await supabase.rpc('set_default_shipping_address',{p_address_id:next[0].id});
        if(defaultError){setMessage(t('defaultFailed'));setIsError(true);}
        else{setAddresses(next.map(item=>({...item,is_default:item.id===next[0].id})));setMessage(t('deleted'));}
      }else setMessage(t('deleted'));
      router.refresh();
    }catch{setMessage(t('saveFailed'));setIsError(true);}
    finally{setBusy(false);}
  }

  const formAddress=editing||empty;
  return <section className="card-panel account-section">
    <div className="section-head"><div><h2>{t('title')}</h2><p className="muted">{t('description')}</p></div><button className="button secondary" type="button" disabled={busy} onClick={()=>{setEditing(null);setAdding(true);setMessage('');setIsError(false);}}>{t('add')}</button></div>
    {addresses.length?addresses.map(address=><article className="address-card" key={address.id}><div><div className="product-meta"><strong>{address.recipient_name}</strong>{address.is_default&&<span className="status-pill">{t('default')}</span>}</div><p className="muted">{address.phone} · {address.address_line}, {address.ward}, {address.district}, {address.province}</p>{address.note&&<small className="muted">{address.note}</small>}</div><div className="address-actions"><button className="nav-link" type="button" disabled={busy} onClick={()=>{setEditing(address);setAdding(true);setMessage('');setIsError(false);}}>{t('edit')}</button>{!address.is_default&&<button className="nav-link" type="button" disabled={busy} onClick={()=>void makeDefault(address.id)}>{t('makeDefault')}</button>}<button className="nav-link danger-link" type="button" disabled={busy} onClick={()=>void remove(address.id)}>{t('delete')}</button></div></article>):<div className="empty">{t('empty')}</div>}
    {adding&&<form key={editing?.id||'new'} onSubmit={event=>{event.preventDefault();void save(new FormData(event.currentTarget));}} className="form-grid address-form"><h3>{editing?t('editTitle'):t('addTitle')}</h3>{(['recipient_name','phone','province','district','ward','address_line','note'] as const).map(key=><label key={key}>{t(key)}<input className="field" name={key} required={key!=='note'} defaultValue={formAddress[key]}/></label>)}<div className="address-actions"><button className="button" disabled={busy}>{busy?t('saving'):t('save')}</button><button type="button" className="button secondary" disabled={busy} onClick={()=>{setEditing(null);setAdding(false);}}>{t('cancel')}</button></div></form>}
    {message&&<p role={isError?'alert':'status'} className={isError?'form-error':'form-success'}>{message}</p>}
  </section>;
}
