/*
  # Create ACRIS Data Coverage Tracking Table

  1. New Tables
    - `acris_data_coverage`
      - `id` (uuid, primary key)
      - `source` (text) - 'socrata' or 'acris_live'
      - `borough` (text) - borough code '1'-'5' or 'all'
      - `date_from` (date) - earliest date covered by this source
      - `date_to` (date) - latest date covered by this source
      - `doc_count` (integer) - number of documents in this range
      - `last_checked_at` (timestamptz) - when this coverage was last verified
      - `last_ingested_at` (timestamptz) - when data was last successfully ingested
      - `metadata_json` (jsonb) - additional context (Socrata dataset update timestamp, etc.)

  2. Security
    - Enable RLS on the table
    - Authenticated users can read coverage data
    - Service role can manage coverage data

  3. Important Notes
    - This table is updated by the acris-sync edge function after each ingestion run
    - One row per (source, borough) combination
    - Provides the frontend with accurate data freshness information
*/

CREATE TABLE IF NOT EXISTS acris_data_coverage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL DEFAULT 'socrata',
  borough text NOT NULL DEFAULT 'all',
  date_from date,
  date_to date,
  doc_count integer NOT NULL DEFAULT 0,
  last_checked_at timestamptz NOT NULL DEFAULT now(),
  last_ingested_at timestamptz,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT acris_data_coverage_source_borough_key UNIQUE (source, borough)
);

CREATE INDEX IF NOT EXISTS idx_acris_data_coverage_source
  ON acris_data_coverage (source);

ALTER TABLE acris_data_coverage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read acris_data_coverage"
  ON acris_data_coverage
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Anon users can read acris_data_coverage"
  ON acris_data_coverage
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Service role can insert acris_data_coverage"
  ON acris_data_coverage
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update acris_data_coverage"
  ON acris_data_coverage
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role can delete acris_data_coverage"
  ON acris_data_coverage
  FOR DELETE
  TO service_role
  USING (true);
