/*
  # Create DOB NOW owner contacts table

  1. New Tables
    - `dobnow_owner_contacts`
      - `id` (uuid, primary key) - unique row identifier
      - `bbl` (text, not null) - property BBL
      - `job_number` (text, not null) - DOB NOW job filing number
      - `owner_type` (text) - Individual or Corporation
      - `first_name` (text) - owner first name
      - `middle_initial` (text) - owner middle initial
      - `last_name` (text) - owner last name
      - `business_name` (text) - owner business name
      - `title` (text) - owner title
      - `email` (text) - owner email
      - `phone` (text) - owner phone (digits only)
      - `address_line1` (text) - owner street address
      - `city` (text) - owner city
      - `state` (text) - owner state
      - `zip` (text) - owner zip code
      - `source` (text, not null) - either dobnow_payload or dobnow_manual_import
      - `evidence_snippet` (text) - raw pasted text snippet for provenance
      - `created_at` (timestamptz) - when the record was created

  2. Security
    - Enable RLS on `dobnow_owner_contacts` table
    - Add policy for anon users to SELECT (read contacts for display)
    - Add policy for anon users to INSERT (save manual imports from the UI)
    - Add policy for anon users to UPDATE (allow corrections)

  3. Notes
    - Unique constraint on (bbl, job_number) so only one owner contact per job per property
    - Index on bbl for fast lookups during analysis
*/

CREATE TABLE IF NOT EXISTS dobnow_owner_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bbl text NOT NULL,
  job_number text NOT NULL,
  owner_type text DEFAULT '',
  first_name text DEFAULT '',
  middle_initial text DEFAULT '',
  last_name text DEFAULT '',
  business_name text DEFAULT '',
  title text DEFAULT '',
  email text DEFAULT '',
  phone text DEFAULT '',
  address_line1 text DEFAULT '',
  city text DEFAULT '',
  state text DEFAULT '',
  zip text DEFAULT '',
  source text NOT NULL DEFAULT 'dobnow_manual_import',
  evidence_snippet text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dobnow_owner_contacts_bbl_job
  ON dobnow_owner_contacts (bbl, job_number);

CREATE INDEX IF NOT EXISTS idx_dobnow_owner_contacts_bbl
  ON dobnow_owner_contacts (bbl);

ALTER TABLE dobnow_owner_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon users can read owner contacts"
  ON dobnow_owner_contacts
  FOR SELECT
  TO anon
  USING (bbl IS NOT NULL);

CREATE POLICY "Anon users can insert owner contacts"
  ON dobnow_owner_contacts
  FOR INSERT
  TO anon
  WITH CHECK (bbl IS NOT NULL AND job_number IS NOT NULL);

CREATE POLICY "Anon users can update owner contacts"
  ON dobnow_owner_contacts
  FOR UPDATE
  TO anon
  USING (bbl IS NOT NULL)
  WITH CHECK (bbl IS NOT NULL AND job_number IS NOT NULL);
