'use client';

import {useState} from 'react';
import {useLocale, useTranslations} from 'next-intl';
import {useRouter} from '@/i18n/navigation';
import {createSupabaseBrowserClient} from '@/lib/supabase/browser';
import {Eye,EyeOff} from 'lucide-react';

type AuthMode = 'in' | 'up' | 'reset';

export function AuthForm() {
  const t = useTranslations('auth');
  const locale = useLocale();
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>('in');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [isError,setIsError]=useState(false);
  const [showPassword,setShowPassword]=useState(false);

  async function submit(data: FormData) {
    setBusy(true);setNotice('');setIsError(false);
    try{
      const supabase = createSupabaseBrowserClient();
      if (!supabase) {setNotice(t('notConfigured'));setIsError(true);return;}
      const email = String(data.get('email')||'').trim();const password = String(data.get('password') || '');
      const next = mode === 'reset' ? `/${locale}/reset-password` : `/${locale}`;
      const callback = `${location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
      if (mode === 'reset') {
        const {error} = await supabase.auth.resetPasswordForEmail(email, {redirectTo: callback});
        setNotice(error?.message ?? t('resetSent'));setIsError(Boolean(error));
      } else if (mode === 'up') {
        const {error} = await supabase.auth.signUp({email,password,options:{data:{full_name:String(data.get('name')||'').trim()},emailRedirectTo:callback}});
        setNotice(error?.message ?? t('checkEmail'));setIsError(Boolean(error));
      } else {
        const {error} = await supabase.auth.signInWithPassword({email,password});
        if (error){setNotice(error.message);setIsError(true);}else router.push('/');
      }
    }catch{setNotice(t('networkError'));setIsError(true);}finally{setBusy(false);}
  }

  async function google() {
    setNotice('');setIsError(false);
    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setNotice(t('notConfigured'));
      setIsError(true);
      return;
    }
    setNotice('');
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      const response = await fetch(`${url}/auth/v1/settings`, {headers: {apikey: key || ''}});
      if (!response.ok) throw new Error('Auth settings unavailable');
      const settings = await response.json();
      if (!settings.external?.google) {
        setNotice(t('googleDisabled'));
        setIsError(true);
        return;
      }

      const next = `/${locale}`;
      const {error} = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}`}
      });
      if (error) {setNotice(error.message);setIsError(true);}
    } catch {
      setNotice(t('googleUnavailable'));setIsError(true);
    }
  }

  const isReset = mode === 'reset';
  return (
    <form onSubmit={event=>{event.preventDefault();void submit(new FormData(event.currentTarget));}} className="card-panel form-grid" style={{maxWidth: 460}}>
      {mode === 'up' && <label>{t('fullName')} *<input className="field" name="name" autoComplete="name" required minLength={2} maxLength={120}/></label>}
      <label>{t('email')} *<input className="field" type="email" name="email" autoComplete="email" required/></label>
      {!isReset && <label>{t('password')} *<div className="auth-password-row"><input className="field" type={showPassword?'text':'password'} name="password" autoComplete={mode==='in'?'current-password':'new-password'} minLength={8} required/><button type="button" className="password-toggle" aria-label={showPassword?t('hidePassword'):t('showPassword')} onClick={()=>setShowPassword(!showPassword)}>{showPassword?<EyeOff size={18}/>:<Eye size={18}/>}</button></div></label>}
      <button className="button" disabled={busy}>
        {busy ? t('continue') : isReset ? t('sendReset') : mode === 'in' ? t('signIn') : t('create')}
      </button>
      {mode === 'in' && <button className="button secondary" type="button" onClick={google}>{t('google')}</button>}
      {notice && <p role={isError?'alert':'status'} className={isError?'form-error':'form-success'}>{notice}</p>}
      {mode === 'in' && <button type="button" className="nav-link" onClick={() => {setMode('reset'); setNotice('');}} style={{background: 'none', border: 0, cursor: 'pointer'}}>{t('forgotPassword')}</button>}
      {isReset && <button type="button" className="nav-link" onClick={() => {setMode('in'); setNotice('');}} style={{background: 'none', border: 0, cursor: 'pointer'}}>{t('existing')}</button>}
      {!isReset && <button type="button" className="nav-link" onClick={() => {setMode(mode === 'in' ? 'up' : 'in'); setNotice('');}} style={{background: 'none', border: 0, cursor: 'pointer'}}>{mode === 'in' ? t('createBuyer') : t('existing')}</button>}
    </form>
  );
}
