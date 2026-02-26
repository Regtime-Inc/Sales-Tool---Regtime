/*
  # Create market rent estimates table

  1. New Tables
    - `market_rent_estimates`
      - `id` (uuid, primary key)
      - `borough_code` (text, 1-5 corresponding to NYC boroughs)
      - `borough_name` (text, human-readable borough name)
      - `unit_type` (text: Studio, 1BR, 2BR, 3BR)
      - `monthly_rent` (integer, estimated free-market monthly rent)
      - `avg_sf` (integer, average square footage for this unit type in this borough)
      - `source` (text, data source description)
      - `updated_at` (timestamptz, defaults to now())

  2. Security
    - Enable RLS on `market_rent_estimates` table
    - Add SELECT policy for authenticated users
    - Add SELECT policy for anonymous users (public reference data)

  3. Seed Data
    - Pre-populated with current market estimates for all 5 boroughs
    - 4 unit types per borough (Studio, 1BR, 2BR, 3BR)
    - Rents and avg SF calibrated to 2025 market conditions

  4. Notes
    - This is reference data, not user-specific data
    - Borough codes: 1=Manhattan, 2=Bronx, 3=Brooklyn, 4=Queens, 5=Staten Island
    - Rents represent estimated free-market (not affordable/regulated) pricing
    - Avg SF represents typical unit sizes for new construction in each borough
*/

CREATE TABLE IF NOT EXISTS market_rent_estimates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  borough_code text NOT NULL,
  borough_name text NOT NULL DEFAULT '',
  unit_type text NOT NULL,
  monthly_rent integer NOT NULL DEFAULT 0,
  avg_sf integer NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'Manual estimate',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (borough_code, unit_type)
);

ALTER TABLE market_rent_estimates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read market rent estimates"
  ON market_rent_estimates
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Anonymous users can read market rent estimates"
  ON market_rent_estimates
  FOR SELECT
  TO anon
  USING (true);

INSERT INTO market_rent_estimates (borough_code, borough_name, unit_type, monthly_rent, avg_sf, source) VALUES
  ('1', 'Manhattan', 'Studio', 3200, 450, '2025 market estimate'),
  ('1', 'Manhattan', '1BR', 4100, 650, '2025 market estimate'),
  ('1', 'Manhattan', '2BR', 5500, 950, '2025 market estimate'),
  ('1', 'Manhattan', '3BR', 7200, 1250, '2025 market estimate'),

  ('2', 'Bronx', 'Studio', 1600, 400, '2025 market estimate'),
  ('2', 'Bronx', '1BR', 1900, 600, '2025 market estimate'),
  ('2', 'Bronx', '2BR', 2300, 850, '2025 market estimate'),
  ('2', 'Bronx', '3BR', 2700, 1100, '2025 market estimate'),

  ('3', 'Brooklyn', 'Studio', 2500, 425, '2025 market estimate'),
  ('3', 'Brooklyn', '1BR', 3200, 625, '2025 market estimate'),
  ('3', 'Brooklyn', '2BR', 4000, 900, '2025 market estimate'),
  ('3', 'Brooklyn', '3BR', 5000, 1200, '2025 market estimate'),

  ('4', 'Queens', 'Studio', 1800, 425, '2025 market estimate'),
  ('4', 'Queens', '1BR', 2300, 625, '2025 market estimate'),
  ('4', 'Queens', '2BR', 2900, 875, '2025 market estimate'),
  ('4', 'Queens', '3BR', 3500, 1150, '2025 market estimate'),

  ('5', 'Staten Island', 'Studio', 1400, 450, '2025 market estimate'),
  ('5', 'Staten Island', '1BR', 1700, 650, '2025 market estimate'),
  ('5', 'Staten Island', '2BR', 2100, 950, '2025 market estimate'),
  ('5', 'Staten Island', '3BR', 2600, 1250, '2025 market estimate')
ON CONFLICT (borough_code, unit_type) DO UPDATE SET
  monthly_rent = EXCLUDED.monthly_rent,
  avg_sf = EXCLUDED.avg_sf,
  source = EXCLUDED.source,
  updated_at = now();
