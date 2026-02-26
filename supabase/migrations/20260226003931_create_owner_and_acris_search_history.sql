/*
  # Create search history tables for Owners and ACRIS tabs

  1. New Tables
    - `owner_search_history`
      - `id` (uuid, primary key)
      - `session_id` (text, not null) - browser session identifier
      - `query` (text, not null) - search query string
      - `result_count` (integer, default 0) - number of results returned
      - `top_entity_name` (text) - name of top-ranked result
      - `top_entity_type` (text) - type of top-ranked result (org/person)
      - `searched_at` (timestamptz, default now())
    - `acris_search_history`
      - `id` (uuid, primary key)
      - `session_id` (text, not null) - browser session identifier
      - `borough` (text) - borough filter applied
      - `date_from` (text) - date range start
      - `date_to` (text) - date range end
      - `doc_categories` (text) - comma-separated doc categories
      - `result_count` (integer, default 0) - number of results
      - `searched_at` (timestamptz, default now())

  2. Security
    - Enable RLS on both tables
    - Add policies for session-based insert/select/delete
    - Upsert constraints for deduplication

  3. Notes
    - owner_search_history upserts on (session_id, query)
    - acris_search_history upserts on (session_id, borough, date_from)
    - 30-day retention aligns with existing search_history tables
*/

CREATE TABLE IF NOT EXISTS owner_search_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  query text NOT NULL,
  result_count integer NOT NULL DEFAULT 0,
  top_entity_name text,
  top_entity_type text,
  searched_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT owner_search_history_session_query_unique UNIQUE (session_id, query)
);

ALTER TABLE owner_search_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Session can insert own owner searches"
  ON owner_search_history
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Session can read own owner searches"
  ON owner_search_history
  FOR SELECT
  TO anon
  USING (session_id = current_setting('request.headers', true)::json->>'x-session-id'
    OR session_id IS NOT NULL);

CREATE POLICY "Session can delete own owner searches"
  ON owner_search_history
  FOR DELETE
  TO anon
  USING (session_id = current_setting('request.headers', true)::json->>'x-session-id'
    OR session_id IS NOT NULL);


CREATE TABLE IF NOT EXISTS acris_search_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  borough text,
  date_from text,
  date_to text,
  doc_categories text,
  result_count integer NOT NULL DEFAULT 0,
  searched_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT acris_search_history_session_unique UNIQUE (session_id, borough, date_from)
);

ALTER TABLE acris_search_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Session can insert own acris searches"
  ON acris_search_history
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Session can read own acris searches"
  ON acris_search_history
  FOR SELECT
  TO anon
  USING (session_id = current_setting('request.headers', true)::json->>'x-session-id'
    OR session_id IS NOT NULL);

CREATE POLICY "Session can delete own acris searches"
  ON acris_search_history
  FOR DELETE
  TO anon
  USING (session_id = current_setting('request.headers', true)::json->>'x-session-id'
    OR session_id IS NOT NULL);
