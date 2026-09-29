'use client';
import {useTranslations} from 'next-intl';
import {ShoppingBag} from 'lucide-react';
import {addToCart} from '@/lib/cart';
import type {Product} from '@/lib/catalog';
export function AddToCart({product}:{product:Product}){const t=useTranslations('products');return <button className="button" disabled={product.preview} title={product.preview?'Preview catalog item only':''} onClick={()=>addToCart(product)}><ShoppingBag size={16}/>{product.preview?'Preview only':t('add')}</button>;}
