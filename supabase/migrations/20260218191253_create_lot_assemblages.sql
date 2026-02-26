/*
  # Create lot assemblages table

  1. New Tables
    - `lot_assemblages`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users) - owner of this assemblage
      - `primary_bbl` (text) - the main BBL for this assemblage
      - `lots` (jsonb) - array of AssemblageLot objects with bbl, address, lotArea,
        existingBldgArea, residFar, commFar, facilFar, zoneDist, isPrimary
      - `config` (jsonb) - AssemblageConfig settings (farSelectionMode, effective values)
      - `created_at` (timestamptz) - when the assemblage was created
      - `updated_at` (timestamptz) - when the assemblage was last modified

  2. Security
    - Enable RLS on `lot_assemblages` table
    - Users can only read, insert, update, and delete their own assemblages
*/

CREATE TABLE IF NOT EXISTS lot_assemblages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  primary_bbl text NOT NULL,
  lots jsonb NOT NULL DEFAULT '[]'::jsonb,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lot_assemblages_user_bbl
  ON lot_assemblages (user_id, primary_bbl);

ALTER TABLE lot_assemblages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own assemblages"
  ON lot_assemblages
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own assemblages"
  ON lot_assemblages
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own assemblages"
  ON lot_assemblages
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own assemblages"
  ON lot_assemblages
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
