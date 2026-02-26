/*
  # Add UPDATE and DELETE RLS policies for PDF sheet extractions

  1. Security Changes
    - Add UPDATE policy so cached extractions can be refreshed when a user
      re-uploads an edited PDF (forceRefresh reprocessing)
    - Add DELETE policy so stale cache entries can be removed by authenticated users

  2. Important Notes
    - Both policies restrict access to authenticated users only
    - This enables the forceRefresh workflow where an existing cached extraction
      is replaced with a fresh one after reprocessing
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'pdf_sheet_extractions'
    AND policyname = 'Authenticated users can update extractions'
  ) THEN
    CREATE POLICY "Authenticated users can update extractions"
      ON pdf_sheet_extractions
      FOR UPDATE
      TO authenticated
      USING (auth.uid() IS NOT NULL)
      WITH CHECK (auth.uid() IS NOT NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'pdf_sheet_extractions'
    AND policyname = 'Authenticated users can delete extractions'
  ) THEN
    CREATE POLICY "Authenticated users can delete extractions"
      ON pdf_sheet_extractions
      FOR DELETE
      TO authenticated
      USING (auth.uid() IS NOT NULL);
  END IF;
END $$;
