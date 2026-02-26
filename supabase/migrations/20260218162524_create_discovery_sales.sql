/*
  # Create discovery_sales table

  1. New Tables
    - `discovery_sales`
      - `id` (uuid, primary key)
      - `bbl` (text) - 10-digit borough-block-lot
      - `sale_date` (date) - date of the transaction
      - `sale_price` (numeric) - transaction amount in dollars
      - `doc_type` (text) - deed type code (DEED, DEEDO, ADED, etc.)
      - `source` (text) - data source identifier ("acris" or "dof_rolling")
      - `document_id` (text, nullable) - ACRIS document ID when available
      - `cached_at` (timestamptz) - when this row was fetched

  2. Indexes
    - Composite unique on (bbl, sale_date, source) to prevent duplicates
    - bbl for per-property lookups
    - sale_date DESC for recency filtering
    - borough prefix (first char of bbl) for borough-wide cache checks

  3. Security
    - Enable RLS
    - Service role full access for edge function writes
    - Authenticated read access for frontend queries

  4. Notes
    - Separated from discovery_cache so historical sales (up to 10 years)
      do not need re-fetching on every 24-hour property cache refresh
    - Sales cache has its own TTL managed by the edge function (72 hours)
*/

CREATE TABLE IF NOT EXISTS discovery_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bbl text NOT NULL,
  sale_date date NOT NULL,
  sale_price numeric NOT NULL DEFAULT 0,
  doc_type text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT '',
  document_id text,
  cached_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bbl, sale_date, source)
);

ALTER TABLE discovery_sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage discovery sales"
  ON discovery_sales
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can read discovery sales"
  ON discovery_sales
  FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS idx_disc_sales_bbl ON discovery_sales (bbl);
CREATE INDEX IF NOT EXISTS idx_disc_sales_date ON discovery_sales (sale_date DESC);
CREATE INDEX IF NOT EXISTS idx_disc_sales_borough ON discovery_sales ((substring(bbl from 1 for 1)));
CREATE INDEX IF NOT EXISTS idx_disc_sales_cached ON discovery_sales (cached_at);