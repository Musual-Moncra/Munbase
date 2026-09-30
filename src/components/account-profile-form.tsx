'use client';

import {useEffect,useRef,useState} from 'react';
import Image from 'next/image';
import {useLocale, useTranslations} from 'next-intl';
import {useRouter} from '@/i18n/navigation';
import {createSupabaseBrowserClient} from '@/lib/supabase/browser';

export function AccountProfileForm({initial,email}:{initial:{full_name:string|null;phone:string|null;avatar_url:string|null};email:string}){
  const t=useTranslations('account');const locale=useLocale();const router=useRouter();const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');const [isError,setIsError]=useState(false);const [preview,setPreview]=useState(initial.avatar_url);const inputRef=useRef<HTMLInputElement>(null);
  useEffect(()=>{if(!preview||preview===initial.avatar_url)return;return()=>URL.revokeObjectURL(preview);},[preview,initial.avatar_url]);
  function chooseAvatar(file:File|null){setMessage('');setIsError(false);if(!file){setPreview(initial.avatar_url);return;}if(file.size>2*1024*1024||!['image/jpeg','image/png','image/webp'].includes(file.type)){setMessage(t('avatarLimit'));setIsError(true);if(inputRef.current)inputRef.current.value='';setPreview(initial.avatar_url);return;}setPreview(URL.createObjectURL(file));}
  async function save(form:FormData){
    setBusy(true);setMessage('');setIsError(false);const supabase=createSupabaseBrowserClient();if(!supabase){setMessage(t('notConfigured'));setIsError(true);setBusy(false);return;}
    let uploadedPath:string|null=null;
    try{
      const {data:{user}}=await supabase.auth.getUser();if(!user){setMessage(t('signIn'));setIsError(true);return;}
      const file=form.get('avatar_file');let avatarUrl=initial.avatar_url;
      if(file instanceof File&&file.size){
        if(file.size>2*1024*1024||!['image/jpeg','image/png','image/webp'].includes(file.type)){setMessage(t('avatarLimit'));setIsError(true);return;}
        uploadedPath=`${user.id}/${crypto.randomUUID()}.${file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg'}`;
        const {error}=await supabase.storage.from('profile-avatars').upload(uploadedPath,file,{contentType:file.type,upsert:false});
        if(error){setMessage(error.message);setIsError(true);uploadedPath=null;return;}
        avatarUrl=supabase.storage.from('profile-avatars').getPublicUrl(uploadedPath).data.publicUrl;
      }
      const values={full_name:String(form.get('name')||'').trim(),phone:String(form.get('phone')||'').trim()||null,avatar_url:avatarUrl,updated_at:new Date().toISOString()};
      const {error}=await supabase.from('profiles').update(values).eq('id',user.id);
      if(error){if(uploadedPath)await supabase.storage.from('profile-avatars').remove([uploadedPath]);setMessage(error.message);setIsError(true);return;}
      setMessage(t('saved'));if(avatarUrl!==initial.avatar_url){if(inputRef.current)inputRef.current.value='';setPreview(avatarUrl);}router.refresh();
    }catch{if(uploadedPath)await supabase.storage.from('profile-avatars').remove([uploadedPath]);setMessage(t('saveFailed'));setIsError(true);}
    finally{setBusy(false);}
  }
  async function changeEmail(form:FormData){
    const next=String(form.get('email')||'').trim();if(!next||next.toLowerCase()===email.toLowerCase()){setMessage(t('sameEmail'));setIsError(true);return;}
    const supabase=createSupabaseBrowserClient();if(!supabase){setMessage(t('notConfigured'));setIsError(true);return;}setBusy(true);setMessage('');setIsError(false);
    try{const {error}=await supabase.auth.updateUser({email:next},{emailRedirectTo:`${location.origin}/auth/callback?next=${encodeURIComponent(`/${locale}/account`)}`});setMessage(error?.message||t('emailVerificationSent'));setIsError(Boolean(error));}catch{setMessage(t('saveFailed'));setIsError(true);}finally{setBusy(false);}
  }
  return <section className="card-panel account-section"><h2>{t('profile')}</h2><form onSubmit={event=>{event.preventDefault();void save(new FormData(event.currentTarget));}} className="form-grid account-profile-form">
    <label>{t('fullName')} *<input className="field" name="name" required minLength={2} maxLength={120} autoComplete="name" defaultValue={initial.full_name||''}/></label>
    <label>{t('phone')}<input className="field" name="phone" type="tel" maxLength={40} autoComplete="tel" defaultValue={initial.phone||''}/></label>
    <label>{t('avatar')}<input ref={inputRef} className="field" name="avatar_file" type="file" accept="image/jpeg,image/png,image/webp" onChange={event=>chooseAvatar(event.currentTarget.files?.[0]||null)}/><small className="muted">{t('avatarHint')}</small></label>
    {preview&&<Image className="account-avatar" src={preview} alt={t('avatar')} width={88} height={88} unoptimized/>}
    {preview!==initial.avatar_url&&<button type="button" className="button secondary" onClick={()=>{if(inputRef.current)inputRef.current.value='';setPreview(initial.avatar_url);setMessage('');setIsError(false);}}>{t('cancelAvatar')}</button>}
    <button className="button" disabled={busy}>{busy?t('saving'):t('save')}</button>
  </form><div className="account-email"><p><strong>{t('currentEmail')}:</strong> {email}</p><form onSubmit={event=>{event.preventDefault();void changeEmail(new FormData(event.currentTarget));}} className="inline-form"><label>{t('changeEmail')} *<input className="field" type="email" name="email" required autoComplete="email"/></label><button className="button secondary" disabled={busy}>{t('sendVerification')}</button></form></div>{message&&<p role={isError?'alert':'status'} className={isError?'form-error':'form-success'}>{message}</p>}</section>;
}
