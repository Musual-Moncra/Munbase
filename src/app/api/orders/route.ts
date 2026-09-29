import {NextResponse} from 'next/server';
import {createSupabaseServerClient} from '@/lib/supabase/server';
import {checkoutSchema} from '@/lib/checkout-schema';

export async function POST(request:Request){
  const origin=request.headers.get('origin');if(!origin||origin!==new URL(request.url).origin)return NextResponse.json({error:'Invalid request origin.'},{status:403});
  const length=Number(request.headers.get('content-length')||0);if(length>64*1024)return NextResponse.json({error:'Order request is too large.'},{status:413});
  const supabase=await createSupabaseServerClient();if(!supabase)return NextResponse.json({error:'Supabase is not configured.'},{status:503});
  const {data:auth}=await supabase.auth.getClaims();if(!auth?.claims)return NextResponse.json({error:'Sign in before placing an order.'},{status:401});
  const parsed=checkoutSchema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:'Invalid order details.'},{status:400});
  if(parsed.data.paymentMethod==='sepay'&&(!process.env.SEPAY_BANK_ACCOUNT||!process.env.SEPAY_BANK_CODE||!process.env.SEPAY_WEBHOOK_SECRET||!(process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SECRET_KEY)))return NextResponse.json({error:'SePay is not fully configured yet.'},{status:503});
  const {data:orderId,error}=await supabase.rpc('create_marketplace_order',{p_items:parsed.data.items,p_customer:parsed.data.customer,p_payment_method:parsed.data.paymentMethod});
  if(error){const status=error.message.includes('authentication_required')?401:error.message.includes('unavailable')||error.message.includes('stock')?409:400;return NextResponse.json({error:error.message.replaceAll('_',' ')},{status});}
  if(parsed.data.paymentMethod==='cod')return NextResponse.json({orderId});
  const {data:order,error:readError}=await supabase.from('orders').select('order_code,total_amount').eq('id',orderId).single();
  if(readError||!order)return NextResponse.json({error:'Order was created but payment details could not be loaded. Open your orders.'},{status:503});
  const qr=new URL('https://vietqr.app/img');
  qr.searchParams.set('acc',process.env.SEPAY_BANK_ACCOUNT!);qr.searchParams.set('bank',process.env.SEPAY_BANK_CODE!);qr.searchParams.set('amount',String(order.total_amount));qr.searchParams.set('des',`MB${order.order_code}`);qr.searchParams.set('template','compact');
  const accountName=process.env.SEPAY_ACCOUNT_NAME||'';if(accountName)qr.searchParams.set('holder',accountName);
  return NextResponse.json({orderId,qrUrl:qr.toString(),amount:order.total_amount,reference:`MB${order.order_code}`,accountName});
}
