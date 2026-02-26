/*
  # Create get_latest_sales_for_borough RPC function

  1. New Functions
    - `get_latest_sales_for_borough(borough_code text)`
      - Returns one row per BBL with the most recent sale date, price, and source
      - Uses DISTINCT ON for efficient deduplication in SQL instead of application memory
      - Replaces the JS-side dedupeLatestSales logic

  2. Notes
    - Filters by bbl prefix matching the borough code (e.g., '1%' for Manhattan)
    - Ordered by sale_date DESC to pick the latest sale per BBL
    - Much more efficient than loading 60K rows into JS memory
*/

CREATE OR REPLACE FUNCTION get_latest_sales_for_borough(borough_code text)
RETURNS TABLE (
  bbl text,
  sale_date text,
  sale_price numeric,
  source text
)
LANGUAGE sql
STABLE
AS $$
  SELECT DISTINCT ON (ds.bbl)
    ds.bbl,
    ds.sale_date,
    ds.sale_price,
    ds.source
  FROM discovery_sales ds
  WHERE ds.bbl LIKE borough_code || '%'
  ORDER BY ds.bbl, ds.sale_date DESC NULLS LAST;
$$;
