'use client';

import {useState} from 'react';
import {useTheme} from 'next-themes';
import {useTranslations} from 'next-intl';
import {createSupabaseBrowserClient} from '@/lib/supabase/browser';
import type {Database} from '@/lib/database.types';

type ThemePreference=Database['public']['Tables']['profiles']['Row']['theme_preference'];

export function AccountThemeSettings({initial}:{initial:ThemePreference}){
  const t=useTranslations('account');const {setTheme}=useTheme();const [preference,setPreference]=useState(initial);const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);
  async function choose(value:ThemePreference){
    setPreference(value);setTheme(value);setMessage('');
    const supabase=createSupabaseBrowserClient();if(!supabase)return;
    const {data:{user}}=await supabase.auth.getUser();if(!user)return;
    setBusy(true);const {error}=await supabase.from('profiles').update({theme_preference:value}).eq('id',user.id);
    setMessage(error?t('saveFailed'):t('saved'));setBusy(false);
  }
  return <section className="card-panel account-section"><h2>{t('appearance')}</h2><p className="muted">{t('appearanceDescription')}</p><fieldset className="theme-options"><legend className="sr-only">{t('appearance')}</legend>{(['system','light','dark'] as const).map(value=><label className={`theme-option${preference===value?' selected':''}`} key={value}><input type="radio" name="theme" value={value} checked={preference===value} onChange={()=>void choose(value)}/><span aria-hidden="true" className={`theme-swatch ${value}`}/><span>{t(`theme_${value}`)}</span></label>)}</fieldset>{busy&&<p role="status" className="muted">{t('saving')}</p>}{message&&<p role="status" className="muted">{message}</p>}</section>;
}
