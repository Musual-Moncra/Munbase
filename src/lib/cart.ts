'use client';
import {Product} from './catalog';
import {useSyncExternalStore} from 'react';
export type CartLine={productId:string;quantity:number};
export const getCart=():CartLine[]=>{try{return JSON.parse(localStorage.getItem('munbase-cart')||'[]') as CartLine[];}catch{return[];}};
export function addToCart(product:Product){const cart=getCart();const line=cart.find(x=>x.productId===product.id);if(line)line.quantity+=1;else cart.push({productId:product.id,quantity:1});localStorage.setItem('munbase-cart',JSON.stringify(cart));window.dispatchEvent(new Event('munbase-cart-change'));}
export function updateCart(cart:CartLine[]){localStorage.setItem('munbase-cart',JSON.stringify(cart.filter(x=>x.quantity>0)));window.dispatchEvent(new Event('munbase-cart-change'));}
function subscribe(callback:()=>void){window.addEventListener('storage',callback);window.addEventListener('munbase-cart-change',callback);return()=>{window.removeEventListener('storage',callback);window.removeEventListener('munbase-cart-change',callback);};}
function getSnapshot(){return localStorage.getItem('munbase-cart')||'[]';}
function getServerSnapshot(){return '[]';}
export function useCart(){const serialized=useSyncExternalStore(subscribe,getSnapshot,getServerSnapshot);try{return JSON.parse(serialized) as CartLine[];}catch{return[];}}
