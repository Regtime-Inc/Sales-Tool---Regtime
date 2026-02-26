/*
  # Add anon SELECT and UPDATE policies on discovery_sales

  The `discovery_sales` table already has INSERT policies for the `anon` role
  (one for `acris_assist`, one for `acris_realtime`), but upsert operations
  also require SELECT (to evaluate conflict checks) and UPDATE (to modify
  existing rows on conflict). This migration adds the missing policies.

  1. Security Changes
    - Add SELECT policy for anon where source = 'acris_assist'
    - Add SELECT policy for anon where source = 'acris_realtime'
    - Add UPDATE policy for anon where source = 'acris_assist'
    - Add UPDATE policy for anon where source = 'acris_realtime'

  2. Notes
    - Mirrors the existing INSERT policy pattern (separate per-source policies)
    - Scoped narrowly so anon can only read/update rows it created
*/

CREATE POLICY "Anon can read acris_assist sales"
  ON discovery_sales
  FOR SELECT
  TO anon
  USING (source = 'acris_assist');

CREATE POLICY "Anon can read acris_realtime sales"
  ON discovery_sales
  FOR SELECT
  TO anon
  USING (source = 'acris_realtime');

CREATE POLICY "Anon can update acris_assist sales"
  ON discovery_sales
  FOR UPDATE
  TO anon
  USING (source = 'acris_assist')
  WITH CHECK (source = 'acris_assist');

CREATE POLICY "Anon can update acris_realtime sales"
  ON discovery_sales
  FOR UPDATE
  TO anon
  USING (source = 'acris_realtime')
  WITH CHECK (source = 'acris_realtime');
