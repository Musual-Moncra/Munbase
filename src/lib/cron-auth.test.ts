import {describe,expect,it} from 'vitest';
import {verifyCronAuthorization} from './cron-auth';

describe('internal cron authorization',()=>{
  it('accepts only the configured bearer token',()=>{
    expect(verifyCronAuthorization('Bearer worker-test-secret','worker-test-secret')).toBe(true);
    expect(verifyCronAuthorization('Bearer wrong-secret','worker-test-secret')).toBe(false);
    expect(verifyCronAuthorization(null,'worker-test-secret')).toBe(false);
    expect(verifyCronAuthorization('Bearer worker-test-secret',undefined)).toBe(false);
  });
});
