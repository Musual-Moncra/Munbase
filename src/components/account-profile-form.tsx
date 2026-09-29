'use client';
import {useState} from 'react';
import {useTranslations} from 'next-intl';
import {useRouter} from '@/i18n/navigation';
import {createSupabaseBrowserClient} from '@/lib/supabase/browser';
export function AccountProfileForm({initial}:{initial:{full_name:string|null;phone:string|null;avatar_url:string|null}}){
  const t=useTranslations('account');const router=useRouter();const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');
  async function save(form:FormData){setBusy(true);setMessage('');const supabase=createSupabaseBrowserClient();if(!supabase){setMessage(t('notConfigured'));setBusy(false);return;}
    const {data:{user}}=await supabase.auth.getUser();if(!user){setMessage(t('signIn'));setBusy(false);return;}
    const values={full_name:String(form.get('name')||'').trim(),phone:String(form.get('phone')||'').trim()||null,avatar_url:String(form.get('avatar')||'').trim()||null,updated_at:new Date().toISOString()};
    const {error}=await supabase.from('profiles').update(values).eq('id',user.id);setMessage(error?error.message:t('saved'));setBusy(false);router.refresh();
  }
  return <form action={save} className="card-panel form-grid"><label>{t('fullName')}<input className="field" name="name" required minLength={2} maxLength={120} defaultValue={initial.full_name||''}/></label><label>{t('phone')}<input className="field" name="phone" type="tel" maxLength={40} defaultValue={initial.phone||''}/></label><label>{t('avatar')}<input className="field" name="avatar" type="url" defaultValue={initial.avatar_url||''} placeholder="https://…"/></label><button className="button" disabled={busy}>{busy?t('saving'):t('save')}</button>{message&&<p role="status" className="muted">{message}</p>}</form>;
}
