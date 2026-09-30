import {createSupabaseServerClient} from '@/lib/supabase/server';
import {SellerDashboardNav} from '@/components/seller-dashboard-nav';

export default async function SellerDashboardLayout({children}:{children:React.ReactNode}){
  const supabase=await createSupabaseServerClient();
  if(!supabase)return children;
  const {data:auth}=await supabase.auth.getClaims();
  if(!auth?.claims?.sub)return children;
  const {data:profile}=await supabase.from('profiles').select('role').eq('id',auth.claims.sub).maybeSingle();
  if(profile?.role!=='seller'&&profile?.role!=='admin')return children;
  return <div className="shell seller-layout page-main"><SellerDashboardNav/><div className="seller-content">{children}</div></div>;
}
