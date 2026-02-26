/*
  # Create ACRIS Documents and Sync Log tables

  1. New Tables
    - `acris_documents`
      - `id` (uuid, primary key)
      - `document_id` (text, unique) - ACRIS document identifier
      - `crfn` (text, nullable, unique where not null) - City Register File Number
      - `recorded_date` (date) - when the document was recorded in ACRIS
      - `doc_type` (text) - document type code (DEED, MTGE, RCOV, etc.)
      - `borough` (text) - borough code 1-5
      - `block` (text) - tax block number
      - `lot` (text) - tax lot number
      - `bbl` (text) - computed 10-digit BBL
      - `party1` (text, nullable) - grantor / seller / mortgagor
      - `party2` (text, nullable) - grantee / buyer / mortgagee
      - `amount` (numeric, nullable) - document amount
      - `source` (text) - ingestion source: socrata, sds, scrape, opendata
      - `ingested_at` (timestamptz) - when this record was ingested
      - `raw_payload_json` (jsonb) - full raw response for audit

    - `acris_sync_log`
      - `id` (uuid, primary key)
      - `started_at` (timestamptz) - sync run start
      - `completed_at` (timestamptz, nullable) - sync run end
      - `status` (text) - running, success, partial, failed
      - `source` (text) - which ingestion path was used
      - `docs_ingested` (integer) - count of new/updated docs
      - `docs_skipped` (integer) - count of duplicates skipped
      - `error_message` (text, nullable) - error details if failed
      - `run_metadata_json` (jsonb) - additional run context

  2. Indexes
    - `acris_documents`: unique on document_id, unique on crfn (where not null),
      indexes on bbl, recorded_date DESC, borough, doc_type, and
      composite (borough, recorded_date DESC) for the recent-docs query

  3. Security
    - Enable RLS on both tables
    - Service role has full access (via default Supabase behavior)
    - Anon/authenticated users can SELECT acris_documents (read-only)
    - Only service role can write to acris_sync_log
*/

-- acris_documents table
CREATE TABLE IF NOT EXISTS acris_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id text NOT NULL,
  crfn text,
  recorded_date date NOT NULL,
  doc_type text NOT NULL DEFAULT '',
  borough text NOT NULL,
  block text NOT NULL,
  lot text NOT NULL,
  bbl text NOT NULL,
  party1 text,
  party2 text,
  amount numeric,
  source text NOT NULL DEFAULT 'socrata',
  ingested_at timestamptz NOT NULL DEFAULT now(),
  raw_payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT acris_documents_document_id_key UNIQUE (document_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_acris_documents_crfn
  ON acris_documents (crfn) WHERE crfn IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_acris_documents_bbl
  ON acris_documents (bbl);

CREATE INDEX IF NOT EXISTS idx_acris_documents_recorded_date
  ON acris_documents (recorded_date DESC);

CREATE INDEX IF NOT EXISTS idx_acris_documents_borough
  ON acris_documents (borough);

CREATE INDEX IF NOT EXISTS idx_acris_documents_doc_type
  ON acris_documents (doc_type);

CREATE INDEX IF NOT EXISTS idx_acris_documents_borough_date
  ON acris_documents (borough, recorded_date DESC);

CREATE INDEX IF NOT EXISTS idx_acris_documents_ingested
  ON acris_documents (ingested_at);

ALTER TABLE acris_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read acris_documents"
  ON acris_documents
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can insert acris_documents"
  ON acris_documents
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update acris_documents"
  ON acris_documents
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role can delete acris_documents"
  ON acris_documents
  FOR DELETE
  TO service_role
  USING (true);

-- acris_sync_log table
CREATE TABLE IF NOT EXISTS acris_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  source text NOT NULL DEFAULT 'socrata',
  docs_ingested integer NOT NULL DEFAULT 0,
  docs_skipped integer NOT NULL DEFAULT 0,
  error_message text,
  run_metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE acris_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage acris_sync_log"
  ON acris_sync_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can read acris_sync_log"
  ON acris_sync_log
  FOR SELECT
  TO authenticated
  USING (true);
