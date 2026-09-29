'use client';
import {ShoppingBag} from 'lucide-react';
import {useTranslations} from 'next-intl';
import {addToCart} from '@/lib/cart';
import type {Product} from '@/lib/catalog';
export function AddToCart({product}:{product:Product}){const t=useTranslations('products');const soldOut=product.type==='physical'&&(product.stockQuantity??0)<1;return <button className="button" disabled={soldOut} onClick={()=>addToCart(product)}><ShoppingBag size={16}/>{soldOut?t('soldOut'):t('add')}</button>;}
