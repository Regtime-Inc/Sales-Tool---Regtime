/*
  # Add anon write policies for client-side ACRIS scraper

  The client-side browser scraper needs to upsert scraped documents directly
  from the frontend using the anon key. These policies allow the anon role
  to insert and update rows in the tables used by the scraper.

  1. Modified Tables
    - `acris_documents` - add INSERT and UPDATE policies for anon role
    - `acris_data_coverage` - add INSERT and UPDATE policies for anon role
    - `discovery_sales` - add INSERT policy for anon role (for backfill)

  2. Security
    - Anon INSERT on acris_documents restricted to source = 'acris_live'
    - Anon UPDATE on acris_documents restricted to source = 'acris_live'
    - Anon INSERT/UPDATE on acris_data_coverage restricted to source = 'acris_live'
    - Anon INSERT on discovery_sales restricted to source = 'acris_realtime'
    - These policies only allow writing data that came from browser-based scraping

  3. Important Notes
    - Existing service_role policies are unaffected
    - The anon role still cannot DELETE from any of these tables
    - The anon role cannot write socrata-sourced data
*/

-- acris_documents: allow anon to insert scraped docs
CREATE POLICY "Anon can insert client-scraped acris_documents"
  ON acris_documents
  FOR INSERT
  TO anon
  WITH CHECK (source = 'acris_live');

-- acris_documents: allow anon to update client-scraped docs (upsert needs this)
CREATE POLICY "Anon can update client-scraped acris_documents"
  ON acris_documents
  FOR UPDATE
  TO anon
  USING (source = 'acris_live')
  WITH CHECK (source = 'acris_live');

-- acris_documents: allow anon to read (may already exist for authenticated, add for anon)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'acris_documents' AND policyname = 'Anon users can read acris_documents'
  ) THEN
    CREATE POLICY "Anon users can read acris_documents"
      ON acris_documents
      FOR SELECT
      TO anon
      USING (true);
  END IF;
END $$;

-- acris_data_coverage: allow anon to insert/update for acris_live source
CREATE POLICY "Anon can insert client acris_data_coverage"
  ON acris_data_coverage
  FOR INSERT
  TO anon
  WITH CHECK (source = 'acris_live');

CREATE POLICY "Anon can update client acris_data_coverage"
  ON acris_data_coverage
  FOR UPDATE
  TO anon
  USING (source = 'acris_live')
  WITH CHECK (source = 'acris_live');

-- discovery_sales: allow anon to insert backfilled sales from scraper
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'discovery_sales' AND policyname = 'Anon can insert acris_realtime sales'
  ) THEN
    CREATE POLICY "Anon can insert acris_realtime sales"
      ON discovery_sales
      FOR INSERT
      TO anon
      WITH CHECK (source = 'acris_realtime');
  END IF;
END $$;
