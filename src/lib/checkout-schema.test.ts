import {describe,expect,it} from 'vitest';
import {checkoutSchema} from './checkout-schema';

const valid={requestKey:'21234567-89ab-4cde-8123-456789abcdef',locale:'vi' as const,items:[{productId:'11234567-89ab-4cde-8123-456789abcdef',quantity:2}],customer:{name:'Mai Nguyen',email:'mai@example.com'},paymentMethod:'sepay'};

describe('checkout input validation',()=>{
  it('accepts a valid itemized order without trusting any client price field',()=>{
    expect(checkoutSchema.safeParse(valid).success).toBe(true);
  });
  it('accepts digital orders without nullable shipping fields',()=>{
    expect(checkoutSchema.safeParse(valid).success).toBe(true);
    expect(checkoutSchema.safeParse({...valid,customer:{...valid.customer,phone:null,address:null}}).success).toBe(false);
  });
  it('rejects malformed product ids and nonpositive quantities',()=>{
    expect(checkoutSchema.safeParse({...valid,items:[{productId:'p-1',quantity:1}]}).success).toBe(false);
    expect(checkoutSchema.safeParse({...valid,items:[{productId:valid.items[0].productId,quantity:0}]}).success).toBe(false);
  });
  it('rejects duplicate product lines so quantities cannot be ambiguously counted',()=>{
    expect(checkoutSchema.safeParse({...valid,items:[...valid.items,...valid.items]}).success).toBe(false);
  });
  it('requires valid customer email and an explicit supported payment method',()=>{
    expect(checkoutSchema.safeParse({...valid,customer:{name:'Mai',email:'invalid'}}).success).toBe(false);
    expect(checkoutSchema.safeParse({...valid,paymentMethod:'cash'}).success).toBe(false);
    expect(checkoutSchema.safeParse({...valid,paymentMethod:'payos'}).success).toBe(false);
  });
});
