/*
  # Create web enrichment cache table

  1. New Tables
    - `web_enrichment_cache`
      - `id` (uuid, primary key) - unique record identifier
      - `owner_name_key` (text, unique) - normalized owner name used as cache key
      - `owner_entity_id` (uuid, nullable, FK to owner_entities) - optional link to owner record
      - `results` (jsonb) - stores sources, candidates, and warnings from web enrichment
      - `created_at` (timestamptz) - when the cache entry was created
      - `expires_at` (timestamptz) - cache expiry, defaults to 7 days from creation

  2. Indexes
    - Unique index on `owner_name_key` for fast lookups
    - Index on `expires_at` for cache cleanup

  3. Security
    - Enable RLS on `web_enrichment_cache`
    - Anon users can SELECT cached results
    - Service role handles writes via edge functions
*/

CREATE TABLE IF NOT EXISTS web_enrichment_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_name_key text NOT NULL,
  owner_entity_id uuid REFERENCES owner_entities(id) ON DELETE SET NULL,
  results jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  CONSTRAINT web_enrichment_cache_name_key_unique UNIQUE (owner_name_key)
);

CREATE INDEX IF NOT EXISTS idx_web_enrichment_cache_expires
  ON web_enrichment_cache (expires_at);

ALTER TABLE web_enrichment_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon users can read web enrichment cache"
  ON web_enrichment_cache
  FOR SELECT
  TO anon
  USING (expires_at > now());

CREATE POLICY "Service role can manage web enrichment cache"
  ON web_enrichment_cache
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
