/*
  # Add PPBSF column to discovery_cache

  1. Modified Tables
    - `discovery_cache`
      - Added `ppbsf` (numeric) - Price Per Buildable Square Foot, computed as last_sale_price / slack_sf at cache time

  2. Notes
    - PPBSF is used for filtering in the Discovery tab
    - Computed server-side since PostgREST cannot filter on derived expressions
    - Also invalidates stale cache so new rows get PPBSF populated
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'discovery_cache' AND column_name = 'ppbsf'
  ) THEN
    ALTER TABLE discovery_cache ADD COLUMN ppbsf numeric;
  END IF;
END $$;

UPDATE discovery_cache SET cached_at = '2000-01-01' WHERE ppbsf IS NULL AND last_sale_price IS NOT NULL AND slack_sf > 0;
