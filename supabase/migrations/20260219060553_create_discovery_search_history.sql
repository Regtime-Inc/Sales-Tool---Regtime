/*
  # Create discovery_search_history table

  1. New Tables
    - `discovery_search_history`
      - `id` (uuid, primary key)
      - `session_id` (text) - Browser session identifier matching analysis search history
      - `borough` (text) - Borough code searched (1-5)
      - `borough_name` (text) - Human-readable borough name
      - `zone_prefix` (text) - Zone filter applied, if any
      - `min_slack_sf` (numeric) - Minimum slack SF filter
      - `min_underbuilt_ratio` (numeric) - Minimum underbuilt ratio filter
      - `exclude_condos` (boolean) - Whether condos were excluded
      - `max_sale_recency_years` (numeric) - Sale recency filter in years
      - `result_count` (integer) - Number of candidates returned
      - `top_score` (numeric) - Highest score from results
      - `searched_at` (timestamptz) - When the search was performed

  2. Security
    - Enable RLS on `discovery_search_history` table
    - Allow anonymous insert/select/update/delete scoped to session_id
    - Service role has full access

  3. Notes
    - Unique on (session_id, borough, zone_prefix) so re-runs update the timestamp
    - Indexed on session_id + searched_at for fast recent lookups
*/

CREATE TABLE IF NOT EXISTS discovery_search_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL DEFAULT '',
  borough text NOT NULL DEFAULT '1',
  borough_name text NOT NULL DEFAULT '',
  zone_prefix text NOT NULL DEFAULT '',
  min_slack_sf numeric NOT NULL DEFAULT 0,
  min_underbuilt_ratio numeric NOT NULL DEFAULT 0,
  exclude_condos boolean NOT NULL DEFAULT true,
  max_sale_recency_years numeric NOT NULL DEFAULT 0,
  result_count integer NOT NULL DEFAULT 0,
  top_score numeric NOT NULL DEFAULT 0,
  searched_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_discovery_search_session_boro_zone UNIQUE (session_id, borough, zone_prefix)
);

CREATE INDEX IF NOT EXISTS idx_discovery_search_history_session_searched
  ON discovery_search_history (session_id, searched_at DESC);

ALTER TABLE discovery_search_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert discovery search history"
  ON discovery_search_history FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Users can read own discovery session history"
  ON discovery_search_history FOR SELECT
  TO anon, authenticated
  USING (session_id = current_setting('request.headers', true)::json->>'x-session-id' OR session_id = '');

CREATE POLICY "Users can update own discovery session history"
  ON discovery_search_history FOR UPDATE
  TO anon, authenticated
  USING (session_id = current_setting('request.headers', true)::json->>'x-session-id' OR session_id = '')
  WITH CHECK (session_id = current_setting('request.headers', true)::json->>'x-session-id' OR session_id = '');

CREATE POLICY "Users can delete own discovery session history"
  ON discovery_search_history FOR DELETE
  TO anon, authenticated
  USING (session_id = current_setting('request.headers', true)::json->>'x-session-id' OR session_id = '');

CREATE POLICY "Service role full access to discovery search history"
  ON discovery_search_history FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
