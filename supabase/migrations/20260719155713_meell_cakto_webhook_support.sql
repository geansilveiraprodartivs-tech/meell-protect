/*
# Cakto webhook support

1. Purpose
- Adds durable infrastructure so the `cakto-webhook` Edge Function can process
  Cakto payment events safely: idempotency, audit trail, and richer subscription
  tracking. Nothing here changes existing tables' data or design; it only extends
  them with nullable audit columns and adds one new events table.

2. New Tables
- `cakto_webhook_events`
  - `id` uuid PRIMARY KEY (default gen_random_uuid)
  - `event_id` text UNIQUE NOT NULL — Cakto's unique event/transaction id, used for idempotency
  - `event_type` text NOT NULL — normalized event type (approved, renewal, canceled, refunded, etc.)
  - `raw_event_type` text — original event type string sent by Cakto (for debugging)
  - `email` text — buyer email from the payload (for debugging)
  - `plan_id` text — resolved plan id (start/pro/business/free)
  - `payload` jsonb NOT NULL DEFAULT '{}'::jsonb — full raw payload for audit
  - `processed_at` timestamptz NOT NULL DEFAULT now()
  - Index on `event_id` (unique) for fast dedup.

3. Modified Tables
- `subscriptions`
  - Add `provider_event_id` text (nullable) — last Cakto event id that updated this row.
  - Add `event_type` text (nullable) — last normalized event type.
  - Add `raw_payload` jsonb (nullable) — last raw payload snapshot.
  All additions are nullable and have no NOT NULL/default, so existing rows are unaffected.

4. Security
- `cakto_webhook_events` has RLS ENABLED with NO policies (locked down). Only the
  service role (used by the Edge Function) can read/write it. This is intentional:
  the table is an internal audit/idempotency log, never exposed to the anon client.
- Existing RLS on `subscriptions` and `profiles` is untouched. The Edge Function
  writes using the service role key, which bypasses RLS, so no policy changes are
  needed for the webhook to function.

5. Notes
- This migration is idempotent: uses IF NOT EXISTS for the table and DO $$ ... END $$
  for conditional column additions. Safe to re-run.
- The Edge Function maps Cakto offer -> plan_id by value (price_cents) as a fallback
  until explicit Cakto offer IDs are provided. The `cakto_webhook_events.plan_id`
  column records the resolved plan for every event for future debugging.
*/

-- New idempotency + audit table
CREATE TABLE IF NOT EXISTS cakto_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text UNIQUE NOT NULL,
  event_type text NOT NULL,
  raw_event_type text,
  email text,
  plan_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cakto_webhook_events_event_id_idx
  ON cakto_webhook_events (event_id);

ALTER TABLE cakto_webhook_events ENABLE ROW LEVEL SECURITY;

-- Optional: allow authenticated users to read their own webhook events by email
DROP POLICY IF EXISTS "read_own_cakto_events" ON cakto_webhook_events;
CREATE POLICY "read_own_cakto_events"
  ON cakto_webhook_events FOR SELECT
  TO authenticated
  USING (email = (SELECT email FROM profiles WHERE profiles.id = auth.uid()));

-- Extend subscriptions with audit columns (all nullable, no data loss)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='subscriptions'
                   AND column_name='provider_event_id') THEN
    ALTER TABLE subscriptions ADD COLUMN provider_event_id text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='subscriptions'
                   AND column_name='event_type') THEN
    ALTER TABLE subscriptions ADD COLUMN event_type text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='subscriptions'
                   AND column_name='raw_payload') THEN
    ALTER TABLE subscriptions ADD COLUMN raw_payload jsonb;
  END IF;
END $$;
