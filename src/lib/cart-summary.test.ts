import {describe,expect,it} from 'vitest';
import {summarizeCart} from './cart-summary';
import type {Product} from './catalog';
import type {CartLine} from './cart';

const catalog:Product[]=[
  {id:'physical-a',sellerId:'seller-a',title:'Physical A',seller:'A',price:100,type:'physical',mark:'A',color:'',category:'',slug:'physical-a'},
  {id:'physical-b',sellerId:'seller-a',title:'Physical B',seller:'A',price:200,type:'physical',mark:'B',color:'',category:'',slug:'physical-b'},
  {id:'physical-c',sellerId:'seller-b',title:'Physical C',seller:'B',price:300,type:'physical',mark:'C',color:'',category:'',slug:'physical-c'},
  {id:'digital',sellerId:'seller-a',title:'Digital',seller:'A',price:400,type:'digital',mark:'D',color:'',category:'',slug:'digital'},
];
const line=(productId:string,quantity=1):CartLine=>({productId,quantity});

describe('summarizeCart',()=>{
  it('charges one shipping fee for multiple physical items from one seller',()=>{
    const summary=summarizeCart([line('physical-a',2),line('physical-b')],catalog,30000);
    expect(summary.subtotal).toBe(400);
    expect(summary.physicalSellerCount).toBe(1);
    expect(summary.shippingTotal).toBe(30000);
    expect(summary.total).toBe(30400);
    expect(summary.onlyPhysical).toBe(true);
    expect(summary.codEligible).toBe(true);
  });

  it('charges one fee per physical seller and disables COD for mixed baskets',()=>{
    const summary=summarizeCart([line('physical-a'),line('physical-c'),line('digital')],catalog,30000);
    expect(summary.physicalSellerCount).toBe(2);
    expect(summary.shippingTotal).toBe(60000);
    expect(summary.total).toBe(60800);
    expect(summary.hasPhysical).toBe(true);
    expect(summary.onlyPhysical).toBe(false);
    expect(summary.codEligible).toBe(false);
  });

  it('allows COD for a fully physical basket and omits shipping for digital only',()=>{
    expect(summarizeCart([line('physical-c')],catalog,30000).codEligible).toBe(true);
    const digital=summarizeCart([line('digital',2)],catalog,30000);
    expect(digital.onlyPhysical).toBe(false);
    expect(digital.hasPhysical).toBe(false);
    expect(digital.codEligible).toBe(false);
    expect(digital.shippingTotal).toBe(0);
  });

  it('marks products removed from the live catalogue as unavailable',()=>{
    const summary=summarizeCart([line('gone'),line('digital')],catalog,30000);
    expect(summary.unavailableCount).toBe(1);
    expect(summary.lines.map(({product})=>product.id)).toEqual(['digital']);
    expect(summary.subtotal).toBe(400);
    expect(summary.onlyPhysical).toBe(false);
  });
});
