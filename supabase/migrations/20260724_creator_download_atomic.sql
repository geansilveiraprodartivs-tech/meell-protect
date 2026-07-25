-- Ensures the atomic downloads_count increment function exists (used by creator-download)
-- This is idempotent: the function already exists from 20260724_atomic_download_increment.sql

CREATE OR REPLACE FUNCTION increment_file_downloads(p_file_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE protected_files SET downloads_count = downloads_count + 1 WHERE id = p_file_id;
END;
$$;
