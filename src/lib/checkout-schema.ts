import {z} from 'zod';

export const checkoutSchema=z.object({
  items:z.array(z.object({productId:z.string().uuid(),quantity:z.number().int().min(1).max(99)})).min(1).max(50).superRefine((items,context)=>{
    const ids=new Set<string>();
    items.forEach((item,index)=>{if(ids.has(item.productId))context.addIssue({code:'custom',path:[index,'productId'],message:'Duplicate products must be merged.'});ids.add(item.productId);});
  }),
  customer:z.object({name:z.string().trim().min(2).max(120),email:z.string().email().max(254),phone:z.string().max(40).optional(),address:z.string().max(500).optional()}),
  paymentMethod:z.enum(['sepay','payos','cod'])
});
