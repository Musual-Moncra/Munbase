'use client';
import Link from 'next/link';
import {useTranslations} from 'next-intl';
import {useTheme} from 'next-themes';
import {Moon, ShoppingBag, Sun} from 'lucide-react';
import {usePathname,useRouter} from '@/i18n/navigation';
import {useEffect, useState} from 'react';

export function SiteHeader({locale}:{locale:string}) {
  const t=useTranslations('nav'); const {resolvedTheme,setTheme}=useTheme(); const pathname=usePathname(); const router=useRouter(); const [count,setCount]=useState(0);
  useEffect(()=>{const read=()=>{try{const c=JSON.parse(localStorage.getItem('munbase-cart')||'[]') as {quantity:number}[];setCount(c.reduce((n,x)=>n+x.quantity,0));}catch{setCount(0);}};read();window.addEventListener('storage',read);window.addEventListener('munbase-cart-change',read);return()=>{window.removeEventListener('storage',read);window.removeEventListener('munbase-cart-change',read);};},[]);
  return <header className="shell header"><Link className="brand" href="/">mun<span>base</span></Link><nav style={{display:'flex',alignItems:'center',gap:22}}><Link className="nav-link" href="/products">{t('explore')}</Link><Link className="nav-link" href="/dashboard">{t('seller')}</Link><Link className="nav-link" href="/login">{t('login')}</Link><Link aria-label={`${t('cart')} (${count})`} href="/cart" style={{display:'flex',alignItems:'center',gap:4}}><ShoppingBag size={18}/><small>{count}</small></Link><select aria-label="Language" className="field" style={{width:70,padding:'6px 4px'}} value={locale} onChange={e=>router.replace(pathname,{locale:e.target.value as 'vi'|'en'|'ko'|'zh'|'ja'})}><option value="vi">VI</option><option value="en">EN</option><option value="ko">KO</option><option value="zh">ZH</option><option value="ja">JA</option></select><button aria-label="Toggle color theme" onClick={()=>setTheme(resolvedTheme==='dark'?'light':'dark')} style={{background:'none',border:0,color:'var(--ink)',cursor:'pointer'}}><Sun className="theme-light-icon" size={18}/><Moon className="theme-dark-icon" size={18}/></button></nav></header>;
}
