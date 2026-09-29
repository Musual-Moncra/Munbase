'use client';

import {useState} from 'react';
import {useTranslations} from 'next-intl';
import {useRouter} from '@/i18n/navigation';
import {createSupabaseBrowserClient} from '@/lib/supabase/browser';
import type {Tables} from '@/lib/database.types';

type Address=Tables<'shipping_addresses'>;
const empty={recipient_name:'',phone:'',province:'',district:'',ward:'',address_line:'',note:''};

export function ShippingAddressBook({initial}:{initial:Address[]}){
  const t=useTranslations('addressBook');const router=useRouter();const [addresses,setAddresses]=useState(initial);const [editing,setEditing]=useState<Address|null>(null);const [adding,setAdding]=useState(false);const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');
  async function save(form:FormData){
    setBusy(true);setMessage('');const supabase=createSupabaseBrowserClient();if(!supabase){setMessage(t('notConfigured'));setBusy(false);return;}
    const {data:{user}}=await supabase.auth.getUser();if(!user){setMessage(t('signIn'));setBusy(false);return;}
    const values={recipient_name:String(form.get('recipient_name')||'').trim(),phone:String(form.get('phone')||'').trim(),province:String(form.get('province')||'').trim(),district:String(form.get('district')||'').trim(),ward:String(form.get('ward')||'').trim(),address_line:String(form.get('address_line')||'').trim(),note:String(form.get('note')||'').trim(),updated_at:new Date().toISOString()};
    const result=editing?await supabase.from('shipping_addresses').update(values).eq('id',editing.id).eq('user_id',user.id).select().single():await supabase.from('shipping_addresses').insert({...values,user_id:user.id,is_default:false}).select().single();
    if(result.error){setMessage(result.error.message);setBusy(false);return;}
    const current=[...addresses.filter(item=>item.id!==result.data.id),result.data];setAddresses(current);setEditing(null);setAdding(false);setMessage(t('saved'));router.refresh();setBusy(false);
  }
  async function makeDefault(id:string){const supabase=createSupabaseBrowserClient();if(!supabase)return;setBusy(true);const {error}=await supabase.rpc('set_default_shipping_address',{p_address_id:id});setMessage(error?.message||t('defaultSaved'));if(!error){setAddresses(addresses.map(item=>({...item,is_default:item.id===id})));router.refresh();}setBusy(false);}
  async function remove(id:string){if(!window.confirm(t('confirmDelete')))return;const supabase=createSupabaseBrowserClient();if(!supabase)return;setBusy(true);const {error}=await supabase.from('shipping_addresses').delete().eq('id',id);if(error)setMessage(error.message);else{const next=addresses.filter(item=>item.id!==id);setAddresses(next);if(addresses.find(item=>item.id===id)?.is_default&&next[0])await makeDefault(next[0].id);else setMessage(t('deleted'));router.refresh();}setBusy(false);}
  const formAddress=editing||empty;
  return <section className="card-panel account-section"><div className="section-head"><div><h2>{t('title')}</h2><p className="muted">{t('description')}</p></div><button className="button secondary" type="button" onClick={()=>{setEditing(null);setAdding(true);}}>{t('add')}</button></div>
    {addresses.length?addresses.map(address=><article className="address-card" key={address.id}><div><div className="product-meta"><strong>{address.recipient_name}</strong>{address.is_default&&<span className="status-pill">{t('default')}</span>}</div><p className="muted">{address.phone} · {address.address_line}, {address.ward}, {address.district}, {address.province}</p>{address.note&&<small className="muted">{address.note}</small>}</div><div className="address-actions"><button className="nav-link" type="button" onClick={()=>{setEditing(address);setAdding(true);}}>{t('edit')}</button>{!address.is_default&&<button className="nav-link" type="button" disabled={busy} onClick={()=>void makeDefault(address.id)}>{t('makeDefault')}</button>}<button className="nav-link danger-link" type="button" disabled={busy} onClick={()=>void remove(address.id)}>{t('delete')}</button></div></article>):<div className="empty">{t('empty')}</div>}
    {adding&&<form action={save} className="form-grid address-form"><h3>{editing?t('editTitle'):t('addTitle')}</h3>{(['recipient_name','phone','province','district','ward','address_line','note'] as const).map(key=><label key={key}>{t(key)}<input className="field" name={key} required={key!=='note'} defaultValue={formAddress[key]}/></label>)}<div className="address-actions"><button className="button" disabled={busy}>{busy?t('saving'):t('save')}</button><button type="button" className="button secondary" onClick={()=>{setEditing(null);setAdding(false);}}>{t('cancel')}</button></div></form>}
    {message&&<p role="status" className="muted">{message}</p>}
  </section>;
}
