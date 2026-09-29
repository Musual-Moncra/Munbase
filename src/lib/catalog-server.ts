import 'server-only';
import {createSupabaseServerClient} from './supabase/server';
import {products,type Product} from './catalog';

type CatalogRow={id:string;seller_id:string;title:string;slug:string;price:number|string;product_type:'physical'|'digital';images:string[];stock_quantity:number;categories:{name:Record<string,string>}|null};

function mapProducts(rows:CatalogRow[],locale:string):Product[]{
  return rows.map(row=>({
    id:row.id,sellerId:row.seller_id,title:row.title,slug:row.slug,price:Number(row.price),
    type:row.product_type,image:row.images[0],seller:'Munbase seller',mark:row.title.split(' ').slice(0,2).join(' '),
    color:'linear-gradient(145deg,#b98c72,#456555)',
    category:row.categories?.name?.[locale]||row.categories?.name?.vi||'Selected',
    stockQuantity:row.stock_quantity,preview:false,
  }));
}

async function loadCatalog(locale:string):Promise<{products:Product[];shippingFee:number}>{
  const supabase=await createSupabaseServerClient();
  if(!supabase)return {products,shippingFee:30000};
  const [catalogResult,settingsResult]=await Promise.all([
    supabase.from('products').select('id,seller_id,title,slug,price,product_type,images,stock_quantity,categories(name)').eq('is_active',true).order('created_at',{ascending:false}),
    supabase.from('marketplace_settings').select('physical_seller_shipping_fee').eq('id',true).maybeSingle(),
  ]);
  const activeProducts=catalogResult.data as CatalogRow[]|null;
  return {
    products:catalogResult.error||!activeProducts?.length?products:mapProducts(activeProducts,locale),
    shippingFee:Number(settingsResult.data?.physical_seller_shipping_fee??30000),
  };
}

export async function getProducts(locale='vi'):Promise<Product[]>{return (await loadCatalog(locale)).products;}
export async function getCheckoutCatalog(locale='vi'){return loadCatalog(locale);}
export async function getProduct(slug:string,locale='vi'){return (await getProducts(locale)).find(product=>product.slug===slug);}
