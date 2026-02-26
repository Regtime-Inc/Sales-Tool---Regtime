/*
  # Add enrichment columns to discovery_cache

  1. Modified Tables
    - `discovery_cache`
      - `potential_units` (integer) - Estimated potential residential units based on slack SF / DU factor
      - `program_flags` (jsonb) - Array of eligible program flags (MIH, UAP, 485-x, 421-a, 467-m)
      - `data_completeness` (numeric) - Score 0-100 reflecting how much data is available for this parcel

  2. Notes
    - These columns are computed during cache refresh from zoning and property data
    - program_flags stores [{program, eligible}] for quick display
    - data_completeness scores higher when sales, owner, building class, and year data are present
    - Indexed on data_completeness for sorting
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'discovery_cache' AND column_name = 'potential_units'
  ) THEN
    ALTER TABLE discovery_cache ADD COLUMN potential_units integer NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'discovery_cache' AND column_name = 'program_flags'
  ) THEN
    ALTER TABLE discovery_cache ADD COLUMN program_flags jsonb NOT NULL DEFAULT '[]'::jsonb;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'discovery_cache' AND column_name = 'data_completeness'
  ) THEN
    ALTER TABLE discovery_cache ADD COLUMN data_completeness numeric NOT NULL DEFAULT 0;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_discovery_cache_data_completeness
  ON discovery_cache (data_completeness DESC);
