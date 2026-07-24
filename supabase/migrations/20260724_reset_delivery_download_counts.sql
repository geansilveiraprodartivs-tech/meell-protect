-- Reset download_count for deliveries that hit the limit but weren't actually downloaded
-- (GET was being counted as download due to a bug)
UPDATE deliveries
SET download_count = 0
WHERE download_count >= download_limit
  AND id IN (
    SELECT delivery_id
    FROM delivery_events
    WHERE event_type = 'blocked'
      AND meta->>'reason' = 'limit_reached'
      AND created_at > now() - interval '1 hour'
  );

-- Also reset any delivery that has download_count > 0 but no actual 'downloaded' event
UPDATE deliveries d
SET download_count = 0
WHERE d.download_count > 0
  AND NOT EXISTS (
    SELECT 1 FROM delivery_events de
    WHERE de.delivery_id = d.id
      AND de.event_type = 'downloaded'
  );
