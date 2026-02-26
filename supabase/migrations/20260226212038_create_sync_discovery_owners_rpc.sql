/*
  # Create sync_discovery_owners RPC function

  1. New Functions
    - `sync_discovery_owners()` - Bulk syncs owner_name from discovery_cache into owner_entities + owner_entity_properties
      - Runs entirely in SQL for performance (avoids pulling 75K+ rows through edge function)
      - Determines entity_type using keyword matching (LLC, INC, CORP, etc. -> org; otherwise unknown)
      - Uses ON CONFLICT DO NOTHING to safely handle duplicates
      - Returns count of entities created and property links created

  2. Important Notes
    - Uses the unique index on owner_entities(upper(canonical_name), entity_type)
    - Uses the unique index on owner_entity_properties(owner_entity_id, bbl, relationship_type)
    - Discovery_cache owners get confidence 0.6 (lower than ACRIS/DOBNow)
    - Only processes rows where owner_name is not null and not empty
*/

CREATE OR REPLACE FUNCTION sync_discovery_owners()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  entities_created int := 0;
  links_created int := 0;
BEGIN
  WITH distinct_owners AS (
    SELECT DISTINCT trim(owner_name) AS name
    FROM discovery_cache
    WHERE owner_name IS NOT NULL AND trim(owner_name) != '' AND length(trim(owner_name)) >= 3
  ),
  classified AS (
    SELECT
      name,
      CASE
        WHEN name ~* '\m(LLC|L\.?L\.?C\.?|LP|L\.?P\.?|INC\.?|CORP\.?|CORPORATION|CO\.?|LTD\.?|PLLC|LLP|TRUST|ASSOCIATES|REALTY|HOLDINGS|ENTERPRISES|PROPERTIES|GROUP|PARTNERS|DEVELOPMENT|MGMT|MANAGEMENT)\M'
        THEN 'org'
        ELSE 'unknown'
      END AS etype
    FROM distinct_owners
  ),
  inserted AS (
    INSERT INTO owner_entities (canonical_name, entity_type, aliases, emails, phones, addresses)
    SELECT
      c.name,
      c.etype,
      ARRAY[]::text[],
      '[]'::jsonb,
      '[]'::jsonb,
      '[]'::jsonb
    FROM classified c
    WHERE NOT EXISTS (
      SELECT 1 FROM owner_entities oe
      WHERE upper(oe.canonical_name) = upper(c.name) AND oe.entity_type = c.etype
    )
    ON CONFLICT (upper(canonical_name), entity_type) DO NOTHING
    RETURNING id
  )
  SELECT count(*) INTO entities_created FROM inserted;

  WITH discovery_links AS (
    SELECT
      dc.bbl,
      trim(dc.owner_name) AS name,
      dc.address
    FROM discovery_cache dc
    WHERE dc.owner_name IS NOT NULL AND trim(dc.owner_name) != '' AND length(trim(dc.owner_name)) >= 3
  ),
  matched AS (
    SELECT
      oe.id AS entity_id,
      dl.bbl,
      dl.address
    FROM discovery_links dl
    JOIN owner_entities oe ON upper(oe.canonical_name) = upper(dl.name)
  ),
  link_inserted AS (
    INSERT INTO owner_entity_properties (owner_entity_id, bbl, relationship_type, confidence, evidence)
    SELECT
      m.entity_id,
      m.bbl,
      'owner',
      0.6,
      jsonb_build_object('source', 'discovery_cache', 'address', coalesce(m.address, ''))
    FROM matched m
    ON CONFLICT (owner_entity_id, bbl, relationship_type) DO NOTHING
    RETURNING id
  )
  SELECT count(*) INTO links_created FROM link_inserted;

  RETURN jsonb_build_object(
    'entities_created', entities_created,
    'links_created', links_created
  );
END;
$$;
