import {AuthForm} from '@/components/auth-form';
import {getTranslations} from 'next-intl/server';
export default async function LoginPage(){const t=await getTranslations('auth');return <main className="shell page-main"><span className="eyebrow">{t('eyebrow')}</span><h1 className="page-title">{t('title')}</h1><p className="muted">{t('description')}</p><AuthForm/></main>;}
