/*
  # Clear stale discovery cache after Socrata query fix

  1. Problem
    - All existing discovery_cache rows were populated while the DOF Rolling Sales
      Socrata query had an unquoted borough parameter, causing HTTP 400 errors.
    - As a result, all rows have NULL last_sale_date, last_sale_price, and last_sale_source.

  2. Fix
    - Delete all rows from discovery_cache to force a full rebuild on next request.
    - The rebuilt rows will use the corrected Socrata query and properly join with
      freshly-fetched sales data from discovery_sales.

  3. Notes
    - discovery_sales is also cleared so both caches rebuild in sync.
    - No schema changes; data-only cleanup.
*/

DELETE FROM discovery_cache WHERE true;
DELETE FROM discovery_sales WHERE true;
