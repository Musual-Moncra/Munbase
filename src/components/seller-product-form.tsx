'use client';

import {useRef,useState} from 'react';
import {useLocale,useTranslations} from 'next-intl';
import {useRouter} from '@/i18n/navigation';
import {createSupabaseBrowserClient} from '@/lib/supabase/browser';

type Category={id:string;name:Record<string,string>};
type ExistingProduct={id:string;title:string;description:string;price:number;product_type:'physical'|'digital';category_id:string|null;stock_quantity:number;digital_file_path:string|null;images:string[]};

export function SellerProductForm({categories,product}:{categories:Category[];product?:ExistingProduct}){
  const t=useTranslations('productForm'); const locale=useLocale();const router=useRouter(); const formRef=useRef<HTMLFormElement>(null);
  const [message,setMessage]=useState(''); const [busy,setBusy]=useState(false); const [type,setType]=useState(product?.product_type||'physical');
  async function submit(form:FormData){
    setBusy(true); setMessage(''); const supabase=createSupabaseBrowserClient();
    if(!supabase){setMessage(t('notConfigured'));setBusy(false);return;}
    const {data:{user}}=await supabase.auth.getUser();
    if(!user){setMessage(t('signIn'));setBusy(false);return;}
    const title=String(form.get('title')||'').trim(); const price=Number(form.get('price')); const stock=type==='physical'?Number(form.get('stock')||0):0;
    if(title.length<3||title.length>120||!Number.isSafeInteger(price)||price<1||price>1_000_000_000){setMessage(t('invalid'));setBusy(false);return;}
    const uploads=form.getAll('images').filter((file):file is File=>file instanceof File&&file.size>0);
    if(uploads.length>5||uploads.some(file=>file.size>5*1024*1024||!['image/jpeg','image/png','image/webp'].includes(file.type))){setMessage(t('imageLimit'));setBusy(false);return;}
    let digitalPath=product?.digital_file_path||null; let uploadedDigital:string|null=null; const uploadedImages:string[]=[];
    const digital=form.get('file');
    try{
      if(type==='digital'&&digital instanceof File&&digital.size>0){
        if(digital.size>50*1024*1024)throw new Error(t('fileTooLarge'));
        const safeName=digital.name.replace(/[^a-zA-Z0-9._-]/g,'_'); uploadedDigital=`${user.id}/${crypto.randomUUID()}-${safeName}`;
        const {error}=await supabase.storage.from('digital-assets').upload(uploadedDigital,digital,{upsert:false}); if(error)throw error; digitalPath=uploadedDigital;
      }
      if(type==='digital'&&!digitalPath)throw new Error(t('missingFile'));
      for(const file of uploads){
        const path=`${user.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;
        const {error}=await supabase.storage.from('product-images').upload(path,file,{upsert:false,contentType:file.type}); if(error)throw error;
        uploadedImages.push(supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl);
      }
      const images=[...(product?.images||[]),...uploadedImages]; if(images.length>5)throw new Error(t('imageLimit'));
      const values={seller_id:user.id,category_id:String(form.get('category')||'')||null,title,slug:product?undefined:`${title.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}-${crypto.randomUUID().slice(0,8)}`,description:String(form.get('description')||'').trim(),price,product_type:type,stock_quantity:stock,digital_file_path:type==='digital'?digitalPath:null,images,is_active:true,updated_at:new Date().toISOString()};
      const result=product?await supabase.from('products').update(values).eq('id',product.id).eq('seller_id',user.id):await supabase.from('products').insert(values);
      if(result.error)throw result.error;
      setMessage(product?t('updated'):t('published')); router.refresh(); if(!product)formRef.current?.reset();
    }catch(error){
      if(uploadedDigital)await supabase.storage.from('digital-assets').remove([uploadedDigital]);
      if(uploadedImages.length){const paths=uploadedImages.map(url=>url.split('/product-images/')[1]).filter(Boolean);if(paths.length)await supabase.storage.from('product-images').remove(paths);}
      setMessage(error instanceof Error?error.message:t('saveFailed'));
    }
    setBusy(false);
  }
  return <form ref={formRef} action={submit} className="card-panel form-grid">
    <label>{t('title')}<input className="field" name="title" required minLength={3} maxLength={120} defaultValue={product?.title}/></label>
    <label>{t('description')}<textarea className="field" name="description" required rows={4} maxLength={6000} defaultValue={product?.description}/></label>
    <label>{t('price')}<input className="field" name="price" required type="number" min={1} max={1000000000} defaultValue={product?.price}/></label>
    <label>{t('type')}<select className="field" name="type" value={type} onChange={event=>setType(event.target.value as 'physical'|'digital')}><option value="physical">{t('physical')}</option><option value="digital">{t('digital')}</option></select></label>
    <label>{t('category')}<select className="field" name="category" defaultValue={product?.category_id||''}><option value="">{t('uncategorized')}</option>{categories.map(category=><option key={category.id} value={category.id}>{category.name[locale]||category.name.vi||category.name.en}</option>)}</select></label>
    {type==='physical'&&<label>{t('stock')}<input className="field" name="stock" type="number" min={0} max={100000} defaultValue={product?.stock_quantity??0}/></label>}
    {product?.images.length?<p className="muted">{t('existingImages',{count:product.images.length})}</p>:null}
    <label>{t('images')}<input className="field" name="images" type="file" accept="image/jpeg,image/png,image/webp" multiple/></label>
    <label>{t('file')}<input className="field" name="file" type="file" />{product?.digital_file_path&&<small className="muted">{t('fileAlreadyUploaded')}</small>}</label>
    <button className="button" disabled={busy}>{busy?t('uploading'):product?t('save'):t('publish')}</button>
    {message&&<p role="status" className="muted">{message}</p>}
  </form>;
}
