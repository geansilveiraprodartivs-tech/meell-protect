-- Atomic counter increments to prevent race conditions on download_count / downloads_count

create or replace function increment_download_count(p_delivery_id uuid)
returns void
language sql
as $$
  update deliveries
     set download_count   = download_count + 1,
         last_downloaded_at = now()
   where id = p_delivery_id;
$$;

create or replace function increment_file_downloads(p_file_id uuid)
returns void
language sql
as $$
  update protected_files
     set downloads_count = downloads_count + 1
   where id = p_file_id;
$$;

-- Allow 'blocked' as a delivery event type (security denial events)
alter table delivery_events
  drop constraint if exists delivery_events_event_type_check;

alter table delivery_events
  add constraint delivery_events_event_type_check
  check (event_type in ('created', 'viewed', 'downloaded', 'revoked', 'expired', 'shared', 'blocked'));
