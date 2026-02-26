/*
  # Add sale price and source to discovery_cache

  1. Modified Tables
    - `discovery_cache`
      - `last_sale_price` (numeric, nullable) - price of the most recent sale
      - `last_sale_source` (text, nullable) - origin of the sale data ("acris" or "dof_rolling")

  2. Notes
    - Provides richer sale information alongside existing last_sale_date
    - Source field lets users know whether the date came from ACRIS (near-real-time) or DOF Rolling Sales
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'discovery_cache' AND column_name = 'last_sale_price'
  ) THEN
    ALTER TABLE discovery_cache ADD COLUMN last_sale_price numeric;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'discovery_cache' AND column_name = 'last_sale_source'
  ) THEN
    ALTER TABLE discovery_cache ADD COLUMN last_sale_source text;
  END IF;
END $$;