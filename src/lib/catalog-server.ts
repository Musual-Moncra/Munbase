import 'server-only';
import {createSupabaseServerClient} from './supabase/server';
import {type Product} from './catalog';

type CatalogRow={id:string;seller_id:string;category_id:string|null;title:string;slug:string;description:string;price:number|string;product_type:'physical'|'digital';images:string[];stock_quantity:number;categories:{name:Record<string,string>}|null};

function mapProducts(rows:CatalogRow[],locale:string,shops:Map<string,string>):Product[]{
  return rows.map(row=>({
    id:row.id,sellerId:row.seller_id,categoryId:row.category_id||undefined,title:row.title,slug:row.slug,price:Number(row.price),
    description:row.description,type:row.product_type,image:row.images[0],seller:shops.get(row.seller_id)||'Munbase seller',mark:row.title.split(' ').slice(0,2).join(' '),
    color:'linear-gradient(145deg,#b98c72,#456555)',
    category:row.categories?.name?.[locale]||row.categories?.name?.vi||'Selected',
    stockQuantity:row.stock_quantity,
  }));
}

async function loadCatalog(locale:string):Promise<{products:Product[];shippingFee:number}>{
  const supabase=await createSupabaseServerClient();
  if(!supabase)return {products:[],shippingFee:30000};
  const [catalogResult,settingsResult]=await Promise.all([
    supabase.from('products').select('id,seller_id,category_id,title,slug,description,price,product_type,images,stock_quantity,categories(name)').eq('is_active',true).order('created_at',{ascending:false}),
    supabase.from('marketplace_settings').select('physical_seller_shipping_fee').eq('id',true).maybeSingle(),
  ]);
  const activeProducts=catalogResult.data as CatalogRow[]|null;
  const sellers=[...new Set((activeProducts||[]).map(row=>row.seller_id))];
  const {data:shopRows}=sellers.length?await supabase.from('shops').select('seller_id,shop_name').in('seller_id',sellers):{data:[]};
  const shops=new Map((shopRows||[]).map(shop=>[shop.seller_id,shop.shop_name]));
  const listedProducts=(activeProducts||[]).filter(row=>shops.has(row.seller_id));
  return {
    products:catalogResult.error||!listedProducts.length?[]:mapProducts(listedProducts,locale,shops),
    shippingFee:Number(settingsResult.data?.physical_seller_shipping_fee??30000),
  };
}

export async function getProducts(locale='vi'):Promise<Product[]>{return (await loadCatalog(locale)).products;}
export async function getCheckoutCatalog(locale='vi'){return loadCatalog(locale);}
export async function getProduct(slug:string,locale='vi'){return (await getProducts(locale)).find(product=>product.slug===slug);}
