'use client';

import {useState} from 'react';
import {useTranslations} from 'next-intl';
import {useRouter} from '@/i18n/navigation';
import {createSupabaseBrowserClient} from '@/lib/supabase/browser';
import {Eye,EyeOff} from 'lucide-react';

export function ResetPasswordForm() {
  const t = useTranslations('auth');
  const router = useRouter();
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorState,setErrorState]=useState(false);
  const [showPassword,setShowPassword]=useState(false);

  async function submit(data: FormData) {
    setBusy(true);setNotice('');setErrorState(false);
    try{const supabase=createSupabaseBrowserClient();if(!supabase){setNotice(t('notConfigured'));setErrorState(true);return;}
      const password = String(data.get('password') || '');const confirmation=String(data.get('confirmation')||'');
      if(password.length<8){setNotice(t('passwordTooShort'));setErrorState(true);return;}if(password!==confirmation){setNotice(t('passwordMismatch'));setErrorState(true);return;}
      const {error}=await supabase.auth.updateUser({password});if(error){setNotice(error.message);setErrorState(true);}else{setNotice(t('passwordUpdated'));router.push('/login');}
    }catch{setNotice(t('networkError'));setErrorState(true);}finally{setBusy(false);}
  }

  return (
    <form onSubmit={event=>{event.preventDefault();void submit(new FormData(event.currentTarget));}} className="card-panel form-grid" style={{maxWidth: 460}}>
      <label>{t('newPassword')} *<div className="auth-password-row"><input className="field" type={showPassword?'text':'password'} name="password" autoComplete="new-password" minLength={8} required/><button type="button" className="password-toggle" aria-label={showPassword?t('hidePassword'):t('showPassword')} onClick={()=>setShowPassword(!showPassword)}>{showPassword?<EyeOff size={18}/>:<Eye size={18}/>}</button></div></label>
      <label>{t('confirmPassword')} *<input className="field" type={showPassword?'text':'password'} name="confirmation" autoComplete="new-password" minLength={8} required/></label>
      <button className="button" disabled={busy}>{busy ? t('continue') : t('updatePassword')}</button>
      {notice && <p role={errorState?'alert':'status'} className={errorState?'form-error':'form-success'}>{notice}</p>}
    </form>
  );
}
