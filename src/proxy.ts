import createMiddleware from 'next-intl/middleware';
import {createServerClient} from '@supabase/ssr';
import {NextRequest} from 'next/server';
import {routing} from './i18n/routing';

const intlProxy=createMiddleware(routing);
export default async function proxy(request:NextRequest){
  const response=intlProxy(request);
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if(!url||!key)return response;
  const supabase=createServerClient(url,key,{cookies:{
    getAll:()=>request.cookies.getAll(),
    setAll(cookies){for(const {name,value,options} of cookies){request.cookies.set(name,value);response.cookies.set(name,value,options);}},
  }});
  // Refreshes near-expiry sessions and applies rotated cookies. Authorization
  // remains enforced in each page, route handler, RLS policy, and RPC.
  await supabase.auth.getClaims();
  return response;
}

export const config={matcher:'/((?!api|auth|_next|.*\\..*).*)'};
