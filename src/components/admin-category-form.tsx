'use client';

import {useState} from 'react';
import {useTranslations} from 'next-intl';
import {useRouter} from '@/i18n/navigation';
import {createSupabaseBrowserClient} from '@/lib/supabase/browser';

export function AdminCategoryForm(){
  const t=useTranslations('admin');
  const router=useRouter();
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [isError,setIsError]=useState(false);

  async function save(form:FormData){
    setBusy(true);setMessage('');setIsError(false);
    try{
      const slug=String(form.get('slug')||'').trim().toLowerCase();
      if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)){setMessage(t('categorySlugError'));setIsError(true);return;}
      const names=Object.fromEntries(['vi','en','ko','zh','ja'].map(locale=>[locale,String(form.get(locale)||'').trim()]));
      if(Object.values(names).some(name=>!name)){setMessage(t('categoryNamesError'));setIsError(true);return;}
      const supabase=createSupabaseBrowserClient();
      if(!supabase){setMessage('Supabase is not configured.');setIsError(true);return;}
      const {error}=await supabase.from('categories').insert({slug,name:names,icon:String(form.get('icon')||'').trim()||null});
      if(error){setMessage(error.message);setIsError(true);return;}
      setMessage(t('categoryAdded'));
      router.refresh();
    }catch{
      setMessage(t('notConfigured'));
      setIsError(true);
    }finally{setBusy(false);}
  }

  return <form onSubmit={event=>{event.preventDefault();void save(new FormData(event.currentTarget));}} className="card-panel form-grid">
    <h3>{t('addCategory')}</h3>
    <label>{t('categorySlug')}<input name="slug" className="field" required maxLength={80} placeholder="digital-creative"/></label>
    {(['vi','en','ko','zh','ja'] as const).map(locale=><label key={locale}>{locale.toUpperCase()}<input name={locale} className="field" required maxLength={100}/></label>)}
    <label>{t('categoryIcon')}<input name="icon" className="field" maxLength={20}/></label>
    <button className="button" disabled={busy}>{busy?t('saving'):t('addCategory')}</button>
    {message&&<p role={isError?'alert':'status'} className={isError?'form-error':'form-success'}>{message}</p>}
  </form>;
}
