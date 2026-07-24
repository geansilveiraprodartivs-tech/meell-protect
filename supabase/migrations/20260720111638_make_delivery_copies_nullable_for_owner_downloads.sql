/*
# Make delivery_copies.delivery_id and client_id nullable

1. Purpose
   - The creator-download (owner self-download) flow needs to insert into delivery_copies
     with delivery_id = NULL and client_id = NULL, because an owner download has no
     delivery and no client.
   - Currently both columns are NOT NULL, which silently rejects the insert and breaks
     fingerprint persistence + reuse.

2. Changes (additive, non-destructive)
   - ALTER delivery_id to nullable.
   - ALTER client_id to nullable.
   - No data is modified or deleted.
   - Existing rows keep their values.

3. Security
   - No RLS policy changes.
*/

ALTER TABLE delivery_copies ALTER COLUMN delivery_id DROP NOT NULL;
ALTER TABLE delivery_copies ALTER COLUMN client_id DROP NOT NULL;
