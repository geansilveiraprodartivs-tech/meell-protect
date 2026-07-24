/*
# Add fingerprint columns to delivery_copies

1. Purpose
   - Enables real per-copy fingerprinting for the "Versão protegida" download flow.
   - Each protected copy now carries a unique pseudonymous fingerprint_id embedded in the file binary,
     and the database records the protection method/version used so a future "Verificar Arquivo"
     tool can resolve: fingerprint -> copy -> original file -> owner -> delivery -> recipient.

2. Columns added to delivery_copies (all additive, no data loss)
   - fingerprint_id text NOT NULL  -> unique pseudonymous id embedded in the protected binary (UUID). Never contains personal data.
   - protection_method text NOT NULL DEFAULT 'tracking_only' -> image_png_lsb / image_jpeg_meta / image_webp_meta / pdf_xmp_overlay / metadata_only / tracking_only.
   - protection_version integer NOT NULL DEFAULT 1 -> schema version of the embedding technique, enables future re-embedding without collision.
   - recipient_type text NOT NULL DEFAULT 'client' -> 'owner' (creator self-download) or 'client' (delivery recipient).
   - owner_id uuid -> the protected file owner's auth uid (denormalized for fast lookup).

3. Backfill (safe, idempotent)
   - Existing rows receive a random fingerprint_id, protection_method='tracking_only', protection_version=1, recipient_type='client'.
   - No existing copy_id, copy_hash, original_hash or file is modified or deleted.
   - Honest classification: legacy copies have NO embedded fingerprint, so they are 'tracking_only'.

4. Indexes
   - Unique index on fingerprint_id (lookup key for future verification tool).
   - Composite index on (protected_file_id, delivery_id, protection_version) for copy-reuse lookup.

5. Security
   - No RLS policy changes. delivery_copies RLS remains as-is (service role used by edge functions).
   - No new tables.

6. Notes
   - copy_hash continues to mean the SHA-256 of the actual copy binary (post-protection).
   - original_hash continues to mean the SHA-256 of the original file.
   - For truly protected copies going forward: original_hash != copy_hash.
*/

ALTER TABLE delivery_copies
  ADD COLUMN IF NOT EXISTS fingerprint_id text,
  ADD COLUMN IF NOT EXISTS protection_method text NOT NULL DEFAULT 'tracking_only',
  ADD COLUMN IF NOT EXISTS protection_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS recipient_type text NOT NULL DEFAULT 'client',
  ADD COLUMN IF NOT EXISTS owner_id uuid;

UPDATE delivery_copies
  SET fingerprint_id = gen_random_uuid()::text,
      protection_method = 'tracking_only',
      protection_version = 1,
      recipient_type = 'client'
  WHERE fingerprint_id IS NULL;

ALTER TABLE delivery_copies ALTER COLUMN fingerprint_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS delivery_copies_fingerprint_id_key
  ON delivery_copies (fingerprint_id);

CREATE INDEX IF NOT EXISTS delivery_copies_lookup_idx
  ON delivery_copies (protected_file_id, delivery_id, protection_version);
