import {createHmac, timingSafeEqual} from 'node:crypto';
import {z} from 'zod';

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

const apiTransactionSchema=z.object({
  id:z.string().uuid(),
  account_number:z.string().min(1).max(40),
  bank_account_id:z.string().uuid(),
  transfer_type:z.enum(['in','out']),
  amount_in:z.number().int().nonnegative(),
  code:z.string().max(80).nullable().optional(),
  transaction_content:z.string().max(1000).nullable().optional(),
  reference_number:z.string().max(120).nullable().optional(),
  transaction_date:z.string().min(1).max(50),
});

export function normalizeSePayApiTransaction(input:unknown){
  const transaction=apiTransactionSchema.parse(input);
  const transactionDate=transaction.transaction_date.includes('T')
    ?transaction.transaction_date
    :`${transaction.transaction_date.replace(' ','T')}+07:00`;
  const parsedDate=new Date(transactionDate);
  if(Number.isNaN(parsedDate.getTime()))throw new Error('invalid_sepay_transaction_date');
  return {
    eventId:transaction.id,
    accountNumber:transaction.account_number,
    bankAccountId:transaction.bank_account_id,
    transferType:transaction.transfer_type,
    transferAmount:transaction.amount_in,
    code:transaction.code??null,
    content:transaction.transaction_content??'',
    referenceCode:transaction.reference_number??null,
    transactionAt:parsedDate.toISOString(),
  };
}
