import {NextResponse} from 'next/server';
import {z} from 'zod';
import {createSupabaseServerClient} from '@/lib/supabase/server';
const schema=z.object({applicationId:z.string().uuid(),decision:z.enum(['approved','rejected','changes_requested']),reason:z.string().trim().min(3).max(2000),locale:z.enum(['vi','en','ko','zh','ja'])});
export async function POST(request:Request){
  const origin=request.headers.get('origin');if(!origin||origin!==new URL(request.url).origin)return NextResponse.json({error:'Invalid request origin.'},{status:403});
  const supabase=await createSupabaseServerClient();if(!supabase)return NextResponse.json({error:'Supabase is not configured.'},{status:503});
  const {data:auth}=await supabase.auth.getClaims();if(!auth?.claims)return NextResponse.json({error:'Sign in required.'},{status:401});
  const parsed=schema.safeParse(Object.fromEntries(await request.formData()));if(!parsed.success)return NextResponse.json({error:'A decision reason is required.'},{status:400});
  const {error}=await supabase.rpc('admin_review_seller_application',{p_application_id:parsed.data.applicationId,p_decision:parsed.data.decision,p_reason:parsed.data.reason});
  if(error)return NextResponse.json({error:'Admin permission required or application is no longer pending.'},{status:403});
  return NextResponse.redirect(new URL(`/${parsed.data.locale}/admin/applications`,request.url),303);
}
