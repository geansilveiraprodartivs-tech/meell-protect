/*
# Post-Download Protection: delivery_copies table and delivery-copies bucket

1. Purpose
- Adds a "Proteção Pós-Download" layer: when a creator delivers a file to a
  client, the system can generate an individualized, traceable copy of that
  file. The original in protected-files is NEVER modified.
- Stores copy_id -> protected_file_id -> delivery_id -> client_id -> created_at.
- Stores SHA-256 hashes of both original and derived copy.
- Derived copies live in a NEW private bucket "delivery-copies".

2. New Tables
- `delivery_copies`
  - id (uuid PK)
  - copy_id (text, UNIQUE) — cryptographically random, non-sequential
  - delivery_id (uuid FK -> deliveries, CASCADE)
  - protected_file_id (uuid FK -> protected_files, CASCADE)
  - client_id (uuid FK -> clients, CASCADE)
  - user_id (uuid FK -> auth.users, CASCADE) — the creator/owner
  - original_hash (text) — SHA-256 of the original file
  - copy_hash (text) — SHA-256 of the derived copy
  - copy_storage_path (text) — path in delivery-copies bucket
  - copy_mime_type (text)
  - copy_file_name (text) — original filename preserved for download
  - copy_size (bigint)
  - protection_mode (text) — 'default' | 'watermark' | 'none'
  - watermark_config (jsonb) — what fields to include in custom watermark
  - status (text) — 'pending' | 'ready' | 'failed'
  - created_at, updated_at (timestamptz)

3. Modified Tables (retrocompatible — all new columns nullable)
- `deliveries`
  - copy_id (text, nullable) — links to delivery_copies.copy_id
  - protection_mode (text, nullable, default 'default')
  - watermark_config (jsonb, nullable)
- `protected_files`
  - original_hash (text, nullable) — SHA-256 of the original file

4. New Storage Bucket
- `delivery-copies` (private, public=false) — stores derived/individualized copies

5. Security
- RLS enabled on delivery_copies (owner-scoped: auth.uid() = user_id)
- Storage policies for delivery-copies bucket (owner-scoped)
- No changes to protected-files bucket or its policies
- No weakening of any existing RLS

6. Compatibility
- All new columns are nullable — existing rows are unaffected
- Existing deliveries (null protection_mode) are treated as 'none' by the
  edge function (backward compatible — client gets original via signed URL)
- MP-2026-N22L5D and all existing files continue to work unchanged
*/

-- delivery_copies table
CREATE TABLE IF NOT EXISTS delivery_copies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  copy_id text UNIQUE NOT NULL,
  delivery_id uuid NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
  protected_file_id uuid NOT NULL REFERENCES protected_files(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  original_hash text,
  copy_hash text,
  copy_storage_path text NOT NULL,
  copy_mime_type text NOT NULL DEFAULT 'application/octet-stream',
  copy_file_name text NOT NULL,
  copy_size bigint NOT NULL DEFAULT 0,
  protection_mode text NOT NULL DEFAULT 'default',
  watermark_config jsonb,
  status text NOT NULL DEFAULT 'ready',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_delivery_copies_delivery_id ON delivery_copies(delivery_id);
CREATE INDEX IF NOT EXISTS idx_delivery_copies_copy_id ON delivery_copies(copy_id);

ALTER TABLE delivery_copies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "copies_owner_select" ON delivery_copies;
CREATE POLICY "copies_owner_select" ON delivery_copies FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "copies_owner_insert" ON delivery_copies;
CREATE POLICY "copies_owner_insert" ON delivery_copies FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "copies_owner_update" ON delivery_copies;
CREATE POLICY "copies_owner_update" ON delivery_copies FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "copies_owner_delete" ON delivery_copies;
CREATE POLICY "copies_owner_delete" ON delivery_copies FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Add columns to deliveries (retrocompatible)
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS copy_id text;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS protection_mode text DEFAULT 'default';
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS watermark_config jsonb;

-- Add original_hash to protected_files (retrocompatible)
ALTER TABLE protected_files ADD COLUMN IF NOT EXISTS original_hash text;

-- Create delivery-copies bucket (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('delivery-copies', 'delivery-copies', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for delivery-copies bucket (owner-scoped)
DROP POLICY IF EXISTS "copy_storage_owner_insert" ON storage.objects;
CREATE POLICY "copy_storage_owner_insert" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK ((bucket_id = 'delivery-copies') AND (auth.uid()::text = owner_id));

DROP POLICY IF EXISTS "copy_storage_owner_select" ON storage.objects;
CREATE POLICY "copy_storage_owner_select" ON storage.objects FOR SELECT
  TO authenticated USING ((bucket_id = 'delivery-copies') AND (auth.uid()::text = owner_id));

DROP POLICY IF EXISTS "copy_storage_owner_delete" ON storage.objects;
CREATE POLICY "copy_storage_owner_delete" ON storage.objects FOR DELETE
  TO authenticated USING ((bucket_id = 'delivery-copies') AND (auth.uid()::text = owner_id));
