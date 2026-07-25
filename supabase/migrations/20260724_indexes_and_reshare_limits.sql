/*
# Meell Protect — Reshare limits, performance indexes, and updated_at triggers
*/

-- Add resharing control columns to deliveries
ALTER TABLE deliveries
  ADD COLUMN IF NOT EXISTS parent_delivery_id uuid REFERENCES deliveries(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS allow_resharing boolean NOT NULL DEFAULT true;

-- Extend delivery_events event_type to include 'shared' and 'blocked'
ALTER TABLE delivery_events DROP CONSTRAINT IF EXISTS delivery_events_event_type_check;
ALTER TABLE delivery_events ADD CONSTRAINT delivery_events_event_type_check
  CHECK (event_type IN ('created','viewed','downloaded','revoked','expired','shared','blocked'));

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_delivery_events_created_at ON delivery_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_delivery_events_delivery_id ON delivery_events(delivery_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_secure_token ON deliveries(secure_token);
CREATE INDEX IF NOT EXISTS idx_deliveries_parent ON deliveries(parent_delivery_id);

-- Allow resharing depth limit check
CREATE INDEX IF NOT EXISTS idx_deliveries_parent_id ON deliveries(parent_delivery_id);

-- updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to all tables with updated_at column
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY['profiles', 'protected_files', 'clients', 'deliveries', 'plans', 'subscriptions'])
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at ON %I', t);
    EXECUTE format('CREATE TRIGGER set_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at()', t);
  END LOOP;
END;
$$;
