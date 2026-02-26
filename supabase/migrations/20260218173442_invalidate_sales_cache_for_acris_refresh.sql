/*
  # Invalidate sales cache to trigger ACRIS data fetch

  1. Changes
    - Sets cached_at to an old date on all discovery_sales rows
    - This causes the edge function to refetch both DOF Rolling Sales
      and ACRIS deed records on the next request

  2. Notes
    - One-time data migration to bootstrap ACRIS supplementary sale data
    - Subsequent refreshes will happen automatically via the 72-hour TTL
*/

UPDATE discovery_sales SET cached_at = '2020-01-01 00:00:00+00';
