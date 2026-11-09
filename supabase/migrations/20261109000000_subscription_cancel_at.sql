-- Booktight: track Stripe's own cancel_at, not just cancel_at_period_end
-- Run in the Supabase SQL Editor.
--
-- Cancelling at period end through the Stripe-hosted Billing Portal sets
-- subscription.cancel_at (a specific timestamp) rather than the boolean
-- cancel_at_period_end — confirmed against a real test-mode Portal
-- cancellation, where cancel_at_period_end stayed false the whole time.
-- The webhook (src/app/api/stripe/webhook/route.ts) and the billing page
-- now treat a non-null cancel_at the same as cancel_at_period_end=true,
-- and use it (in preference to current_period_end) as the date shown,
-- since it's the actual moment Stripe will end access.
alter table public.subscriptions
  add column cancel_at timestamptz;
