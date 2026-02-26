/*
  # Add applied_data_points column to pdf_uploads

  1. Modified Tables
    - `pdf_uploads`
      - Added `applied_data_points` (jsonb) - Stores the user's per-field toggle and override state from the AI-verified data points panel. Each key is a field name (e.g. "lotArea", "far", "floors") and the value is the applied override value.

  2. Notes
    - Non-destructive: adds a new nullable column only
    - Used by the frontend to persist which extracted data points the user has selected to apply to the feasibility model
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pdf_uploads' AND column_name = 'applied_data_points'
  ) THEN
    ALTER TABLE pdf_uploads ADD COLUMN applied_data_points jsonb;
  END IF;
END $$;
