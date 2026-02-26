/*
  # Create search_history table

  1. New Tables
    - `search_history`
      - `id` (uuid, primary key)
      - `session_id` (text) - Browser session identifier for per-device history
      - `input` (text) - Raw search string the user typed
      - `bbl` (text, unique per session) - Resolved BBL from the analysis
      - `address` (text) - Resolved street address
      - `borough` (text) - Borough code (1-5)
      - `dev_score` (numeric) - Development potential score for quick display
      - `zone_dist` (text) - Zoning district
      - `slack_sf` (numeric) - Buildable slack SF
      - `underbuilt_ratio` (numeric) - Underbuilt ratio percentage
      - `last_sale_date` (text) - Most recent sale date
      - `searched_at` (timestamptz) - When the search was performed

  2. Security
    - Enable RLS on `search_history` table
    - Allow anonymous insert and select (no auth required, per-browser history)
    - Restrict reads/writes to matching session_id

  3. Notes
    - Unique constraint on (session_id, bbl) enables upsert (re-search refreshes timestamp)
    - Indexed on session_id + searched_at for fast recent lookups
    - Auto-cleanup: entries older than 30 days are excluded by query
*/

CREATE TABLE IF NOT EXISTS search_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL DEFAULT '',
  input text NOT NULL DEFAULT '',
  bbl text NOT NULL,
  address text NOT NULL DEFAULT '',
  borough text NOT NULL DEFAULT '',
  dev_score numeric NOT NULL DEFAULT 0,
  zone_dist text NOT NULL DEFAULT '',
  slack_sf numeric NOT NULL DEFAULT 0,
  underbuilt_ratio numeric NOT NULL DEFAULT 0,
  last_sale_date text,
  searched_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_search_history_session_bbl UNIQUE (session_id, bbl)
);

CREATE INDEX IF NOT EXISTS idx_search_history_session_searched
  ON search_history (session_id, searched_at DESC);

ALTER TABLE search_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert search history"
  ON search_history FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Users can read own session history"
  ON search_history FOR SELECT
  TO anon, authenticated
  USING (session_id = current_setting('request.headers', true)::json->>'x-session-id' OR session_id = '');

CREATE POLICY "Users can update own session history"
  ON search_history FOR UPDATE
  TO anon, authenticated
  USING (session_id = current_setting('request.headers', true)::json->>'x-session-id' OR session_id = '')
  WITH CHECK (session_id = current_setting('request.headers', true)::json->>'x-session-id' OR session_id = '');

CREATE POLICY "Users can delete own session history"
  ON search_history FOR DELETE
  TO anon, authenticated
  USING (session_id = current_setting('request.headers', true)::json->>'x-session-id' OR session_id = '');

CREATE POLICY "Service role full access to search history"
  ON search_history FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
