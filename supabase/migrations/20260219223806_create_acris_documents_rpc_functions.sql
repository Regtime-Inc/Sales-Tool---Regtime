/*
  # Create RPC functions for querying acris_documents

  1. New Functions
    - `get_latest_acris_sales_for_borough(borough_code text)`
      Returns the most recent deed document per BBL for a given borough,
      used by the discovery pipeline to prefer fresher acris_documents data
      over the Socrata on-demand fetch.

    - `get_acris_docs_for_bbls(bbl_list text[])`
      Returns all acris_documents matching a list of BBLs,
      used for property-level detail lookups.

  2. Important Notes
    - These are STABLE, read-only functions
    - SECURITY DEFINER to bypass RLS for internal use
    - get_latest_acris_sales_for_borough only returns deed-type documents
      with amount > 0, matching discovery_sales semantics
*/

CREATE OR REPLACE FUNCTION get_latest_acris_sales_for_borough(borough_code text)
RETURNS TABLE (
  bbl text,
  sale_date date,
  sale_price numeric,
  source text,
  document_id text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT DISTINCT ON (ad.bbl)
    ad.bbl,
    ad.recorded_date AS sale_date,
    ad.amount AS sale_price,
    'acris_realtime' AS source,
    ad.document_id
  FROM acris_documents ad
  WHERE ad.borough = borough_code
    AND ad.doc_type IN ('DEED', 'DEEDO', 'ADED', 'EXED', 'RDED', 'TORD')
    AND ad.amount > 0
  ORDER BY ad.bbl, ad.recorded_date DESC;
$$;

CREATE OR REPLACE FUNCTION get_acris_docs_for_bbls(bbl_list text[])
RETURNS TABLE (
  document_id text,
  crfn text,
  recorded_date date,
  doc_type text,
  bbl text,
  party1 text,
  party2 text,
  amount numeric,
  source text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    ad.document_id,
    ad.crfn,
    ad.recorded_date,
    ad.doc_type,
    ad.bbl,
    ad.party1,
    ad.party2,
    ad.amount,
    ad.source
  FROM acris_documents ad
  WHERE ad.bbl = ANY(bbl_list)
  ORDER BY ad.recorded_date DESC;
$$;
