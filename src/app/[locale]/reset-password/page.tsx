import {ResetPasswordForm} from '@/components/reset-password-form';
import {getTranslations} from 'next-intl/server';

export default async function ResetPasswordPage() {
  const t = await getTranslations('auth');
  return (
    <main className="shell page-main">
      <span className="eyebrow">{t('eyebrow')}</span>
      <h1 className="page-title">{t('resetPasswordTitle')}</h1>
      <p className="muted">{t('resetPasswordDescription')}</p>
      <ResetPasswordForm />
    </main>
  );
}
