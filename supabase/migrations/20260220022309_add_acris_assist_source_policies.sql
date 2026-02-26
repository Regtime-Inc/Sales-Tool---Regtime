/*
  # Add RLS policies for ACRIS Assist manual ingestion sources

  1. Modified Tables
    - `acris_documents` - add INSERT and UPDATE policies for anon role with sources 'manual_paste' and 'screen_capture'
    - `discovery_sales` - add INSERT policy for anon role with source 'acris_assist'

  2. Security
    - Anon INSERT on acris_documents allowed for source IN ('manual_paste', 'screen_capture')
    - Anon UPDATE on acris_documents allowed for source IN ('manual_paste', 'screen_capture')
    - Anon INSERT on discovery_sales allowed for source = 'acris_assist'
    - These policies only allow writing data from the human-in-the-loop ACRIS Assist tool
    - Existing policies for 'acris_live' and service_role are unaffected

  3. Important Notes
    - The anon role still cannot DELETE from any of these tables
    - The anon role cannot write socrata-sourced data
*/

-- acris_documents: allow anon to insert manual_paste and screen_capture docs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'acris_documents' AND policyname = 'Anon can insert acris_assist documents'
  ) THEN
    CREATE POLICY "Anon can insert acris_assist documents"
      ON acris_documents
      FOR INSERT
      TO anon
      WITH CHECK (source IN ('manual_paste', 'screen_capture'));
  END IF;
END $$;

-- acris_documents: allow anon to update manual_paste and screen_capture docs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'acris_documents' AND policyname = 'Anon can update acris_assist documents'
  ) THEN
    CREATE POLICY "Anon can update acris_assist documents"
      ON acris_documents
      FOR UPDATE
      TO anon
      USING (source IN ('manual_paste', 'screen_capture'))
      WITH CHECK (source IN ('manual_paste', 'screen_capture'));
  END IF;
END $$;

-- discovery_sales: allow anon to insert backfilled sales from ACRIS Assist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'discovery_sales' AND policyname = 'Anon can insert acris_assist sales'
  ) THEN
    CREATE POLICY "Anon can insert acris_assist sales"
      ON discovery_sales
      FOR INSERT
      TO anon
      WITH CHECK (source = 'acris_assist');
  END IF;
END $$;
