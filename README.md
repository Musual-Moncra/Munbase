# Munbase Marketplace

Munbase is a multilingual marketplace for physical and digital products. It uses Next.js 16 App Router, Supabase Auth/Postgres/Storage, `next-intl`, SePay, and Resend.

## Local development

1. Install dependencies with `pnpm install`.
2. Copy `.env.example` to `.env.local` and set the Supabase **Development** URL and publishable key. The real local `.env.local` is ignored by Git.
3. Run `pnpm dev` and open `http://localhost:3000/vi`.

The supported locales are Vietnamese, English, Korean, Chinese, and Japanese. An empty product table displays an empty catalogue; demo products and ratings are not used as live marketplace content.

## Supabase setup

- Apply every file in `supabase/migrations/` in timestamp order to Development first, then Production after validation. Keep each applied migration in version control.
- Configure Supabase Auth email/password, Google OAuth, email confirmation, password recovery and the exact local/production callback URLs. Keep leaked-password protection enabled.
- Promote the first admin only after checking the trusted owner's verified Auth email and matching profile. Run the one-time role update in the Supabase SQL editor; never expose role changes through the app.
- Seller applications are approved in `/[locale]/admin`. Only approved seller accounts can publish. Product images are limited to five JPEG, PNG or WebP files (5 MB each); private digital files are limited to 50 MB.
- Orders support SePay and COD. COD is restricted to physical goods from one seller. SePay pending orders expire after 24 hours; scheduled jobs reconcile incoming transfers every 15 minutes and deliver the durable email outbox each minute. Late, short, overpaid and unmatched transfers stay visible for manual review.
- Keep separate SePay Test Mode credentials for Preview and Live credentials for Production. Set `SEPAY_ENV`, `SEPAY_BANK_ACCOUNT`, `SEPAY_BANK_ACCOUNT_ID`, `SEPAY_BANK_CODE`, `SEPAY_ACCOUNT_NAME`, `SEPAY_WEBHOOK_SECRET`, and `SEPAY_API_TOKEN`. Never reuse a Preview webhook or API token in Production.
- Set `CRON_SECRET` on the app and add `munbase-job-url` plus `munbase-cron-secret` to each Supabase project's Vault. Cron stays dormant until both Vault secrets exist. Configure `RESEND_API_KEY` and `RESEND_FROM_EMAIL` after verifying the sender domain; email failures remain in the admin outbox for retry.
- Checkout starts disabled. Admins must enable intake and explicitly allowlist buyer profile IDs for each controlled test environment. The API and database RPC both enforce this gate. Buyers must sign in to view orders or download paid digital purchases.
- Seller payouts are manual with 0% commission. Physical goods must be marked delivered; COD proceeds must also be marked received from the carrier before the order can be reconciled.

## Validation

Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:e2e`, `pnpm build`, and `git diff --check`. The public Playwright smoke test runs against localhost by default. To create a persistent Development/Preview digital order, explicitly set `MUNBASE_E2E_CREATE_ORDER=1`, `PLAYWRIGHT_BUYER_EMAIL`, `PLAYWRIGHT_BUYER_PASSWORD`, and `PLAYWRIGHT_DIGITAL_PRODUCT_SLUG`; the account must already be allowlisted and SePay must be in Test Mode. Verify buyer, seller, admin, file upload/download, cancellation, expiration, webhook replay/late transfer, COD and payout flows on Preview before applying the same migrations to Production.

## Production release gates

The site stays on `https://munbase.vercel.app`. Do not enable public order intake until the first admin and seller are active, a real listing exists, verified-domain email sends, a controlled small-value Production SePay transfer confirms the right order, COD has been accepted, and the owner has approved `docs/launch-policies-draft.md`. The draft is internal and must not be published before review. Buying `munbase.co` is only for sender-domain verification; it is not the website domain.

Store Production credentials in Vercel project settings, never in Git or local development. Required server-only variables are `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `SEPAY_ENV=live`, `SEPAY_API_TOKEN`, `SEPAY_BANK_ACCOUNT_ID`, `SEPAY_BANK_ACCOUNT`, and `SEPAY_WEBHOOK_SECRET`, plus `RESEND_API_KEY` and `RESEND_FROM_EMAIL` for email. `NEXT_PUBLIC_SITE_URL` should point at the production Vercel URL. The controlled release ends with allowlisted Production buyers only; public intake waits for the policy review gate above.
