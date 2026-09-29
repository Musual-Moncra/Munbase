'use client';

import {useState} from 'react';
import {useLocale, useTranslations} from 'next-intl';
import {useRouter} from '@/i18n/navigation';
import {createSupabaseBrowserClient} from '@/lib/supabase/browser';

type AuthMode = 'in' | 'up' | 'reset';

export function AuthForm() {
  const t = useTranslations('auth');
  const locale = useLocale();
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>('in');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(data: FormData) {
    setBusy(true);
    setNotice('');
    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setNotice(t('notConfigured'));
      setBusy(false);
      return;
    }

    const email = String(data.get('email'));
    const password = String(data.get('password') || '');
    const next = mode === 'reset' ? `/${locale}/reset-password` : `/${locale}`;
    const callback = `${location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

    if (mode === 'reset') {
      const {error} = await supabase.auth.resetPasswordForEmail(email, {redirectTo: callback});
      setNotice(error?.message ?? t('resetSent'));
    } else if (mode === 'up') {
      const {error} = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {full_name: String(data.get('name') || '')},
          emailRedirectTo: callback
        }
      });
      setNotice(error?.message ?? t('checkEmail'));
    } else {
      const {error} = await supabase.auth.signInWithPassword({email, password});
      if (error) setNotice(error.message);
      else router.push('/');
    }

    setBusy(false);
  }

  async function google() {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setNotice(t('notConfigured'));
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
        return;
      }

      const next = `/${locale}`;
      const {error} = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}`}
      });
      if (error) setNotice(error.message);
    } catch {
      setNotice(t('googleUnavailable'));
    }
  }

  const isReset = mode === 'reset';
  return (
    <form action={submit} className="card-panel form-grid" style={{maxWidth: 460}}>
      {mode === 'up' && <input className="field" name="name" required placeholder={t('fullName')} />}
      <input className="field" type="email" name="email" required placeholder={t('email')} />
      {!isReset && <input className="field" type="password" name="password" minLength={8} required placeholder={t('password')} />}
      <button className="button" disabled={busy}>
        {busy ? t('continue') : isReset ? t('sendReset') : mode === 'in' ? t('signIn') : t('create')}
      </button>
      {mode === 'in' && <button className="button secondary" type="button" onClick={google}>{t('google')}</button>}
      {notice && <p role="status" className="muted">{notice}</p>}
      {mode === 'in' && <button type="button" className="nav-link" onClick={() => {setMode('reset'); setNotice('');}} style={{background: 'none', border: 0, cursor: 'pointer'}}>{t('forgotPassword')}</button>}
      {isReset && <button type="button" className="nav-link" onClick={() => {setMode('in'); setNotice('');}} style={{background: 'none', border: 0, cursor: 'pointer'}}>{t('existing')}</button>}
      {!isReset && <button type="button" className="nav-link" onClick={() => {setMode(mode === 'in' ? 'up' : 'in'); setNotice('');}} style={{background: 'none', border: 0, cursor: 'pointer'}}>{mode === 'in' ? t('createBuyer') : t('existing')}</button>}
    </form>
  );
}
