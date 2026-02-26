/*
  # Add last_sale_date to discovery_cache

  1. Modified Tables
    - `discovery_cache`
      - `last_sale_date` (date, nullable) - most recent sale date from DOF Rolling Sales

  2. Indexes
    - `idx_discovery_last_sale` on last_sale_date for filtered queries

  3. Notes
    - Column is nullable because not all parcels have a recorded sale
    - Used by the discovery tool to filter by recent sale activity
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'discovery_cache' AND column_name = 'last_sale_date'
  ) THEN
    ALTER TABLE discovery_cache ADD COLUMN last_sale_date date;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_discovery_last_sale ON discovery_cache (last_sale_date DESC NULLS LAST);
