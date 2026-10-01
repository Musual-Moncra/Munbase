import {NextResponse} from 'next/server';
import {createSupabaseServerClient} from '@/lib/supabase/server';

export async function GET(_request:Request,{params}:{params:Promise<{orderId:string}>}){
  const {orderId}=await params;
  const supabase=await createSupabaseServerClient();
  if(!supabase)return NextResponse.json({error:'Supabase is not configured.'},{status:503});
  const {data:auth}=await supabase.auth.getClaims();
  if(!auth?.claims)return NextResponse.json({error:'Sign in to view this order.'},{status:401});
  const {data:order,error}=await supabase.from('orders').select('payment_status,expires_at').eq('id',orderId).eq('buyer_id',String(auth.claims.sub)).maybeSingle();
  if(error||!order)return NextResponse.json({error:'Order not found.'},{status:404});
  return NextResponse.json({paymentStatus:order.payment_status,expiresAt:order.expires_at},{headers:{'cache-control':'no-store'}});
}
