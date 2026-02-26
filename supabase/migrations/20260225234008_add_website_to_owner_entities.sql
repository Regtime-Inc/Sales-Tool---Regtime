/*
  # Add website column to owner_entities

  1. Modified Tables
    - `owner_entities`
      - `website` (text, nullable) - Owner/org website URL or domain, used for Hunter.io email enrichment

  2. Notes
    - Nullable since most owners won't have a website initially
    - Can be populated manually via the UI or discovered by SerpApi knowledge graph
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'owner_entities' AND column_name = 'website'
  ) THEN
    ALTER TABLE owner_entities ADD COLUMN website text;
  END IF;
END $$;
