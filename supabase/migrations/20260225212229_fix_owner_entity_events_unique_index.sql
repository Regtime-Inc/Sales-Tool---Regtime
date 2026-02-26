/*
  # Fix owner_entity_events unique index for JS client compatibility

  1. Changes
    - Backfill NULL occurred_at values with sentinel date '1900-01-01'
    - Replace expression-based unique index (COALESCE) with plain column index
    - Add NOT NULL constraint + default to occurred_at column

  2. Why
    - The Supabase JS client's onConflict parameter only accepts plain
      column names, not SQL expressions like COALESCE(occurred_at, '1900-01-01')
    - This caused upserts in the owner-reindex edge function to fail
    - The COALESCE index already treated NULLs as '1900-01-01' for uniqueness,
      so backfilling NULLs to that value is safe and consistent

  3. Notes
    - No data loss: only NULLs are replaced with the same sentinel the
      expression index already mapped them to
    - The unique index name is preserved for continuity
*/

UPDATE owner_entity_events
SET occurred_at = '1900-01-01'
WHERE occurred_at IS NULL;

DROP INDEX IF EXISTS idx_oee_entity_type_bbl_date;

ALTER TABLE owner_entity_events
  ALTER COLUMN occurred_at SET DEFAULT '1900-01-01';

DO $$
BEGIN
  ALTER TABLE owner_entity_events
    ALTER COLUMN occurred_at SET NOT NULL;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'NOT NULL constraint already exists or could not be set: %', SQLERRM;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_oee_entity_type_bbl_date
  ON owner_entity_events (owner_entity_id, event_type, bbl, occurred_at);
