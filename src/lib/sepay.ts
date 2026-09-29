import {createHmac, timingSafeEqual} from 'node:crypto';

const MAX_CLOCK_SKEW_SECONDS = 300;

export function verifySePaySignature({
  rawBody,
  timestamp,
  signature,
  secret,
  nowSeconds = Math.floor(Date.now() / 1000),
}: {
  rawBody: string;
  timestamp: string | null;
  signature: string | null;
  secret: string;
  nowSeconds?: number;
}): boolean {
  if (!secret || !timestamp || !signature || !/^\d{1,12}$/.test(timestamp)) return false;
  if (!/^sha256=[a-f\d]{64}$/i.test(signature)) return false;

  const timestampSeconds = Number(timestamp);
  if (!Number.isSafeInteger(timestampSeconds) || Math.abs(nowSeconds - timestampSeconds) > MAX_CLOCK_SKEW_SECONDS) return false;

  const expected = `sha256=${createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')}`;
  const expectedBytes = Buffer.from(expected, 'ascii');
  const actualBytes = Buffer.from(signature, 'ascii');
  return expectedBytes.length === actualBytes.length && timingSafeEqual(expectedBytes, actualBytes);
}

export function parseSePayOrderCode(code: string | null, content: string): number | null {
  const candidates = [code, content].filter((value): value is string => Boolean(value));
  for (const value of candidates) {
    const reference = /(?:^|[^a-z0-9])MB(\d{1,15})(?!\d)/i.exec(value);
    if (reference) {
      const orderCode = Number(reference[1]);
      if (Number.isSafeInteger(orderCode)) return orderCode;
    }
  }
  return null;
}
