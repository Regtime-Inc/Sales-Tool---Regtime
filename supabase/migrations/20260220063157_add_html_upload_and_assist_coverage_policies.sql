/*
  # Add RLS policies for HTML upload source and ACRIS Assist coverage tracking

  1. Modified Tables
    - `acris_documents` - extend anon write policies to include 'html_upload' source
    - `acris_data_coverage` - add anon write policies for 'acris_assist' source

  2. Security
    - Anon INSERT on acris_documents allowed for source = 'html_upload'
    - Anon UPDATE on acris_documents allowed for source = 'html_upload'
    - Anon INSERT on acris_data_coverage allowed for source = 'acris_assist'
    - Anon UPDATE on acris_data_coverage allowed for source = 'acris_assist'
    - These policies only allow writing data from the ACRIS Assist HTML upload tool
    - Existing policies for other sources are unaffected

  3. Important Notes
    - The anon role still cannot DELETE from any of these tables
    - Coverage tracking enables the frontend to show data freshness for Assist-ingested data
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'acris_documents' AND policyname = 'Anon can insert html_upload documents'
  ) THEN
    CREATE POLICY "Anon can insert html_upload documents"
      ON acris_documents
      FOR INSERT
      TO anon
      WITH CHECK (source = 'html_upload');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'acris_documents' AND policyname = 'Anon can update html_upload documents'
  ) THEN
    CREATE POLICY "Anon can update html_upload documents"
      ON acris_documents
      FOR UPDATE
      TO anon
      USING (source = 'html_upload')
      WITH CHECK (source = 'html_upload');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'acris_data_coverage' AND policyname = 'Anon can insert acris_assist coverage'
  ) THEN
    CREATE POLICY "Anon can insert acris_assist coverage"
      ON acris_data_coverage
      FOR INSERT
      TO anon
      WITH CHECK (source = 'acris_assist');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'acris_data_coverage' AND policyname = 'Anon can update acris_assist coverage'
  ) THEN
    CREATE POLICY "Anon can update acris_assist coverage"
      ON acris_data_coverage
      FOR UPDATE
      TO anon
      USING (source = 'acris_assist')
      WITH CHECK (source = 'acris_assist');
  END IF;
END $$;
