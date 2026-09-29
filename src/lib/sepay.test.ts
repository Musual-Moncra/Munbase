import {createHmac} from 'node:crypto';
import {describe,expect,it} from 'vitest';
import {parseSePayOrderCode,verifySePaySignature} from './sepay';

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
});
