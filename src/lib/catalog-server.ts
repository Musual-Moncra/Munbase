import 'server-only';
import {createSupabaseServerClient} from './supabase/server';
import {products,type Product} from './catalog';

export async function getProducts():Promise<Product[]>{const supabase=await createSupabaseServerClient();if(!supabase)return products;const {data,error}=await supabase.from('products').select('id,title,slug,price,product_type,images,categories(name)').eq('is_active',true).order('created_at',{ascending:false});if(error||!data?.length)return products;return data.map(row=>({id:row.id,title:row.title,slug:row.slug,price:Number(row.price),type:row.product_type,images:undefined,image:row.images[0],seller:'Munbase seller',mark:row.title.split(' ').slice(0,2).join(' '),color:'linear-gradient(145deg,#b98c72,#456555)',category:typeof row.categories==='object'&&row.categories&&'name' in row.categories?String((row.categories.name as Record<string,string>)?.vi||'Selected'): 'Selected',preview:false}));}
export async function getProduct(slug:string){return (await getProducts()).find(product=>product.slug===slug);}
