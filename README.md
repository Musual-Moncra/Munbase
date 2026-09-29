# Munbase Marketplace

Munbase is a multilingual marketplace MVP for independent sellers of physical and digital products. It uses Next.js 16 App Router, Supabase Auth/Postgres/Storage, `next-intl`, SePay, optional PayOS and Resend.

## Local development

1. Install the dependencies with `pnpm install`.
2. Copy `.env.example` to `.env.local` and set the Supabase development URL and publishable key. A local `.env.local` is already prepared for the Munbase Development project and is ignored by Git.
3. Run `pnpm dev` and open `http://localhost:3000/vi`.

The locale routes are `/vi`, `/en`, `/ko`, `/zh` and `/ja`. If the database has no active products yet, the storefront shows clearly marked preview cards that cannot be purchased.

## Marketplace setup

- Apply the SQL migrations under `supabase/migrations/` in order. The current development project has all four migrations applied.
- Enable email/password and Google in Supabase Auth. Add `http://localhost:3000/auth/callback` and the deployed callback URL to the Auth redirect allow-list.
- Create the first administrator from Supabase SQL Editor after a trusted account has signed up:

  ```sql
  select id, email from auth.users;
  update public.profiles set role = 'admin' where id = '<trusted-user-id>';
  ```

  Admin roles cannot be granted from the registration form. Admins approve seller applications from `/[locale]/admin`.
- Configure SePay's receiving `SEPAY_BANK_ACCOUNT`, bank identifier `SEPAY_BANK_CODE` (for example `TPBank`), and `SEPAY_ACCOUNT_NAME`. The order page creates a dynamic QR with amount and `MB<order-code>` reference.
- Register `https://<host>/api/webhooks/sepay` in SePay for incoming transfers. Choose HMAC-SHA256, store the generated secret as `SEPAY_WEBHOOK_SECRET`, and configure payment-code prefix `MB`. Configure the same receiving account in both SePay and `SEPAY_BANK_ACCOUNT`. The webhook verifies the raw-body signature and timestamp, then confirms only an exact amount and matching order reference. Underpaid, overpaid, unmatched, and repeat transfers remain unpaid for manual review.
- The SePay QR image uses SePay's documented VietQR image endpoint; the recipient account number, amount, and order reference are included in its image URL.
- Optional PayOS remains available by configuring `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY`, then registering `https://<host>/api/webhooks/payos` in PayOS.
- Configure `RESEND_API_KEY` and a verified `RESEND_FROM_EMAIL` to send paid-order receipts. Receipt links require the buyer to sign in.
- Keep `SUPABASE_SERVICE_ROLE_KEY` server-only. It is used by verified payment webhooks only.

Digital files live in the private `digital-assets` bucket. Buyer downloads are checked against the signed-in owner and paid order, then receive a 60-second signed URL. Physical products are charged one configured flat shipping fee per seller. Digital goods cannot be paid COD.

## Validation

Use `./node_modules/.bin/tsc --noEmit`, `./node_modules/.bin/eslint .`, `./node_modules/.bin/vitest run` and `./node_modules/.bin/next build`. `pnpm` may request approval for native dependency build scripts; the checks above invoke installed tools directly.

## Release status

This checkout is local and has not been pushed to GitHub. Preview deployment and production remain pending Vercel project access and payment/email credentials. Production also requires a separate production Supabase project, owner review of marketplace operations and funds flow, and successful end-to-end checks on Preview.
