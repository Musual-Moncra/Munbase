'use client';

import {useRef,useState} from 'react';
import {useLocale,useTranslations} from 'next-intl';
import {useRouter} from '@/i18n/navigation';
import {createSupabaseBrowserClient} from '@/lib/supabase/browser';

type Category={id:string;name:Record<string,string>};
type Product={id:string;slug:string;title:string;description:string;price:number;product_type:'physical'|'digital';category_id:string|null;stock_quantity:number;digital_file_path:string|null;images:string[]};
type Submission={id:string;status:string;title:string;slug:string;description:string;price:number;product_type:'physical'|'digital';category_id:string|null;initial_stock:number;digital_file_path:string|null;images:string[];rejection_reason:string|null};

export function SellerProductForm({categories,product,submission}:{categories:Category[];product?:Product;submission?:Submission|null}){
  const source=submission||product;
  const t=useTranslations('productForm');
  const locale=useLocale();
  const router=useRouter();
  const formRef=useRef<HTMLFormElement>(null);
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const [isError,setIsError]=useState(false);
  const [type,setType]=useState(source?.product_type||'physical');

  async function submit(form:FormData){
    setBusy(true);setMessage('');setIsError(false);
    let uploadedDigital:string|null=null;
    const uploadedImagePaths:string[]=[];
    try{
      const supabase=createSupabaseBrowserClient();
      if(!supabase){setMessage(t('notConfigured'));setIsError(true);return;}
      const {data:{user},error:authError}=await supabase.auth.getUser();
      if(authError||!user){setMessage(t('signIn'));setIsError(true);return;}

      const title=String(form.get('title')||'').trim();
      const price=Number(form.get('price'));
      const stock=type==='physical'?Number(form.get('stock')||0):0;
      const intent=String(form.get('intent')||'submit');
      if(title.length<3||title.length>120||!Number.isSafeInteger(price)||price<1||price>1_000_000_000||type==='physical'&&(!Number.isInteger(stock)||stock<0||stock>100000)){
        setMessage(t('invalid'));setIsError(true);return;
      }
      const uploads=form.getAll('images').filter((file):file is File=>file instanceof File&&file.size>0);
      if(uploads.length>5||uploads.some(file=>file.size>5*1024*1024||!['image/jpeg','image/png','image/webp'].includes(file.type))){setMessage(t('imageLimit'));setIsError(true);return;}

      let digitalPath=source?.digital_file_path||null;
      const digital=form.get('file');
      if(type==='digital'&&digital instanceof File&&digital.size>0){
        if(digital.size>50*1024*1024)throw new Error(t('fileTooLarge'));
        const safeName=digital.name.replace(/[^a-zA-Z0-9._-]/g,'_');
        uploadedDigital=`${user.id}/${crypto.randomUUID()}-${safeName}`;
        const {error}=await supabase.storage.from('digital-assets').upload(uploadedDigital,digital,{upsert:false});
        if(error)throw error;
        digitalPath=uploadedDigital;
      }
      if(type==='digital'&&!digitalPath)throw new Error(t('missingFile'));

      const uploadedImages:string[]=[];
      for(const file of uploads){
        const path=`${user.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;
        const {error}=await supabase.storage.from('product-images').upload(path,file,{upsert:false,contentType:file.type});
        if(error)throw error;
        uploadedImagePaths.push(path);
        uploadedImages.push(supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl);
      }

      const kept=form.getAll('keepImage').map(String);
      const images=[...kept,...uploadedImages];
      if(images.length>5)throw new Error(t('imageLimit'));
      const slug=String(source?.slug||`${title.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}-${crypto.randomUUID().slice(0,8)}`);
      const payload={title,slug,description:String(form.get('description')||'').trim(),price,product_type:type,category_id:String(form.get('category')||'')||null,stock,digital_file_path:type==='digital'?digitalPath:null,images};
      const {error}=await supabase.rpc('save_product_submission',{p_submission_id:submission?.id||null,p_product_id:product?.id||null,p_payload:payload,p_submit:intent==='submit'});
      if(error)throw error;

      setMessage(intent==='submit'?t('submitSuccess'):t('draftSaved'));
      if(!product)formRef.current?.reset();
      router.refresh();
    }catch(error){
      const supabase=createSupabaseBrowserClient();
      if(supabase){
        if(uploadedDigital)await supabase.storage.from('digital-assets').remove([uploadedDigital]);
        if(uploadedImagePaths.length)await supabase.storage.from('product-images').remove(uploadedImagePaths);
      }
      setMessage(error instanceof Error?error.message:t('saveFailed'));
      setIsError(true);
    }finally{setBusy(false);}
  }

  return <form ref={formRef} onSubmit={event=>{event.preventDefault();const data=new FormData(event.currentTarget);const submitter=(event.nativeEvent as SubmitEvent).submitter;if(submitter instanceof HTMLButtonElement&&submitter.name)data.set(submitter.name,submitter.value);void submit(data);}} className="card-panel form-grid product-submission-form">
    {submission?.rejection_reason&&<p className="alert-note">{t('adminReason')}: {submission.rejection_reason}</p>}
    {product&&<p className="muted">{t('reviewRequiredHint')}</p>}
    <label>{t('title')}<input className="field" name="title" required minLength={3} maxLength={120} defaultValue={source?.title}/></label>
    <label>{t('description')}<textarea className="field" name="description" required minLength={10} rows={4} maxLength={6000} defaultValue={source?.description}/></label>
    <label>{t('price')}<input className="field" name="price" required type="number" min={1} max={1000000000} defaultValue={source?.price}/></label>
    <label>{t('type')}<select className="field" name="type" value={type} onChange={event=>setType(event.target.value as 'physical'|'digital')}><option value="physical">{t('physical')}</option><option value="digital">{t('digital')}</option></select></label>
    <label>{t('category')}<select className="field" name="category" defaultValue={source?.category_id||''}><option value="">{t('uncategorized')}</option>{categories.map(category=><option key={category.id} value={category.id}>{category.name[locale]||category.name.vi||category.name.en}</option>)}</select></label>
    {type==='physical'&&<label>{t('stock')}<input className="field" name="stock" type="number" min={0} max={100000} defaultValue={submission?.initial_stock??product?.stock_quantity??0}/></label>}
    {(source?.images?.length||0)>0&&<fieldset className="choice-fieldset"><legend>{t('existingImages',{count:source?.images?.length||0})}</legend>{source?.images?.map(image=><label key={image} className="choice-row"><input type="checkbox" name="keepImage" value={image} defaultChecked/>{image.slice(-40)}</label>)}</fieldset>}
    <label>{t('images')}<input className="field" name="images" type="file" accept="image/jpeg,image/png,image/webp" multiple/></label>
    <label>{t('file')}<input className="field" name="file" type="file"/>{source?.digital_file_path&&<small className="muted">{t('fileAlreadyUploaded')}</small>}</label>
    <div className="form-actions"><button className="button secondary" name="intent" value="draft" formNoValidate disabled={busy}>{t('draft')}</button><button className="button" name="intent" value="submit" disabled={busy}>{busy?t('uploading'):t('submitForReview')}</button></div>
    {message&&<p role={isError?'alert':'status'} className={isError?'form-error':'form-success'}>{message}</p>}
  </form>;
}
