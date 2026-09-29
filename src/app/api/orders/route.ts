import {NextResponse} from 'next/server';
import {createSupabaseServerClient} from '@/lib/supabase/server';
import {PayOS} from '@payos/node';
import {checkoutSchema} from '@/lib/checkout-schema';
export async function POST(request:Request){
 const supabase=await createSupabaseServerClient();if(!supabase)return NextResponse.json({error:'Supabase is not configured.'},{status:503});
 const {data:claimsData}=await supabase.auth.getClaims();const claims=claimsData?.claims;if(!claims)return NextResponse.json({error:'Sign in before placing an order.'},{status:401});
 const parsed=checkoutSchema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:'Invalid order details.'},{status:400});
 const {data:orderId,error}=await supabase.rpc('create_marketplace_order',{p_items:parsed.data.items,p_customer:parsed.data.customer,p_payment_method:parsed.data.paymentMethod});
 if(error){const status=error.message.includes('authentication_required')?401:error.message.includes('unavailable')||error.message.includes('stock')?409:400;return NextResponse.json({error:error.message.replaceAll('_',' ')},{status});}
 if(parsed.data.paymentMethod==='cod')return NextResponse.json({orderId});
 const {data:order, error:readError}=await supabase.from('orders').select('order_code,total_amount,shipping_total').eq('id',orderId).single();
 if(readError||!order)return NextResponse.json({error:'Order created but payment setup failed. Open your orders to retry.'},{status:503});
 const {data:lines}=await supabase.from('order_items').select('product_title,quantity,unit_price').eq('order_id',orderId);
 const {clientId,apiKey,checksumKey}=process.env;
 if(!clientId||!apiKey||!checksumKey)return NextResponse.json({error:'Order created. PayOS credentials are not configured yet; contact support to complete payment.',orderId},{status:503});
 try{const payos=new PayOS({clientId,apiKey,checksumKey});const origin=new URL(request.url).origin;const link=await payos.paymentRequests.create({orderCode:Number(order.order_code),amount:Number(order.total_amount),description:`Munbase ${order.order_code}`,returnUrl:`${origin}/vi/orders?payment=success`,cancelUrl:`${origin}/vi/orders?payment=cancel`,items:[...(lines||[]).map(line=>({name:line.product_title,quantity:line.quantity,price:Number(line.unit_price)})),...(order.shipping_total>0?[{name:'Seller shipping',quantity:1,price:Number(order.shipping_total)}]:[])]});const {error:saveError}=await supabase.rpc('set_payos_payment_link',{p_order_id:orderId,p_order_code:Number(order.order_code),p_link_id:link.paymentLinkId});if(saveError)throw saveError;return NextResponse.json({orderId,checkoutUrl:link.checkoutUrl});}catch{ return NextResponse.json({error:'Order created, but PayOS could not create a checkout link. Check the PayOS configuration and retry from the order page.',orderId},{status:502});}
}
