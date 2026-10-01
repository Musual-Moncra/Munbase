import {defineConfig,devices} from '@playwright/test';

const configuredBaseURL=process.env.PLAYWRIGHT_BASE_URL;
const port=process.env.PLAYWRIGHT_PORT||'3107';
const baseURL=configuredBaseURL||`http://127.0.0.1:${port}`;

export default defineConfig({
  testDir:'./e2e',
  fullyParallel:true,
  forbidOnly:Boolean(process.env.CI),
  retries:process.env.CI?1:0,
  reporter:'list',
  use:{baseURL,trace:'retain-on-failure',screenshot:'only-on-failure',...devices['Desktop Chrome']},
  ...(configuredBaseURL?{}:{webServer:{command:`pnpm dev --hostname 127.0.0.1 --port ${port}`,url:`${baseURL}/vi`,reuseExistingServer:false,timeout:120_000}}),
});
