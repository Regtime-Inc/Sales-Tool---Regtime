/*
  # Invalidate stakeholder and analysis caches for owner contact enrichment

  1. Changes
    - Expire all rows in `stakeholder_cache` so fresh stakeholder data
      (with owner email, phone, address from DOB NOW portal + manual imports)
      is computed on the next analysis request.
    - Expire all rows in `analysis_cache` so the updated DobFiling objects
      (with ownerEmail, ownerContactSource fields) are returned to the UI.

  2. Notes
    - Non-destructive: sets `expires_at` to now(), which causes a cache miss
      on the next request. Old rows are left in place for auditing and will
      be superseded by new inserts.
    - Cache version was bumped to v13 in the edge function, so even entries
      that survive this expiry will be invalidated by the version check.
*/

UPDATE stakeholder_cache SET expires_at = now();
UPDATE analysis_cache SET expires_at = now();
