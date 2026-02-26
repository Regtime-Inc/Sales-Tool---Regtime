/*
  # Create Owner Entity tables for portfolio tracking

  1. New Tables
    - `owner_entities`
      - `id` (uuid, primary key)
      - `canonical_name` (text, required) - display name of the owner/developer
      - `entity_type` (text) - person, org, or unknown
      - `aliases` (text[]) - alternative names / variants
      - `emails` (jsonb[]) - array of {value, source, confidence, updatedAt, evidence?}
      - `phones` (jsonb[]) - same structure
      - `addresses` (jsonb[]) - same structure
      - `created_at` / `updated_at` (timestamptz)
    - `owner_entity_properties`
      - `id` (uuid, primary key)
      - `owner_entity_id` (uuid, FK)
      - `bbl` (text)
      - `relationship_type` (text) - owner, developer, authorized_signer, borrower, lender, other
      - `confidence` (numeric 0-1)
      - `evidence` (jsonb) - {source, documentId?, jobNumber?, snippet?, recordedDate?, url?}
      - `created_at` (timestamptz)
    - `owner_entity_events`
      - `id` (uuid, primary key)
      - `owner_entity_id` (uuid, FK)
      - `event_type` (text) - purchase, dobnow_job, acris_doc, other
      - `bbl` (text)
      - `occurred_at` (date)
      - `payload` (jsonb) - doc/job ids + summary fields
      - `created_at` (timestamptz)

  2. Security
    - RLS enabled on all three tables
    - Anon users can SELECT (read-only portfolio browsing)
    - Service role manages writes (edge functions handle indexing)

  3. Indexes
    - owner_entities: GIN on aliases, trigram on canonical_name for fuzzy search
    - owner_entity_properties: on owner_entity_id, on bbl
    - owner_entity_events: on owner_entity_id, on bbl
    - Unique constraint on (owner_entity_id, bbl, relationship_type) for properties

  4. Notes
    - pg_trgm extension enabled for fuzzy name matching
    - Match key uses normalized canonical_name + entity_type for idempotent upserts
*/

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── owner_entities ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS owner_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name text NOT NULL,
  entity_type text NOT NULL DEFAULT 'unknown'
    CHECK (entity_type IN ('person', 'org', 'unknown')),
  aliases text[] NOT NULL DEFAULT '{}',
  emails jsonb NOT NULL DEFAULT '[]'::jsonb,
  phones jsonb NOT NULL DEFAULT '[]'::jsonb,
  addresses jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_owner_entities_canonical_trgm
  ON owner_entities USING gin (canonical_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_owner_entities_aliases
  ON owner_entities USING gin (aliases);

CREATE UNIQUE INDEX IF NOT EXISTS idx_owner_entities_name_type
  ON owner_entities (upper(canonical_name), entity_type);

ALTER TABLE owner_entities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon users can read owner entities"
  ON owner_entities FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Service role manages owner entities"
  ON owner_entities FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── owner_entity_properties ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS owner_entity_properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_entity_id uuid NOT NULL REFERENCES owner_entities(id) ON DELETE CASCADE,
  bbl text NOT NULL,
  relationship_type text NOT NULL DEFAULT 'owner'
    CHECK (relationship_type IN ('owner', 'developer', 'authorized_signer', 'borrower', 'lender', 'other')),
  confidence numeric NOT NULL DEFAULT 0.5
    CHECK (confidence >= 0 AND confidence <= 1),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_oep_entity_bbl_rel
  ON owner_entity_properties (owner_entity_id, bbl, relationship_type);

CREATE INDEX IF NOT EXISTS idx_oep_bbl
  ON owner_entity_properties (bbl);

CREATE INDEX IF NOT EXISTS idx_oep_entity
  ON owner_entity_properties (owner_entity_id);

ALTER TABLE owner_entity_properties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon users can read owner entity properties"
  ON owner_entity_properties FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Service role manages owner entity properties"
  ON owner_entity_properties FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── owner_entity_events ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS owner_entity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_entity_id uuid NOT NULL REFERENCES owner_entities(id) ON DELETE CASCADE,
  event_type text NOT NULL DEFAULT 'other'
    CHECK (event_type IN ('purchase', 'dobnow_job', 'acris_doc', 'other')),
  bbl text NOT NULL,
  occurred_at date,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_oee_entity_type_bbl_date
  ON owner_entity_events (owner_entity_id, event_type, bbl, COALESCE(occurred_at, '1900-01-01'));

CREATE INDEX IF NOT EXISTS idx_oee_entity
  ON owner_entity_events (owner_entity_id);

CREATE INDEX IF NOT EXISTS idx_oee_bbl
  ON owner_entity_events (bbl);

ALTER TABLE owner_entity_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon users can read owner entity events"
  ON owner_entity_events FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Service role manages owner entity events"
  ON owner_entity_events FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── Helper function: search owner entities by name ──────────────────────────

CREATE OR REPLACE FUNCTION search_owner_entities(
  query_text text,
  max_results int DEFAULT 25
)
RETURNS TABLE (
  id uuid,
  canonical_name text,
  entity_type text,
  aliases text[],
  emails jsonb,
  phones jsonb,
  addresses jsonb,
  match_score real,
  property_count bigint
)
LANGUAGE sql STABLE
AS $$
  SELECT
    oe.id,
    oe.canonical_name,
    oe.entity_type,
    oe.aliases,
    oe.emails,
    oe.phones,
    oe.addresses,
    GREATEST(
      similarity(upper(oe.canonical_name), upper(query_text)),
      (
        SELECT COALESCE(MAX(similarity(upper(a), upper(query_text))), 0)
        FROM unnest(oe.aliases) AS a
      )
    ) AS match_score,
    (SELECT count(*) FROM owner_entity_properties oep WHERE oep.owner_entity_id = oe.id) AS property_count
  FROM owner_entities oe
  WHERE
    upper(oe.canonical_name) % upper(query_text)
    OR EXISTS (
      SELECT 1 FROM unnest(oe.aliases) AS a
      WHERE upper(a) % upper(query_text)
    )
    OR upper(oe.canonical_name) ILIKE '%' || upper(query_text) || '%'
  ORDER BY match_score DESC, oe.canonical_name
  LIMIT max_results;
$$;