/*
  # Fix RLS policies for search_history and discovery_search_history

  1. Problem
    - Existing SELECT/UPDATE/DELETE policies use current_setting('request.headers')::json->>'x-session-id'
    - The Supabase client was not sending the x-session-id header, causing all reads to return 0 rows
    - This made the Recent Searches panel invisible

  2. Fix
    - Drop existing broken policies
    - Recreate them with the same session_id header check
    - The client now sends x-session-id as a global header on every request
    - Policies match session_id against the header value so users only see their own history

  3. Security
    - INSERT still allows any session to insert (anonymous, no auth required)
    - SELECT/UPDATE/DELETE restricted to rows matching the caller's session_id header
    - service_role retains full access
*/

-- search_history: drop and recreate SELECT, UPDATE, DELETE policies
DROP POLICY IF EXISTS "Users can read own session history" ON search_history;
DROP POLICY IF EXISTS "Users can update own session history" ON search_history;
DROP POLICY IF EXISTS "Users can delete own session history" ON search_history;

CREATE POLICY "Users can read own session history"
  ON search_history FOR SELECT
  TO anon, authenticated
  USING (
    session_id = coalesce(
      current_setting('request.headers', true)::json->>'x-session-id',
      ''
    )
  );

CREATE POLICY "Users can update own session history"
  ON search_history FOR UPDATE
  TO anon, authenticated
  USING (
    session_id = coalesce(
      current_setting('request.headers', true)::json->>'x-session-id',
      ''
    )
  )
  WITH CHECK (
    session_id = coalesce(
      current_setting('request.headers', true)::json->>'x-session-id',
      ''
    )
  );

CREATE POLICY "Users can delete own session history"
  ON search_history FOR DELETE
  TO anon, authenticated
  USING (
    session_id = coalesce(
      current_setting('request.headers', true)::json->>'x-session-id',
      ''
    )
  );

-- discovery_search_history: drop and recreate SELECT, UPDATE, DELETE policies
DROP POLICY IF EXISTS "Users can read own discovery session history" ON discovery_search_history;
DROP POLICY IF EXISTS "Users can update own discovery session history" ON discovery_search_history;
DROP POLICY IF EXISTS "Users can delete own discovery session history" ON discovery_search_history;

CREATE POLICY "Users can read own discovery session history"
  ON discovery_search_history FOR SELECT
  TO anon, authenticated
  USING (
    session_id = coalesce(
      current_setting('request.headers', true)::json->>'x-session-id',
      ''
    )
  );

CREATE POLICY "Users can update own discovery session history"
  ON discovery_search_history FOR UPDATE
  TO anon, authenticated
  USING (
    session_id = coalesce(
      current_setting('request.headers', true)::json->>'x-session-id',
      ''
    )
  )
  WITH CHECK (
    session_id = coalesce(
      current_setting('request.headers', true)::json->>'x-session-id',
      ''
    )
  );

CREATE POLICY "Users can delete own discovery session history"
  ON discovery_search_history FOR DELETE
  TO anon, authenticated
  USING (
    session_id = coalesce(
      current_setting('request.headers', true)::json->>'x-session-id',
      ''
    )
  );