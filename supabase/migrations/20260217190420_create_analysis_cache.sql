/*
  # Create analysis cache table

  1. New Tables
    - `analysis_cache`
      - `id` (uuid, primary key)
      - `bbl` (text, indexed) - NYC Borough-Block-Lot identifier
      - `result` (jsonb) - Full analysis result JSON
      - `created_at` (timestamptz) - When the analysis was performed
      - `expires_at` (timestamptz) - When this cache entry expires (default 24h)

  2. Security
    - Enable RLS on `analysis_cache` table
    - No public access policies (only service role can access via edge functions)

  3. Notes
    - This table is used internally by the analyze edge function
    - Cache TTL is 24 hours by default
    - Indexed on BBL for fast lookups
*/

CREATE TABLE IF NOT EXISTS analysis_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bbl text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT (now() + interval '24 hours')
);

CREATE INDEX IF NOT EXISTS idx_analysis_cache_bbl ON analysis_cache(bbl);
CREATE INDEX IF NOT EXISTS idx_analysis_cache_expires ON analysis_cache(expires_at);

ALTER TABLE analysis_cache ENABLE ROW LEVEL SECURITY;
