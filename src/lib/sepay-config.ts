/**
 * Checkout needs the receiving account and a working signed webhook path.
 * API polling credentials and CRON_SECRET belong to background workers and
 * must not prevent a buyer from creating an order and receiving its QR.
 */
export function getSePayCheckoutConfigurationError(config:Record<string,string|undefined>):string|null{
  const environment=config.SEPAY_ENV||'live';
  if(!['test','live'].includes(environment))return 'SePay environment must be test or live.';
  if(!config.SEPAY_BANK_ACCOUNT||!config.SEPAY_BANK_CODE)return 'SePay receiving bank account is not configured.';
  if(!config.SEPAY_WEBHOOK_SECRET)return 'SePay webhook is not configured.';
  if(!config.NEXT_PUBLIC_SUPABASE_URL||!(config.SUPABASE_SERVICE_ROLE_KEY||config.SUPABASE_SECRET_KEY))return 'SePay payment recording is not configured.';
  return null;
}
