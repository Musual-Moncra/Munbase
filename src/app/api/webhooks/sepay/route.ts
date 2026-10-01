import 'server-only';
import {createClient} from '@supabase/supabase-js';
import {z} from 'zod';
import {NextResponse} from 'next/server';
import {verifySePaySignature} from '@/lib/sepay';
import type {Database,Json} from '@/lib/database.types';

const eventSchema=z.object({
  id:z.union([z.number().int().positive(),z.string().min(1).max(80)]),
  accountNumber:z.string().min(1).max(40),
  code:z.string().max(80).nullable().optional(),
  content:z.string().max(1000),
  transferType:z.enum(['in','out']),
  transferAmount:z.number().int().positive(),
  referenceCode:z.string().max(120).nullable().optional(),
  transactionDate:z.string().max(80).nullable().optional(),
}).passthrough();

export async function POST(request:Request){
  const environment=process.env.SEPAY_ENV||'live';
  const secret=process.env.SEPAY_WEBHOOK_SECRET;
  const expectedAccount=process.env.SEPAY_BANK_ACCOUNT;
  const supabaseUrl=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SECRET_KEY;
  if(!secret||!expectedAccount||!supabaseUrl||!serviceKey||!['test','live'].includes(environment)){
    return NextResponse.json({error:'SePay webhook is not configured.'},{status:503});
  }
  const rawBody=await request.text();
  if(new TextEncoder().encode(rawBody).byteLength>64*1024)return NextResponse.json({error:'Webhook body is too large.'},{status:413});
  if(!verifySePaySignature({rawBody,timestamp:request.headers.get('x-sepay-timestamp'),signature:request.headers.get('x-sepay-signature'),secret})){
    return NextResponse.json({error:'Invalid SePay signature.'},{status:401});
  }
  let body:unknown;
  try{body=JSON.parse(rawBody);}catch{return NextResponse.json({error:'Invalid SePay event.'},{status:400});}
  const parsed=eventSchema.safeParse(body);
  if(!parsed.success)return NextResponse.json({error:'Invalid SePay event.'},{status:400});
  const event=parsed.data;
  if(event.transferType==='out')return NextResponse.json({success:true});
  const admin=createClient<Database>(supabaseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {error}=await admin.rpc('record_sepay_transaction',{
    p_environment:environment,p_source:'webhook',p_event_id:String(event.id),
    p_account_number:event.accountNumber,p_expected_account:expectedAccount,p_amount:event.transferAmount,
    p_code:event.code??null,p_content:event.content,p_bank_reference:event.referenceCode??null,
    p_transaction_at:event.transactionDate??null,p_payload:event as Json,
  } as never);
  if(error)return NextResponse.json({error:'Could not record SePay event.'},{status:500});
  return NextResponse.json({success:true});
}
