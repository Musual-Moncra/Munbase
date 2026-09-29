'use client';

import {useRef,useState} from 'react';
import {useTranslations} from 'next-intl';
import {createSupabaseBrowserClient} from '@/lib/supabase/browser';

export function SellerProductForm(){
  const t=useTranslations('productForm');
  const formRef=useRef<HTMLFormElement>(null);
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);

  async function submit(form:FormData){
    setBusy(true);
    setMessage('');
    const supabase=createSupabaseBrowserClient();
    if(!supabase){setMessage(t('notConfigured'));setBusy(false);return;}
    const {data:{user}}=await supabase.auth.getUser();
    if(!user){setMessage(t('signIn'));setBusy(false);return;}
    const type=String(form.get('type'));
    const title=String(form.get('title')).trim();
    const price=Number(form.get('price'));
    const stock=type==='physical'?Number(form.get('stock')):0;
    const file=form.get('file');
    let filePath:string|null=null;
    if(type==='digital'){
      if(!(file instanceof File)||file.size===0){setMessage(t('missingFile'));setBusy(false);return;}
      if(file.size>50*1024*1024){setMessage(t('fileTooLarge'));setBusy(false);return;}
      const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
      filePath=`${user.id}/${crypto.randomUUID()}-${safeName}`;
      const {error}=await supabase.storage.from('digital-assets').upload(filePath,file,{upsert:false});
      if(error){setMessage(error.message);setBusy(false);return;}
    }
    const slug=`${title.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}-${crypto.randomUUID().slice(0,8)}`;
    const image=String(form.get('image')||'').trim();
    const {error}=await supabase.from('products').insert({seller_id:user.id,title,slug,description:String(form.get('description')||''),price,product_type:type,stock_quantity:stock,digital_file_path:filePath,images:image?[image]:[],is_active:true});
    if(error){if(filePath)await supabase.storage.from('digital-assets').remove([filePath]);setMessage(error.message);}
    else{setMessage(t('published'));formRef.current?.reset();}
    setBusy(false);
  }

  return <form ref={formRef} action={submit} className="card-panel form-grid">
    <input className="field" name="title" required minLength={3} maxLength={120} placeholder={t('title')}/>
    <textarea className="field" name="description" required rows={4} maxLength={6000} placeholder={t('description')}/>
    <input className="field" name="price" required type="number" min={1} max={1000000000} placeholder={t('price')}/>
    <select className="field" name="type"><option value="physical">{t('physical')}</option><option value="digital">{t('digital')}</option></select>
    <input className="field" name="stock" type="number" min={0} max={100000} placeholder={t('stock')}/>
    <label className="muted">{t('cover')}<input className="field" name="image" type="url" placeholder="https://…"/></label>
    <label className="muted">{t('file')}<input className="field" name="file" type="file"/></label>
    <button className="button" disabled={busy}>{busy?t('uploading'):t('publish')}</button>
    {message&&<p role="status" className="muted">{message}</p>}
  </form>;
}
