import {createSupabaseServerClient} from '@/lib/supabase/server';
import {AdminDashboardNav} from '@/components/admin-dashboard-nav';

export default async function AdminLayout({children}:{children:React.ReactNode}){
  const supabase=await createSupabaseServerClient();if(!supabase)return children;
  const {data:auth}=await supabase.auth.getClaims();const id=auth?.claims?.sub;if(!id)return children;
  const {data:profile}=await supabase.from('profiles').select('role').eq('id',id).maybeSingle();if(profile?.role!=='admin')return children;
  return <div className="shell seller-layout page-main"><AdminDashboardNav/><div className="seller-content">{children}</div></div>;
}
