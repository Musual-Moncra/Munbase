import {z} from 'zod';

export const checkoutSchema=z.object({
  requestKey:z.string().uuid(),
  locale:z.enum(['vi','en','ko','zh','ja']),
  items:z.array(z.object({productId:z.string().uuid(),quantity:z.number().int().min(1).max(99)})).min(1).max(50).superRefine((items,context)=>{
    const ids=new Set<string>();
    items.forEach((item,index)=>{if(ids.has(item.productId))context.addIssue({code:'custom',path:[index,'productId'],message:'Duplicate products must be merged.'});ids.add(item.productId);});
  }),
  customer:z.object({
    name:z.string().trim().min(2).max(120),email:z.string().email().max(254),
    phone:z.string().trim().max(40).optional(),addressId:z.string().uuid().optional(),
    address:z.object({recipient_name:z.string().trim().min(2).max(120),phone:z.string().trim().min(7).max(40),province:z.string().trim().min(2).max(120),district:z.string().trim().min(2).max(120),ward:z.string().trim().min(2).max(120),address_line:z.string().trim().min(4).max(300),note:z.string().max(300).optional()}).optional()
  }),
  paymentMethod:z.enum(['sepay','cod'])
});
