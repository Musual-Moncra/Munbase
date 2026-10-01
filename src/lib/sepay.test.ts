import {createHmac} from 'node:crypto';
import {describe,expect,it} from 'vitest';
import {normalizeSePayApiTransaction,parseSePayOrderCode,verifySePaySignature} from './sepay';

describe('SePay webhook security',()=>{
  const secret='test-only-secret';
  const nowSeconds=1_800_000_000;
  const timestamp=String(nowSeconds);
  const rawBody='{"id":123,"content":"MB456"}';
  const signature=`sha256=${createHmac('sha256',secret).update(`${timestamp}.${rawBody}`).digest('hex')}`;

  it('accepts an authentic raw-body signature inside the time window',()=>{
    expect(verifySePaySignature({rawBody,timestamp,signature,secret,nowSeconds})).toBe(true);
  });

  it('rejects modified payloads, stale timestamps, and malformed signatures',()=>{
    expect(verifySePaySignature({rawBody:`${rawBody} `,timestamp,signature,secret,nowSeconds})).toBe(false);
    expect(verifySePaySignature({rawBody,timestamp:String(nowSeconds-301),signature,secret,nowSeconds})).toBe(false);
    expect(verifySePaySignature({rawBody,timestamp,signature:'sha256=bad',secret,nowSeconds})).toBe(false);
  });

  it('extracts only the explicit Munbase order reference',()=>{
    expect(parseSePayOrderCode('MB1024','MB2024 transfer')).toBe(1024);
    expect(parseSePayOrderCode(null,'payment MB2024 thank you')).toBe(2024);
    expect(parseSePayOrderCode(null,'unrelated 2024')).toBe(null);
  });

  it('normalizes the SePay API v2 transaction shape and preserves the bank reference',()=>{
    expect(normalizeSePayApiTransaction({
      id:'11234567-89ab-4cde-8123-456789abcdef',account_number:'0123456789',
      bank_account_id:'21234567-89ab-4cde-8123-456789abcdef',transfer_type:'in',amount_in:12000,
      code:'MB1024',transaction_content:'MB1024 thanh toan',reference_number:'FT26069ABC',transaction_date:'2026-10-01 10:30:00',
    })).toMatchObject({eventId:'11234567-89ab-4cde-8123-456789abcdef',transferAmount:12000,referenceCode:'FT26069ABC',transactionAt:'2026-10-01T03:30:00.000Z'});
  });

  it('rejects malformed transactions that cannot be safely deduplicated',()=>{
    expect(()=>normalizeSePayApiTransaction({id:'not-an-id'})).toThrow();
  });
});
