import {describe,expect,it} from 'vitest';
import {resolveSellerRevenuePeriod} from './seller-revenue';

const now=new Date('2026-09-30T12:00:00.000Z');

describe('seller revenue reporting period',()=>{
  it.each([[7,'2026-09-24'],[30,'2026-09-01'],[90,'2026-07-03']])('uses an inclusive %i-day window', (days,from)=>{
    const period=resolveSellerRevenuePeriod({days:String(days),now});
    expect(period.fromInput).toBe(from);
    expect(period.toInput).toBe('2026-09-30');
    expect(period.dayCount).toBe(days);
    expect(period.to.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  it('accepts a custom inclusive date range and makes its end exclusive',()=>{
    const period=resolveSellerRevenuePeriod({from:'2026-09-03',to:'2026-09-05',now});
    expect(period.from.toISOString()).toBe('2026-09-03T00:00:00.000Z');
    expect(period.to.toISOString()).toBe('2026-09-06T00:00:00.000Z');
    expect(period.dayCount).toBe(3);
  });

  it('falls back to 30 days for malformed or overlong ranges',()=>{
    for(const options of [{from:'2026-02-30',now},{from:'2025-01-01',to:'2026-09-30',now},{from:'x',now}]){
      expect(resolveSellerRevenuePeriod(options).dayCount).toBe(30);
    }
  });
});
