/*
  # Invalidate discovery cache for scoring formula v2

  1. Purpose
    - The discovery edge function now uses a 6-category scoring system (0-130 scale)
      that matches the analyze tab's scoring logic:
      - Underbuilt Ratio (0-30 pts)
      - Sale Indicators (0-25 pts)
      - Property Characteristics (0-45 pts)
      - Rental Overlay (0-30 pts)
    - Previously used a simple 4-factor weighted formula (0-100 scale)
    - All cached scores need to be recomputed with the new formula

  2. Action
    - Backdate cached_at on all discovery_cache rows to force a full refresh
    - Also backdate discovery_sales to force ACRIS realtime data refresh

  3. Notes
    - No data is lost; rows remain but will be overwritten with fresh data
    - The next discovery search per borough will re-fetch and re-score
*/

UPDATE discovery_cache
SET cached_at = '2000-01-01T00:00:00Z'
WHERE cached_at > '2000-01-02T00:00:00Z';

UPDATE discovery_sales
SET cached_at = '2000-01-01T00:00:00Z'
WHERE cached_at > '2000-01-02T00:00:00Z';
