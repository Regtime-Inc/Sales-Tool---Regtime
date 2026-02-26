/*
  # Add extended columns to acris_documents for full ACRIS screenshot extraction

  1. Modified Tables
    - `acris_documents`
      - `doc_date` (date, nullable) - document execution date (separate from recorded_date)
      - `reel_pg_file` (text, nullable) - legacy Reel/Page/File reference number
      - `partial_lot` (text, nullable) - lot partial indicator (e.g., "ENTIRE LOT")
      - `pages` (integer, nullable) - number of pages in the document
      - `party3` (text, nullable) - third party / other party name
      - `corrected` (boolean, default false) - whether document has correction flag

  2. Important Notes
    - All new columns are nullable to avoid breaking existing rows
    - No existing data is modified
    - These columns support full-fidelity extraction from ACRIS screenshot images
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'acris_documents' AND column_name = 'doc_date'
  ) THEN
    ALTER TABLE acris_documents ADD COLUMN doc_date date;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'acris_documents' AND column_name = 'reel_pg_file'
  ) THEN
    ALTER TABLE acris_documents ADD COLUMN reel_pg_file text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'acris_documents' AND column_name = 'partial_lot'
  ) THEN
    ALTER TABLE acris_documents ADD COLUMN partial_lot text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'acris_documents' AND column_name = 'pages'
  ) THEN
    ALTER TABLE acris_documents ADD COLUMN pages integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'acris_documents' AND column_name = 'party3'
  ) THEN
    ALTER TABLE acris_documents ADD COLUMN party3 text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'acris_documents' AND column_name = 'corrected'
  ) THEN
    ALTER TABLE acris_documents ADD COLUMN corrected boolean NOT NULL DEFAULT false;
  END IF;
END $$;