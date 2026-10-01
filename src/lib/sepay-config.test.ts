import {describe,expect,it} from 'vitest';
import {getSePayCheckoutConfigurationError} from './sepay-config';

const ready={
  SEPAY_ENV:'test',SEPAY_BANK_ACCOUNT:'0123456789',SEPAY_BANK_CODE:'TPBank',
  SEPAY_WEBHOOK_SECRET:'test-webhook-secret',NEXT_PUBLIC_SUPABASE_URL:'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY:'test-service-key',
};

describe('SePay checkout configuration',()=>{
  it('allows checkout when payment recording is configured without background worker credentials',()=>{
    expect(getSePayCheckoutConfigurationError(ready)).toBeNull();
    expect(getSePayCheckoutConfigurationError({...ready,SEPAY_API_TOKEN:undefined,SEPAY_BANK_ACCOUNT_ID:undefined,CRON_SECRET:undefined})).toBeNull();
  });

  it('blocks checkout when the receiving account or signed payment recording path is incomplete',()=>{
    expect(getSePayCheckoutConfigurationError({...ready,SEPAY_BANK_ACCOUNT:''})).toMatch(/receiving bank account/);
    expect(getSePayCheckoutConfigurationError({...ready,SEPAY_WEBHOOK_SECRET:''})).toMatch(/webhook/);
    expect(getSePayCheckoutConfigurationError({...ready,SUPABASE_SERVICE_ROLE_KEY:'',SUPABASE_SECRET_KEY:''})).toMatch(/payment recording/);
  });

  it('rejects an unknown SePay environment',()=>{
    expect(getSePayCheckoutConfigurationError({...ready,SEPAY_ENV:'preview'})).toMatch(/environment/);
  });
});
