'use client';
import {useState} from 'react';
import {useRouter} from '@/i18n/navigation';
import {useTranslations} from 'next-intl';
import {createSupabaseBrowserClient} from '@/lib/supabase/browser';
export function ListingVisibilityButton({id,active}:{id:string;active:boolean}){const t=useTranslations('productForm');const [busy,setBusy]=useState(false);const [error,setError]=useState('');const router=useRouter();async function toggle(){setBusy(true);setError('');const supabase=createSupabaseBrowserClient();if(!supabase){setError(t('notConfigured'));setBusy(false);return;}const {data:{user}}=await supabase.auth.getUser();if(!user){setError(t('signIn'));setBusy(false);return;}const {error}=await supabase.from('products').update({is_active:!active,updated_at:new Date().toISOString()}).eq('id',id).eq('seller_id',user.id);if(error)setError(error.message);else router.refresh();setBusy(false);}return <div><button className="button secondary" disabled={busy} onClick={toggle}>{busy?'…':active?t('hideListing'):t('publishListing')}</button>{error&&<p role="alert" className="muted">{error}</p>}</div>;}
