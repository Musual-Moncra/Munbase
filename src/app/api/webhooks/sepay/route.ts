import 'server-only';
import {createClient} from '@supabase/supabase-js';
import {Resend} from 'resend';
import {z} from 'zod';
import {NextResponse} from 'next/server';
import {parseSePayOrderCode,verifySePaySignature} from '@/lib/sepay';

const eventSchema=z.object({
  id:z.union([z.number().int().positive(),z.string().min(1).max(80)]),
  accountNumber:z.string().min(1).max(40),
  code:z.string().max(80).nullable().optional(),
  content:z.string().max(1000),
  transferType:z.enum(['in','out']),
  transferAmount:z.number().int().positive(),
}).passthrough();

export async function POST(request:Request){
  const secret=process.env.SEPAY_WEBHOOK_SECRET;
  const expectedAccount=process.env.SEPAY_BANK_ACCOUNT;
  const supabaseUrl=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SECRET_KEY;
  if(!secret||!expectedAccount||!supabaseUrl||!serviceKey){
    return NextResponse.json({error:'SePay webhook is not configured.'},{status:503});
  }

  const rawBody=await request.text();
  if(new TextEncoder().encode(rawBody).byteLength>64*1024){
    return NextResponse.json({error:'Webhook body is too large.'},{status:413});
  }
  const validSignature=verifySePaySignature({
    rawBody,
    timestamp:request.headers.get('x-sepay-timestamp'),
    signature:request.headers.get('x-sepay-signature'),
    secret,
  });
  if(!validSignature)return NextResponse.json({error:'Invalid SePay signature.'},{status:401});

  let body:unknown;
  try{
    body=JSON.parse(rawBody);
  }catch{
    return NextResponse.json({error:'Invalid SePay event.'},{status:400});
  }
  const parsed=eventSchema.safeParse(body);
  if(!parsed.success)return NextResponse.json({error:'Invalid SePay event.'},{status:400});
  const event=parsed.data;
  if(event.accountNumber!==expectedAccount)return NextResponse.json({success:true});
  if(event.transferType!=='in')return NextResponse.json({success:true});

  const orderCode=parseSePayOrderCode(event.code??null,event.content);
  const admin=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:previous}=orderCode===null
    ?{data:null}
    :await admin.from('orders').select('id,payment_status,customer_email,customer_name')
      .eq('order_code',orderCode).eq('payment_method','sepay').maybeSingle();

  const {data:matched,error}=await admin.rpc('confirm_sepay_payment',{
    p_order_code:orderCode,
    p_amount:event.transferAmount,
    p_event_id:String(event.id),
    p_payload:event,
  });
  if(error)return NextResponse.json({error:'Could not record SePay event.'},{status:500});

  if(matched&&previous?.payment_status==='pending'&&previous.customer_email&&process.env.RESEND_API_KEY&&process.env.RESEND_FROM_EMAIL){
    const base=process.env.NEXT_PUBLIC_SITE_URL||new URL(request.url).origin;
    const resend=new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from:process.env.RESEND_FROM_EMAIL,
      to:previous.customer_email,
      subject:`Munbase order payment confirmed`,
      html:`<p>Hello ${escapeHtml(previous.customer_name)},</p><p>Your SePay transfer has been confirmed. View your order here:</p><p><a href="${base}/vi/orders/${previous.id}">View order</a></p>`,
    }).catch(()=>undefined);
  }

  // SePay expects exactly this response for accepted, duplicate, and unmatched events.
  return NextResponse.json({success:true});
}

function escapeHtml(value:string){return value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');}
