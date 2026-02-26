/*
  # Invalidate discovery cache for program flags and projected units refresh

  1. Purpose
    - The discovery edge function now computes program eligibility with an expanded
      zoning table (R6-R12 with all sub-variants) and refined logic for 485-x, 421-a
    - Projected units now use a net-to-gross efficiency factor (0.80) and zone-aware
      DU factors instead of a flat 680 SF divisor
    - Cached values from the old formula are stale and need to be recomputed

  2. Action
    - Backdate cached_at on all discovery_cache rows so the edge function treats
      them as expired and refreshes from PLUTO on next request

  3. Notes
    - No data is lost; rows remain but will be overwritten with fresh data
    - The next discovery search per borough will take slightly longer as it re-fetches
*/

UPDATE discovery_cache
SET cached_at = '2000-01-01T00:00:00Z'
WHERE cached_at > '2000-01-02T00:00:00Z';