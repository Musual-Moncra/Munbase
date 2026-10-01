import 'server-only';
import {createClient} from '@supabase/supabase-js';
import {NextResponse} from 'next/server';
import {Resend} from 'resend';
import {z} from 'zod';
import {verifyCronAuthorization} from '@/lib/cron-auth';
import {normalizeSePayApiTransaction} from '@/lib/sepay';
import type {Database,Json} from '@/lib/database.types';
import messagesEn from '../../../../../messages/en.json';
import messagesJa from '../../../../../messages/ja.json';
import messagesKo from '../../../../../messages/ko.json';
import messagesVi from '../../../../../messages/vi.json';
import messagesZh from '../../../../../messages/zh.json';

export const maxDuration=60;

const jobSchema=z.object({job:z.enum(['reconcile','email'])});
const apiPageSchema=z.object({status:z.literal('success'),data:z.array(z.unknown()),meta:z.object({pagination:z.object({has_more:z.boolean()}).optional()}).optional()});
const emailMessages={vi:messagesVi,en:messagesEn,ko:messagesKo,zh:messagesZh,ja:messagesJa} as const;

export async function POST(request:Request){
  if(!verifyCronAuthorization(request.headers.get('authorization'),process.env.CRON_SECRET)){
    return NextResponse.json({error:'Unauthorized.'},{status:401});
  }
  const parsed=jobSchema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:'Invalid job.'},{status:400});
  const admin=createAdminClient();
  if(!admin)return NextResponse.json({error:'Supabase worker is not configured.'},{status:503});
  const environment=process.env.SEPAY_ENV||'live';
  const {data:run,error:runError}=await admin.from('payment_job_runs').insert({job:parsed.data.job,environment:parsed.data.job==='reconcile'?environment:null,status:'running'}).select('id').single();
  if(runError||!run)return NextResponse.json({error:'Could not record worker run.'},{status:503});
  try{
    const result=parsed.data.job==='email'?await dispatchEmails(admin):await reconcileSePay(admin);
    const {error:finishRunError}=await admin.from('payment_job_runs').update({status:'skipped' in result&&result.skipped?'skipped':'succeeded',completed_at:new Date().toISOString(),processed_count:'processed' in result?result.processed:('sent' in result?result.sent:0),checkpoint_id:'checkpoint' in result?result.checkpoint:null}).eq('id',run.id);
    if(finishRunError)throw new Error('payment_job_run_finish_failed');
    return NextResponse.json({success:true,...result});
  }catch(error){
    const message=error instanceof Error?error.message:'unknown_worker_error';
    await admin.from('payment_job_runs').update({status:'failed',completed_at:new Date().toISOString(),error_message:message.slice(0,1000)}).eq('id',run.id);
    console.error('payment worker failed',message);
    return NextResponse.json({error:'Payment worker failed.'},{status:503});
  }
}

function createAdminClient(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SECRET_KEY;
  if(!url||!key)return null;
  return createClient<Database>(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}

async function reconcileSePay(admin:ReturnType<typeof createAdminClient>&{}){
  if(!admin)throw new Error('worker_supabase_missing');
  const environment=process.env.SEPAY_ENV||'live';
  const token=process.env.SEPAY_API_TOKEN;
  const accountId=process.env.SEPAY_BANK_ACCOUNT_ID;
  const accountNumber=process.env.SEPAY_BANK_ACCOUNT;
  const siteUrl=process.env.NEXT_PUBLIC_SITE_URL;
  if(!token||!accountId||!accountNumber||!siteUrl||!['test','live'].includes(environment))throw new Error('sepay_sync_not_configured');

  const {data:lock,error:lockError}=await admin.rpc('begin_sepay_sync',{p_environment:environment});
  if(lockError)throw new Error('sepay_sync_lock_failed');
  const lease=lock as {acquired?:boolean;leaseToken?:string;checkpointId?:string|null}|null;
  if(!lease?.acquired||!lease.leaseToken)return {skipped:true,reason:'already_running'};

  let checkpoint=lease.checkpointId||null;
  let failure:string|null=null;
  let count=0;
  try{
    const apiBase=environment==='test'?'https://userapi-sandbox.sepay.vn':'https://userapi.sepay.vn';
    for(let page=1;page<=25;page++){
      const url=new URL('/v2/transactions',apiBase);
      url.searchParams.set('bank_account_id',accountId);
      url.searchParams.set('transfer_type','in');
      url.searchParams.set('transaction_date_sort','asc');
      url.searchParams.set('per_page','100');
      url.searchParams.set('page',String(page));
      url.searchParams.set('timestamp_format','iso8601');
      if(checkpoint)url.searchParams.set('since_id',checkpoint);
      else{
        const from=new Date(Date.now()-30*24*60*60*1000).toISOString().replace('T',' ').replace('Z','');
        url.searchParams.set('transaction_date_from',from);
      }
      const response=await fetch(url,{headers:{authorization:`Bearer ${token}`,accept:'application/json'},signal:AbortSignal.timeout(10000),cache:'no-store'});
      if(!response.ok)throw new Error(`sepay_api_${response.status}`);
      const pageResult=apiPageSchema.safeParse(await response.json());
      if(!pageResult.success)throw new Error('sepay_api_invalid_response');
      if(!pageResult.data.data.length)break;
      for(const raw of pageResult.data.data){
        const transaction=normalizeSePayApiTransaction(raw);
        if(transaction.bankAccountId!==accountId)throw new Error('sepay_api_account_mismatch');
        const {error}=await admin.rpc('record_sepay_transaction',{
          p_environment:environment,p_source:'api',p_event_id:transaction.eventId,
          p_account_number:transaction.accountNumber,p_expected_account:accountNumber,
          p_amount:transaction.transferAmount,p_code:transaction.code??'',p_content:transaction.content,
          p_bank_reference:transaction.referenceCode??'',p_transaction_at:transaction.transactionAt,
          p_payload:raw as Json,
        } as never);
        if(error)throw new Error('sepay_transaction_record_failed');
        checkpoint=transaction.eventId;count+=1;
      }
      if(!pageResult.data.meta?.pagination?.has_more)break;
    }
  }catch(error){
    failure=error instanceof Error?error.message:'sepay_reconcile_failed';
  }
  const {error:finishError}=await admin.rpc('finish_sepay_sync',{
    p_environment:environment,p_lease_token:lease.leaseToken,...(checkpoint?{p_checkpoint_id:checkpoint}:{}),...(failure?{p_error:failure}:{}),
  } as never);
  if(finishError)throw new Error('sepay_sync_finish_failed');
  if(failure)throw new Error(failure);
  return {processed:count,checkpoint};
}

async function dispatchEmails(admin:ReturnType<typeof createAdminClient>&{}){
  if(!admin)throw new Error('worker_supabase_missing');
  const apiKey=process.env.RESEND_API_KEY;
  const from=process.env.RESEND_FROM_EMAIL;
  const base=(process.env.NEXT_PUBLIC_SITE_URL||'').replace(/\/$/,'');
  if(!apiKey||!from||!base)throw new Error('email_delivery_not_configured');
  const resend=new Resend(apiKey);
  const {data:rows,error}=await admin.rpc('claim_customer_emails',{p_limit:20});
  if(error)throw new Error('email_outbox_claim_failed');
  let sent=0;
  for(const row of rows||[]){
    const payload=row.payload as Record<string,Json>;
    const locale=row.locale in emailMessages?row.locale as keyof typeof emailMessages:'vi';
    const template=emailMessages[locale].emails[row.template as keyof typeof emailMessages[typeof locale]['emails']];
    const values:Record<string,unknown>={...payload,orderUrl:`${base}/${locale}/orders/${String(payload.orderId||'')}`};
    const render=(value:string)=>value.replace(/\{([a-zA-Z]+)\}/g,(_match,key:string)=>escapeHtml(String(values[key]??'')));
    const result=await resend.emails.send({from,to:row.recipient,subject:render(template.subject),html:`<p>${render(template.body)}</p>`},{idempotencyKey:row.id});
    const errorMessage=result.error?'resend_delivery_failed':null;
    const {error:finishError}=await admin.rpc('finish_customer_email',{p_id:row.id,p_error:errorMessage??undefined});
    if(finishError)throw new Error('email_outbox_finish_failed');
    if(errorMessage)continue;
    sent+=1;
  }
  return {claimed:rows?.length||0,sent};
}

function escapeHtml(value:string){return value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');}
