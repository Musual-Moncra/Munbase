'use client';

import {useState} from 'react';
import Image from 'next/image';
import {useLocale, useTranslations} from 'next-intl';
import {useRouter} from '@/i18n/navigation';
import {createSupabaseBrowserClient} from '@/lib/supabase/browser';

export function AccountProfileForm({initial,email}:{initial:{full_name:string|null;phone:string|null;avatar_url:string|null};email:string}){
  const t=useTranslations('account');const locale=useLocale();const router=useRouter();const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');
  async function save(form:FormData){
    setBusy(true);setMessage('');const supabase=createSupabaseBrowserClient();if(!supabase){setMessage(t('notConfigured'));setBusy(false);return;}
    const {data:{user}}=await supabase.auth.getUser();if(!user){setMessage(t('signIn'));setBusy(false);return;}
    const file=form.get('avatar_file');let avatarUrl=initial.avatar_url;
    if(file instanceof File&&file.size){
      if(file.size>2*1024*1024||!['image/jpeg','image/png','image/webp'].includes(file.type)){setMessage(t('avatarLimit'));setBusy(false);return;}
      const path=`${user.id}/${crypto.randomUUID()}.${file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg'}`;
      const {error}=await supabase.storage.from('profile-avatars').upload(path,file,{contentType:file.type,upsert:false});
      if(error){setMessage(error.message);setBusy(false);return;}
      avatarUrl=supabase.storage.from('profile-avatars').getPublicUrl(path).data.publicUrl;
    }
    const values={full_name:String(form.get('name')||'').trim(),phone:String(form.get('phone')||'').trim()||null,avatar_url:avatarUrl,updated_at:new Date().toISOString()};
    const {error}=await supabase.from('profiles').update(values).eq('id',user.id);setMessage(error?error.message:t('saved'));setBusy(false);router.refresh();
  }
  async function changeEmail(form:FormData){
    const next=String(form.get('email')||'').trim();if(!next||next.toLowerCase()===email.toLowerCase()){setMessage(t('sameEmail'));return;}
    const supabase=createSupabaseBrowserClient();if(!supabase){setMessage(t('notConfigured'));return;}setBusy(true);setMessage('');
    const {error}=await supabase.auth.updateUser({email:next},{emailRedirectTo:`${location.origin}/auth/callback?next=${encodeURIComponent(`/${locale}/account`)}`});
    setMessage(error?.message||t('emailVerificationSent'));setBusy(false);
  }
  return <section className="card-panel account-section"><h2>{t('profile')}</h2><form action={save} className="form-grid account-profile-form">
    <label>{t('fullName')}<input className="field" name="name" required minLength={2} maxLength={120} defaultValue={initial.full_name||''}/></label>
    <label>{t('phone')}<input className="field" name="phone" type="tel" maxLength={40} autoComplete="tel" defaultValue={initial.phone||''}/></label>
    <label>{t('avatar')}<input className="field" name="avatar_file" type="file" accept="image/jpeg,image/png,image/webp"/><small className="muted">{t('avatarHint')}</small></label>
    {initial.avatar_url&&<Image className="account-avatar" src={initial.avatar_url} alt={t('avatar')} width={72} height={72} unoptimized/>}
    <button className="button" disabled={busy}>{busy?t('saving'):t('save')}</button>
  </form><div className="account-email"><p><strong>{t('currentEmail')}:</strong> {email}</p><form action={changeEmail} className="inline-form"><label>{t('changeEmail')}<input className="field" type="email" name="email" required autoComplete="email"/></label><button className="button secondary" disabled={busy}>{t('sendVerification')}</button></form></div>{message&&<p role="status" className="muted">{message}</p>}</section>;
}
