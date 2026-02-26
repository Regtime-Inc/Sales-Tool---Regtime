/*
  # Create lookup_owner_entities_by_names RPC function

  1. New Functions
    - `lookup_owner_entities_by_names(p_names text[])` - Given an array of canonical names,
      returns matching owner_entities rows using case-insensitive comparison.
      This replaces the previous approach of fetching ALL owner_entities (which broke
      once the table exceeded Supabase's default 1000-row limit).

  2. Important Notes
    - Uses upper() for case-insensitive matching
    - Strips non-word characters and collapses whitespace to match JS normalizeName()
    - Returns full entity rows including contacts for merge logic
*/

CREATE OR REPLACE FUNCTION lookup_owner_entities_by_names(p_names text[])
RETURNS TABLE(
  id uuid,
  canonical_name text,
  entity_type text,
  aliases text[],
  emails jsonb,
  phones jsonb,
  addresses jsonb
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    oe.id,
    oe.canonical_name,
    oe.entity_type,
    oe.aliases,
    oe.emails,
    oe.phones,
    oe.addresses
  FROM owner_entities oe
  WHERE upper(regexp_replace(regexp_replace(trim(oe.canonical_name), '[^\w\s,]', ' ', 'g'), '\s+', ' ', 'g'))
    = ANY(
      SELECT upper(regexp_replace(regexp_replace(trim(n), '[^\w\s,]', ' ', 'g'), '\s+', ' ', 'g'))
      FROM unnest(p_names) AS n
    );
$$;
