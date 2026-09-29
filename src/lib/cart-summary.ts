import type {Product} from './catalog';
import type {CartLine} from './cart';

export function summarizeCart(cart:CartLine[],products:Product[],shippingFee:number){
  const productsById=new Map(products.map(product=>[product.id,product]));
  const lines=cart.flatMap(line=>{
    const product=productsById.get(line.productId);
    return product&&!product.preview?[{line,product}]:[];
  });
  const physicalLines=lines.filter(({product})=>product.type==='physical');
  const sellers=new Set(physicalLines.map(({product})=>product.sellerId).filter((id):id is string=>Boolean(id)));
  const subtotal=lines.reduce((sum,{line,product})=>sum+product.price*line.quantity,0);
  const shippingTotal=physicalLines.length?sellers.size*shippingFee:0;

  return {
    lines,
    unavailableCount:cart.length-lines.length,
    physicalSellerCount:sellers.size,
    hasPhysical:physicalLines.length>0,
    onlyPhysical:lines.length>0&&lines.length===cart.length&&lines.every(({product})=>product.type==='physical'),
    subtotal,
    shippingTotal,
    total:subtotal+shippingTotal,
  };
}
