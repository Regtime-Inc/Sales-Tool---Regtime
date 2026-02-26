/*
  # Create stakeholder cache table

  1. New Tables
    - `stakeholder_cache`
      - `id` (uuid, primary key)
      - `bbl` (text, indexed) - NYC Borough-Block-Lot identifier
      - `stakeholders` (jsonb, NOT NULL) - Full array of resolved stakeholder records
      - `created_at` (timestamptz) - When the record was created
      - `expires_at` (timestamptz) - When this cache entry expires (default 2h, shorter TTL than analysis cache because DOB/HPD contact data changes more frequently)

  2. Security
    - Enable RLS on `stakeholder_cache` table
    - No public access policies (only service role can access via edge functions)

  3. Notes
    - This table is used internally by the analyze edge function to cache stakeholder resolution results
    - Cache TTL is 2 hours by default (stakeholder data refreshes more often than zoning/sale data)
    - Indexed on BBL for fast lookups and expires_at for cache eviction
*/

CREATE TABLE IF NOT EXISTS stakeholder_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bbl text NOT NULL,
  stakeholders jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT (now() + interval '2 hours')
);

CREATE INDEX IF NOT EXISTS idx_stakeholder_cache_bbl ON stakeholder_cache(bbl);
CREATE INDEX IF NOT EXISTS idx_stakeholder_cache_expires ON stakeholder_cache(expires_at);

ALTER TABLE stakeholder_cache ENABLE ROW LEVEL SECURITY;
