'use client';
import {useRouter} from '@/i18n/navigation';
import {useState} from 'react';
import {useTranslations} from 'next-intl';
import {createSupabaseBrowserClient} from '@/lib/supabase/browser';
export function AdminListingControls({id,active}:{id:string;active:boolean}){const t=useTranslations('admin');const router=useRouter();const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');async function hide(){setBusy(true);setMessage('');const supabase=createSupabaseBrowserClient();if(!supabase){setMessage(t('notConfigured'));setBusy(false);return;}const {error}=await supabase.from('products').update({is_active:false,updated_at:new Date().toISOString()}).eq('id',id);if(error)setMessage(error.message);else{setMessage(t('removed'));router.refresh();}setBusy(false);}return <div><button className="button secondary" disabled={!active||busy} onClick={hide}>{busy?t('saving'):t('removeListing')}</button>{message&&<p role="status" className="muted">{message}</p>}</div>;}
