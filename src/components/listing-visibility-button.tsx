'use client';
import {useState} from 'react';
import {useRouter} from '@/i18n/navigation';
import {useTranslations} from 'next-intl';
import {createSupabaseBrowserClient} from '@/lib/supabase/browser';
export function ListingVisibilityButton({id,active,blocked=false}:{id:string;active:boolean;blocked?:boolean}){const t=useTranslations('productForm');const [busy,setBusy]=useState(false);const [error,setError]=useState('');const router=useRouter();async function toggle(){setBusy(true);setError('');const supabase=createSupabaseBrowserClient();if(!supabase){setError(t('notConfigured'));setBusy(false);return;}const {error}=await supabase.rpc('seller_set_product_visibility',{p_product_id:id,p_visible:!active});if(error)setError(error.message);else router.refresh();setBusy(false);}return <div><button className="button secondary" disabled={busy||blocked} onClick={toggle}>{busy?'…':active?t('hideListing'):t('publishListing')}</button>{error&&<p role="alert" className="muted">{error}</p>}</div>;}
