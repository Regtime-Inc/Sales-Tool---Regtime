/*
  # Create PDF uploads table and storage bucket

  1. New Tables
    - `pdf_uploads`
      - `id` (uuid, primary key)
      - `filename` (text, not null) - original filename
      - `storage_path` (text, not null) - path in storage bucket
      - `file_size` (integer, default 0) - file size in bytes
      - `status` (text, default 'uploaded') - uploaded, extracting, extracted, failed
      - `extraction` (jsonb, nullable) - structured extraction results
      - `extracted_at` (timestamptz, nullable) - when extraction completed
      - `created_at` (timestamptz, default now())
  2. Storage
    - Create `pdf-uploads` storage bucket (private)
  3. Security
    - Enable RLS on `pdf_uploads` table
    - Add service-role-only policies (edge functions use service role)
  4. Notes
    - PDFs are uploaded via edge function using service role key
    - Extraction results stored as JSONB for flexible schema
*/

CREATE TABLE IF NOT EXISTS pdf_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filename text NOT NULL,
  storage_path text NOT NULL,
  file_size integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'uploaded',
  extraction jsonb,
  extracted_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE pdf_uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage pdf uploads"
  ON pdf_uploads
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'pdf-uploads',
  'pdf-uploads',
  false,
  52428800,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Service role can manage pdf storage"
  ON storage.objects
  FOR ALL
  TO service_role
  USING (bucket_id = 'pdf-uploads')
  WITH CHECK (bucket_id = 'pdf-uploads');
