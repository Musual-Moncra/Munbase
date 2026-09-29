export type Product = {id:string; sellerId?:string; categoryId?:string; title:string; description?:string; seller:string; price:number; type:'physical'|'digital'; mark:string; color:string; category:string; slug:string; image?:string; stockQuantity?:number};
// An empty database is an empty marketplace. Production must never fill it
// with fictional products or ratings.
export const products: Product[] = [];
export const formatVnd = (value:number,locale='vi') => new Intl.NumberFormat(locale==='vi'?'vi-VN':locale,{style:'currency',currency:'VND',maximumFractionDigits:0}).format(value);
