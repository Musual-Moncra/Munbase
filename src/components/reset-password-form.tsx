'use client';

import {useState} from 'react';
import {useTranslations} from 'next-intl';
import {useRouter} from '@/i18n/navigation';
import {createSupabaseBrowserClient} from '@/lib/supabase/browser';

export function ResetPasswordForm() {
  const t = useTranslations('auth');
  const router = useRouter();
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
    const password = String(data.get('password') || '');
    const {error} = await supabase.auth.updateUser({password});
    if (error) setNotice(error.message);
    else {
      setNotice(t('passwordUpdated'));
      router.push('/login');
    }
    setBusy(false);
  }

  return (
    <form action={submit} className="card-panel form-grid" style={{maxWidth: 460}}>
      <input className="field" type="password" name="password" minLength={8} required placeholder={t('newPassword')} />
      <button className="button" disabled={busy}>{busy ? t('continue') : t('updatePassword')}</button>
      {notice && <p role="status" className="muted">{notice}</p>}
    </form>
  );
}
