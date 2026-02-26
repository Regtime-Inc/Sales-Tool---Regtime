/*
  # Clear stale discovery cache

  1. Purpose
    - All existing cached rows have NULL last_sale_date due to a SoQL query bug
    - The discovery edge function has been fixed to properly quote the borough value
    - Clearing the cache forces a fresh fetch with correct sale date population

  2. Action
    - Truncate discovery_cache table to remove all stale rows
    - Next discovery request will repopulate with correct data

  3. Notes
    - This is a one-time cleanup; no schema changes
    - The cache is ephemeral (24-hour TTL) so truncation is safe
*/

TRUNCATE TABLE discovery_cache;
