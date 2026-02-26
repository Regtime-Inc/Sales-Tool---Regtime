/*
  # Add manual overrides to PDF uploads

  1. Modified Tables
    - `pdf_uploads`
      - `manual_overrides` (jsonb) - Stores user-provided manual overrides for extraction values
      - `validation_gates` (jsonb) - Stores validation gate results from extraction pipeline

  2. Notes
    - manual_overrides stores key-value pairs like { totalUnits: 14, far: 6.5 }
    - validation_gates stores the full gate results for audit trail
    - Both columns are nullable and default to null
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pdf_uploads' AND column_name = 'manual_overrides'
  ) THEN
    ALTER TABLE pdf_uploads ADD COLUMN manual_overrides jsonb DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pdf_uploads' AND column_name = 'validation_gates'
  ) THEN
    ALTER TABLE pdf_uploads ADD COLUMN validation_gates jsonb DEFAULT NULL;
  END IF;
END $$;
