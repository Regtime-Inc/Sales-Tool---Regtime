/*
  # Widen ACRIS documents unique constraint to (document_id, bbl)

  A single ACRIS document can relate to multiple properties (BBLs).
  The previous unique constraint on document_id alone caused upsert
  failures when the same document appeared with different BBLs in a
  single batch ("ON CONFLICT DO UPDATE command cannot affect row a
  second time").

  1. Modified Constraints
    - Drop unique constraint on `document_id` alone
    - Add composite unique constraint on `(document_id, bbl)`
    - Replace unique CRFN index with composite `(crfn, bbl)` unique index
    - Add non-unique index on `document_id` for fast lookups

  2. Important Notes
    - No data is deleted or modified
    - Existing rows are unaffected since they already have unique (document_id, bbl) pairs
*/

-- Drop the old unique constraint on document_id alone
ALTER TABLE acris_documents DROP CONSTRAINT IF EXISTS acris_documents_document_id_key;

-- Add composite unique constraint on (document_id, bbl)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'acris_documents_document_id_bbl_key'
  ) THEN
    ALTER TABLE acris_documents
      ADD CONSTRAINT acris_documents_document_id_bbl_key UNIQUE (document_id, bbl);
  END IF;
END $$;

-- Add non-unique index on document_id for fast lookups
CREATE INDEX IF NOT EXISTS idx_acris_documents_document_id
  ON acris_documents (document_id);

-- Replace unique CRFN index with composite (crfn, bbl) unique index
DROP INDEX IF EXISTS idx_acris_documents_crfn;

CREATE UNIQUE INDEX IF NOT EXISTS idx_acris_documents_crfn_bbl
  ON acris_documents (crfn, bbl) WHERE crfn IS NOT NULL;
