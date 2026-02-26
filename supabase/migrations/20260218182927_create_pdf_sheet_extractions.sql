/*
  # Create PDF sheet extractions cache table

  1. New Tables
    - `pdf_sheet_extractions`
      - `id` (uuid, primary key)
      - `file_hash` (text, unique) - SHA-256 of uploaded PDF for dedup
      - `sheet_index` (jsonb) - full SheetIndex object with page classifications
      - `recipe_results` (jsonb) - array of RecipeResult objects from extraction
      - `normalized_extract` (jsonb) - final NormalizedPlanExtract after LLM/local normalization
      - `validation_result` (jsonb) - cross-validation output with warnings
      - `ocr_provider` (text) - which OCR provider was used
      - `created_at` (timestamptz) - when extraction was performed
      - `expires_at` (timestamptz) - cache expiry, defaults to 30 days

  2. Security
    - Enable RLS on `pdf_sheet_extractions` table
    - Add policy for authenticated users to read their own cached extractions
    - Add policy for authenticated users to insert new extractions
*/

CREATE TABLE IF NOT EXISTS pdf_sheet_extractions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_hash text NOT NULL,
  sheet_index jsonb NOT NULL DEFAULT '{}'::jsonb,
  recipe_results jsonb NOT NULL DEFAULT '[]'::jsonb,
  normalized_extract jsonb NOT NULL DEFAULT '{}'::jsonb,
  validation_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  ocr_provider text NOT NULL DEFAULT 'none',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pdf_sheet_extractions_file_hash
  ON pdf_sheet_extractions (file_hash);

CREATE INDEX IF NOT EXISTS idx_pdf_sheet_extractions_expires
  ON pdf_sheet_extractions (expires_at);

ALTER TABLE pdf_sheet_extractions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read cached extractions"
  ON pdf_sheet_extractions
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert extractions"
  ON pdf_sheet_extractions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
