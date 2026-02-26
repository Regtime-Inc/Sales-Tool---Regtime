/*
  # Create discovery cache table

  1. New Tables
    - `discovery_cache`
      - `id` (uuid, primary key)
      - `bbl` (text, unique) - 10-digit borough-block-lot
      - `address` (text) - display address
      - `borough` (text) - borough code 1-5
      - `zone_dist` (text) - primary zoning district
      - `lot_area` (numeric) - lot area in SF
      - `bldg_area` (numeric) - existing building area in SF
      - `resid_far` (numeric) - max residential FAR
      - `built_far` (numeric) - current built FAR
      - `max_buildable_sf` (numeric) - maximum buildable SF
      - `slack_sf` (numeric) - buildable slack
      - `underbuilt_ratio` (numeric) - builtFAR / residFAR
      - `land_use` (text) - land use code
      - `bldg_class` (text) - building class
      - `year_built` (integer) - year built
      - `units_res` (integer) - existing residential units
      - `owner_name` (text)
      - `score` (numeric) - development potential score
      - `cached_at` (timestamptz) - when this row was cached
  2. Indexes
    - borough, underbuilt_ratio, slack_sf for filtered queries
  3. Security
    - Enable RLS, service role access for edge function writes
    - Authenticated read access for frontend queries
*/

CREATE TABLE IF NOT EXISTS discovery_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bbl text UNIQUE NOT NULL,
  address text NOT NULL DEFAULT '',
  borough text NOT NULL DEFAULT '',
  zone_dist text NOT NULL DEFAULT '',
  lot_area numeric NOT NULL DEFAULT 0,
  bldg_area numeric NOT NULL DEFAULT 0,
  resid_far numeric NOT NULL DEFAULT 0,
  built_far numeric NOT NULL DEFAULT 0,
  max_buildable_sf numeric NOT NULL DEFAULT 0,
  slack_sf numeric NOT NULL DEFAULT 0,
  underbuilt_ratio numeric NOT NULL DEFAULT 0,
  land_use text NOT NULL DEFAULT '',
  bldg_class text NOT NULL DEFAULT '',
  year_built integer NOT NULL DEFAULT 0,
  units_res integer NOT NULL DEFAULT 0,
  owner_name text NOT NULL DEFAULT '',
  score numeric NOT NULL DEFAULT 0,
  cached_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE discovery_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage discovery cache"
  ON discovery_cache
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can read discovery cache"
  ON discovery_cache
  FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS idx_discovery_borough ON discovery_cache (borough);
CREATE INDEX IF NOT EXISTS idx_discovery_underbuilt ON discovery_cache (underbuilt_ratio DESC);
CREATE INDEX IF NOT EXISTS idx_discovery_slack ON discovery_cache (slack_sf DESC);
CREATE INDEX IF NOT EXISTS idx_discovery_score ON discovery_cache (score DESC);
