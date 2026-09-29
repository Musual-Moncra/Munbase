'use client';

import {useRef,useState} from 'react';
import {useRouter} from '@/i18n/navigation';
import {useLocale,useTranslations} from 'next-intl';
import {createSupabaseBrowserClient} from '@/lib/supabase/browser';

type Category={id:string;label:string};
type Initial=Record<string,unknown>;

export function SellerApplicationForm({categories,initial,payout}:{categories:Category[];initial?:Initial|null;payout?:{bank_name:string|null;bank_account_number:string|null;bank_account_name:string|null}|null}){
  const t=useTranslations('sellerApply');const locale=useLocale();const router=useRouter();const formRef=useRef<HTMLFormElement>(null);const [step,setStep]=useState(0);const [preview,setPreview]=useState<Record<string,string>>({});const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');
  const address=(initial?.contact_address&&typeof initial.contact_address==='object'?initial.contact_address:{}) as Record<string,string>;
  const initialTypes=Array.isArray(initial?.product_types)?initial.product_types as string[]:[];
  const initialCategories=Array.isArray(initial?.product_categories)?initial.product_categories as string[]:[];
  function review(){if(!formRef.current?.reportValidity())return;const data=new FormData(formRef.current);setPreview({shop:String(data.get('shop_name')||''),contact:String(data.get('contact_name')||''),phone:String(data.get('contact_phone')||''),address:[data.get('address_line'),data.get('ward'),data.get('district'),data.get('province')].filter(Boolean).join(', '),products:(data.getAll('product_types') as string[]).map(x=>t(`type_${x}`)).join(', '),bank:String(data.get('bank_name')||''),holder:String(data.get('bank_account_name')||'')});setStep(1);}
  async function save(data:FormData){
    setBusy(true);setMessage('');const supabase=createSupabaseBrowserClient();if(!supabase){setMessage(t('notConfigured'));setBusy(false);return;}
    const submit=String(data.get('intent'))==='submit';const payload={shop_name:String(data.get('shop_name')||'').trim(),contact_name:String(data.get('contact_name')||'').trim(),contact_phone:String(data.get('contact_phone')||'').trim(),description:String(data.get('description')||'').trim(),website_url:String(data.get('website_url')||'').trim(),proof_url:String(data.get('proof_url')||'').trim(),product_types:data.getAll('product_types').map(String),product_categories:data.getAll('product_categories').map(String),address:{province:String(data.get('province')||'').trim(),district:String(data.get('district')||'').trim(),ward:String(data.get('ward')||'').trim(),address_line:String(data.get('address_line')||'').trim()},bank_name:String(data.get('bank_name')||'').trim(),bank_account_number:String(data.get('bank_account_number')||'').trim(),bank_account_name:String(data.get('bank_account_name')||'').trim(),terms_accepted:data.get('terms_accepted')==='on'};
    const {error}=await supabase.rpc('save_seller_application',{p_payload:payload,p_submit:submit});setMessage(error?mapApplicationError(error.message,t):submit?t('submitted'):t('draftSaved'));setBusy(false);if(!error){router.refresh();if(submit)router.push('/account');}
  }
  return <form ref={formRef} action={save} className="seller-application form-grid">
    <div className="application-progress" aria-label={t('progress')}><span className={step===0?'current':''}>{t('detailsStep')}</span><span className={step===1?'current':''}>{t('reviewStep')}</span></div>
    <fieldset className="application-fields form-grid" hidden={step===1}><legend>{t('contactSection')}</legend>
      <label>{t('shopName')}<input className="field" name="shop_name" required minLength={2} maxLength={100} defaultValue={String(initial?.shop_name||'')}/></label>
      <label>{t('contactName')}<input className="field" name="contact_name" required minLength={2} maxLength={120} defaultValue={String(initial?.contact_name||'')}/></label>
      <label>{t('contactPhone')}<input className="field" name="contact_phone" type="tel" required minLength={7} maxLength={30} autoComplete="tel" defaultValue={String(initial?.contact_phone||'')}/></label>
      <label>{t('description')}<textarea className="field" name="description" required minLength={10} maxLength={3000} rows={4} defaultValue={String(initial?.description||'')}/></label>
      <label>{t('province')}<input className="field" name="province" required minLength={2} maxLength={120} defaultValue={address.province||''}/></label>
      <label>{t('district')}<input className="field" name="district" required minLength={2} maxLength={120} defaultValue={address.district||''}/></label>
      <label>{t('ward')}<input className="field" name="ward" required minLength={2} maxLength={120} defaultValue={address.ward||''}/></label>
      <label>{t('addressLine')}<input className="field" name="address_line" required minLength={4} maxLength={300} defaultValue={address.address_line||''}/></label>
      <label>{t('website')}<input className="field" name="website_url" type="url" maxLength={500} defaultValue={String(initial?.website_url||'')}/></label>
      <label>{t('proof')}<input className="field" name="proof_url" type="url" maxLength={500} defaultValue={String(initial?.proof_url||'')}/></label>
      <fieldset className="choice-fieldset"><legend>{t('productTypes')}</legend>{(['physical','digital'] as const).map(type=><label className="choice-row" key={type}><input type="checkbox" name="product_types" value={type} defaultChecked={initialTypes.includes(type)}/>{t(`type_${type}`)}</label>)}</fieldset>
      <fieldset className="choice-fieldset"><legend>{t('categories')}</legend>{categories.map(category=><label className="choice-row" key={category.id}><input type="checkbox" name="product_categories" value={category.id} defaultChecked={initialCategories.includes(category.id)}/>{category.label}</label>)}</fieldset>
      <fieldset className="choice-fieldset"><legend>{t('payoutSection')}</legend><p className="muted">{t('payoutPrivacy')}</p>
        <label>{t('bankName')}<input className="field" name="bank_name" minLength={2} maxLength={80} defaultValue={payout?.bank_name||''}/></label>
        <label>{t('bankNumber')}<input className="field" name="bank_account_number" minLength={6} maxLength={40} defaultValue={payout?.bank_account_number||''}/></label>
        <label>{t('bankHolder')}<input className="field" name="bank_account_name" minLength={2} maxLength={120} defaultValue={payout?.bank_account_name||''}/></label>
      </fieldset>
      <label className="choice-row"><input type="checkbox" name="terms_accepted" required defaultChecked={Boolean(initial?.terms_accepted_at)}/><span>{t('terms')} <a className="nav-link" href={`/${locale}/seller-rules`} target="_blank" rel="noreferrer">{t('readRules')}</a></span></label>
      <div className="form-actions"><button type="submit" className="button secondary" name="intent" value="draft" formNoValidate disabled={busy}>{t('saveDraft')}</button><button type="button" className="button" onClick={review}>{t('reviewApplication')}</button></div>
    </fieldset>
    {step===1&&<section className="application-review"><h2>{t('reviewTitle')}</h2><p className="muted">{t('reviewDescription')}</p>{Object.entries({shop:t('shopName'),contact:t('contactName'),phone:t('contactPhone'),address:t('businessAddress'),products:t('productTypes'),bank:t('bankName'),holder:t('bankHolder')}).map(([key,label])=><div className="product-meta review-line" key={key}><span>{label}</span><strong>{preview[key]||t('notProvided')}</strong></div>)}<div className="form-actions"><button type="button" className="button secondary" onClick={()=>setStep(0)}>{t('editDetails')}</button><button className="button" name="intent" value="submit" disabled={busy}>{busy?t('submitting'):t('sendApplication')}</button></div></section>}
    {message&&<p className="muted" role="status">{message}</p>}
  </form>;
}

function mapApplicationError(message:string,t:(key:string)=>string){
  if(message.includes('application_incomplete'))return t('validationError');if(message.includes('application_under_review'))return t('underReview');if(message.includes('seller_application_not_allowed'))return t('alreadySeller');return message;
}
