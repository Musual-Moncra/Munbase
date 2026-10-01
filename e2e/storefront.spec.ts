import {test,expect} from '@playwright/test';

test('catalog and cart surfaces render in Vietnamese and English',async({page})=>{
  await page.goto('/vi/products');
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading',{name:'Khám phá sản phẩm'})).toBeVisible();
  await expect(page.getByRole('textbox',{name:'Tìm sản phẩm'})).toBeVisible();
  await page.getByRole('combobox',{name:'Language'}).selectOption('en');
  await page.waitForLoadState('networkidle');
  await expect(page).toHaveURL(/\/en\/products$/);
  await expect(page.locator('html')).toHaveAttribute('lang','en');
  await expect(page.getByRole('heading',{name:'Explore products'})).toBeVisible();
  await page.goto('/vi/cart');
  await expect(page.getByRole('heading',{name:'Giỏ hàng'})).toBeVisible();
});

test('digital checkout creates a SePay Test Mode order and shows transfer details',async({page})=>{
  test.skip(process.env.MUNBASE_E2E_CREATE_ORDER!=='1','Creates a persistent Development/Preview test order; opt in explicitly.');
  const email=process.env.PLAYWRIGHT_BUYER_EMAIL;
  const password=process.env.PLAYWRIGHT_BUYER_PASSWORD;
  const slug=process.env.PLAYWRIGHT_DIGITAL_PRODUCT_SLUG;
  test.skip(!email||!password||!slug,'Requires an allowlisted test buyer and an active digital fixture.');
  await page.goto('/vi/login');
  await page.getByLabel(/email/i).fill(email!);
  await page.getByLabel(/mật khẩu/i).fill(password!);
  await page.getByRole('button',{name:'Đăng nhập'}).click();
  await expect(page.getByRole('link',{name:'Giỏ hàng (0)'})).toBeVisible();
  await page.goto(`/vi/products/${encodeURIComponent(slug!)}`);
  await page.getByRole('button',{name:'Thêm vào giỏ'}).click();
  await page.goto('/vi/checkout');
  await page.getByLabel('Họ tên').fill('Munbase Test Buyer');
  await page.getByLabel('Email nhận biên nhận').fill(email!);
  await page.getByRole('button',{name:'Tạo đơn hàng'}).click();
  await expect(page).toHaveURL(/\/vi\/orders\/[0-9a-f-]+$/,{timeout:30_000});
  await expect(page.getByRole('heading',{name:'Quét mã QR để thanh toán'})).toBeVisible();
  await expect(page.getByText(/MB\d+/)).toBeVisible();
  await expect(page.getByRole('button',{name:'Kiểm tra thanh toán'})).toBeVisible();
});
