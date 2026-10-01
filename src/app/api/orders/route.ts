import {NextResponse} from 'next/server';
import {createSupabaseServerClient} from '@/lib/supabase/server';
import {checkoutSchema} from '@/lib/checkout-schema';
import {getSePayCheckoutConfigurationError} from '@/lib/sepay-config';

export async function POST(request:Request){
  const origin=request.headers.get('origin');if(!origin||origin!==new URL(request.url).origin)return NextResponse.json({error:'Invalid request origin.'},{status:403});
  const length=Number(request.headers.get('content-length')||0);if(length>64*1024)return NextResponse.json({error:'Order request is too large.'},{status:413});
  const supabase=await createSupabaseServerClient();if(!supabase)return NextResponse.json({error:'Supabase is not configured.'},{status:503});
  const {data:auth}=await supabase.auth.getClaims();if(!auth?.claims)return NextResponse.json({error:'Sign in before placing an order.'},{status:401});
  const rawBody=await request.text();if(new TextEncoder().encode(rawBody).byteLength>64*1024)return NextResponse.json({error:'Order request is too large.'},{status:413});
  let body:unknown;try{body=JSON.parse(rawBody);}catch{return NextResponse.json({error:'Invalid order details.'},{status:400});}
  const parsed=checkoutSchema.safeParse(body);if(!parsed.success)return NextResponse.json({error:'Invalid order details.'},{status:400});
  let shippingAddress=parsed.data.customer.address??null;
  if(parsed.data.customer.addressId){
    const {data:address,error:addressError}=await supabase.from('shipping_addresses').select('recipient_name,phone,province,district,ward,address_line,note').eq('id',parsed.data.customer.addressId).eq('user_id',String(auth.claims.sub)).maybeSingle();
    if(addressError||!address)return NextResponse.json({error:'The selected shipping address is unavailable.'},{status:400});
    shippingAddress=address;
  }
  if(shippingAddress&&parsed.data.customer.phone&&shippingAddress.phone!==parsed.data.customer.phone)shippingAddress={...shippingAddress,phone:parsed.data.customer.phone};
  if(parsed.data.paymentMethod==='sepay'){
    const configurationError=getSePayCheckoutConfigurationError(process.env);
    if(configurationError)return NextResponse.json({error:configurationError},{status:503});
  }
  const customer={name:parsed.data.customer.name,email:parsed.data.customer.email,...(parsed.data.customer.phone?{phone:parsed.data.customer.phone}:{}),...(shippingAddress?{address:shippingAddress}:{})};
  const {data:orderId,error}=await supabase.rpc('create_marketplace_order',{p_items:parsed.data.items,p_customer:customer,p_payment_method:parsed.data.paymentMethod,p_request_key:parsed.data.requestKey,p_locale:parsed.data.locale});
  if(error){const status=error.message.includes('authentication_required')?401:error.message.includes('unavailable')||error.message.includes('stock')||error.message.includes('idempotency_key_reused')?409:error.message.includes('checkout_restricted')||error.message.includes('checkout_disabled')?403:400;return NextResponse.json({error:error.message.replaceAll('_',' ')},{status});}
  if(parsed.data.paymentMethod==='cod')return NextResponse.json({orderId});
  const {data:order,error:readError}=await supabase.from('orders').select('order_code,total_amount').eq('id',orderId).single();
  if(readError||!order)return NextResponse.json({error:'Order was created but payment details could not be loaded. Open your orders.'},{status:503});
  const qr=new URL('https://vietqr.app/img');
  qr.searchParams.set('acc',process.env.SEPAY_BANK_ACCOUNT!);qr.searchParams.set('bank',process.env.SEPAY_BANK_CODE!);qr.searchParams.set('amount',String(order.total_amount));qr.searchParams.set('des',`MB${order.order_code}`);qr.searchParams.set('template','compact');
  const accountName=process.env.SEPAY_ACCOUNT_NAME||'';if(accountName)qr.searchParams.set('holder',accountName);
  return NextResponse.json({orderId,qrUrl:qr.toString(),amount:order.total_amount,reference:`MB${order.order_code}`,accountName});
}
