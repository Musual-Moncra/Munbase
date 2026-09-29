-- Add SePay as a first-class payment method. Keep this migration separate from
-- functions that reference the new enum label so Postgres can commit it first.
alter type public.order_payment_method add value if not exists 'sepay';
