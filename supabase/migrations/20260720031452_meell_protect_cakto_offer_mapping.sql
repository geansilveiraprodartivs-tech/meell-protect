/*
# Cakto offer ID mapping for plans

1. Purpose
- Adds a `cakto_offer_id` column to the `plans` table so the cakto-webhook
  Edge Function can map a real Cakto offer id (received in data.offer.id of
  the webhook payload) to the corresponding Meell Protect plan.
- Also fixes swapped checkout_url values that were found during review:
  Start had Business's checkout URL and vice versa.

2. Modified Tables
- `plans`
  - Add `cakto_offer_id` text (nullable) — real Cakto offer id (from the Cakto
    API /public_api/offers/). Populated by the Edge Function at runtime when it
    discovers the real offer ids. No NOT NULL/default so existing rows are
    unaffected.
  - Fix `checkout_url` values for start/pro/business to match the real links:
    Start  -> https://pay.cakto.com.br/acgx4jt
    Pro    -> https://pay.cakto.com.br/afm6i4y
    Business -> https://pay.cakto.com.br/37jm2yg_989500

3. Security
- No new tables. No RLS changes. `plans` is already readable by the app.
*/

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS cakto_offer_id text;

UPDATE plans SET checkout_url = 'https://pay.cakto.com.br/acgx4jt'        WHERE id = 'start';
UPDATE plans SET checkout_url = 'https://pay.cakto.com.br/afm6i4y'        WHERE id = 'pro';
UPDATE plans SET checkout_url = 'https://pay.cakto.com.br/37jm2yg_989500' WHERE id = 'business';
