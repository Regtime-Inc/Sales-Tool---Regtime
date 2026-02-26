/*
  # Create helper function for latest sales lookup

  1. New Functions
    - `get_latest_sales_for_bbls(bbl_list text[])` - Returns the most recent sale
      for each BBL from the discovery_sales table using DISTINCT ON

  2. Notes
    - Used by the discovery edge function to efficiently join sales data
      to property records without N+1 queries
    - Returns bbl, sale_date, sale_price, source for each unique BBL
*/

CREATE OR REPLACE FUNCTION get_latest_sales_for_bbls(bbl_list text[])
RETURNS TABLE(bbl text, sale_date date, sale_price numeric, source text)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT DISTINCT ON (ds.bbl)
    ds.bbl,
    ds.sale_date,
    ds.sale_price,
    ds.source
  FROM discovery_sales ds
  WHERE ds.bbl = ANY(bbl_list)
  ORDER BY ds.bbl, ds.sale_date DESC;
$$;