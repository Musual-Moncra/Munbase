'use client';
import {useEffect,useState} from 'react';
import {useTranslations} from 'next-intl';
import {useTheme} from 'next-themes';
import {Moon,ShoppingBag,Sun} from 'lucide-react';
import {usePathname,useRouter,Link} from '@/i18n/navigation';
import {createSupabaseBrowserClient} from '@/lib/supabase/browser';

export function SiteHeader({locale}:{locale:string}){
  const t=useTranslations('nav');const {resolvedTheme,setTheme}=useTheme();const pathname=usePathname();const router=useRouter();const [count,setCount]=useState(0);const [signedIn,setSignedIn]=useState(false);
  useEffect(()=>{const read=()=>{try{const c=JSON.parse(localStorage.getItem('munbase-cart')||'[]') as {quantity:number}[];setCount(c.reduce((n,x)=>n+x.quantity,0));}catch{setCount(0);}};read();window.addEventListener('storage',read);window.addEventListener('munbase-cart-change',read);return()=>{window.removeEventListener('storage',read);window.removeEventListener('munbase-cart-change',read);};},[]);
  useEffect(()=>{const supabase=createSupabaseBrowserClient();if(!supabase)return;void supabase.auth.getUser().then(({data})=>setSignedIn(Boolean(data.user)));const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,session)=>setSignedIn(Boolean(session?.user)));return()=>subscription.unsubscribe();},[]);
  async function signOut(){const supabase=createSupabaseBrowserClient();if(supabase)await supabase.auth.signOut();setSignedIn(false);router.push('/');router.refresh();}
  return <header className="shell header"><Link className="brand" href="/">mun<span>base</span></Link><nav aria-label={t('navigation')} style={{display:'flex',alignItems:'center',gap:22}}><Link className="nav-link nav-explore" href="/products">{t('explore')}</Link><Link className="nav-link nav-seller" href="/dashboard">{t('seller')}</Link>{signedIn?<><Link className="nav-link nav-account" href="/account">{t('account')}</Link><button className="nav-link nav-signout" onClick={signOut} style={{background:'none',border:0,cursor:'pointer'}}>{t('signOut')}</button></>:<Link className="nav-link nav-login" href="/login">{t('login')}</Link>}<Link aria-label={`${t('cart')} (${count})`} href="/cart" style={{display:'flex',alignItems:'center',gap:4}}><ShoppingBag size={18}/><small>{count}</small></Link><select aria-label="Language" className="field" style={{width:70,padding:'6px 4px'}} value={locale} onChange={e=>router.replace(pathname,{locale:e.target.value as 'vi'|'en'|'ko'|'zh'|'ja'})}><option value="vi">VI</option><option value="en">EN</option><option value="ko">KO</option><option value="zh">ZH</option><option value="ja">JA</option></select><button aria-label="Toggle color theme" onClick={()=>setTheme(resolvedTheme==='dark'?'light':'dark')} style={{background:'none',border:0,color:'var(--ink)',cursor:'pointer'}}><Sun className="theme-light-icon" size={18}/><Moon className="theme-dark-icon" size={18}/></button></nav></header>;
}
