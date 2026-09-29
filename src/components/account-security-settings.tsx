'use client';

import {useEffect,useState} from 'react';
import {useLocale,useTranslations} from 'next-intl';
import {createSupabaseBrowserClient} from '@/lib/supabase/browser';

export function AccountSecuritySettings(){
  const t=useTranslations('account');const locale=useLocale();const [hasPassword,setHasPassword]=useState<boolean|null>(null);const [otpRequired,setOtpRequired]=useState(false);const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');
  useEffect(()=>{const supabase=createSupabaseBrowserClient();if(!supabase)return;void supabase.auth.getUser().then(({data})=>setHasPassword(Boolean(data.user?.identities?.some(identity=>identity.provider==='email'))));},[]);
  async function changePassword(form:FormData){
    setBusy(true);setMessage('');const supabase=createSupabaseBrowserClient();if(!supabase){setMessage(t('notConfigured'));setBusy(false);return;}
    const current=String(form.get('current')||'');const password=String(form.get('password')||'');const confirm=String(form.get('confirm')||'');const nonce=String(form.get('nonce')||'');
    if(password.length<8||password!==confirm){setMessage(password.length<8?t('passwordTooShort'):t('passwordMismatch'));setBusy(false);return;}
    if(nonce){const {error}=await supabase.auth.updateUser({password,nonce});setMessage(error?.message||t('passwordUpdated'));setBusy(false);if(!error)setOtpRequired(false);return;}
    const {error}=await supabase.auth.updateUser({current_password:current,password});
    if(error?.code==='reauthentication_needed'){
      const sent=await supabase.auth.reauthenticate();setMessage(sent.error?t('reauthFailed'):t('otpSent'));setOtpRequired(!sent.error);
    }else setMessage(error?.message||t('passwordUpdated'));
    setBusy(false);
  }
  async function sendReset(){
    const supabase=createSupabaseBrowserClient();if(!supabase){setMessage(t('notConfigured'));return;}const {data:{user}}=await supabase.auth.getUser();if(!user?.email){setMessage(t('resetUnavailable'));return;}
    setBusy(true);const next=`/${locale}/reset-password`;const {error}=await supabase.auth.resetPasswordForEmail(user.email,{redirectTo:`${location.origin}/auth/callback?next=${encodeURIComponent(next)}`});setMessage(error?.message||t('resetSent'));setBusy(false);
  }
  return <section className="card-panel account-section"><h2>{t('security')}</h2>{hasPassword===false?<div className="form-grid"><p className="muted">{t('googlePasswordHelp')}</p><button type="button" className="button" disabled={busy} onClick={()=>void sendReset()}>{busy?t('saving'):t('sendPasswordLink')}</button></div>:<form action={changePassword} className="form-grid account-security-form"><label>{t('currentPassword')}<input className="field" name="current" type="password" autoComplete="current-password" required disabled={otpRequired}/></label><label>{t('newPassword')}<input className="field" name="password" type="password" autoComplete="new-password" minLength={8} required/></label><label>{t('confirmPassword')}<input className="field" name="confirm" type="password" autoComplete="new-password" minLength={8} required/></label>{otpRequired&&<label>{t('verificationCode')}<input className="field" name="nonce" inputMode="numeric" autoComplete="one-time-code" required/></label>}<button className="button" disabled={busy}>{busy?t('saving'):t('changePassword')}</button></form>}{message&&<p role="status" className="muted">{message}</p>}</section>;
}
