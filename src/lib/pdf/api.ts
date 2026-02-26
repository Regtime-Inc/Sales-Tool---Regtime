import type { PdfUploadResponse, PdfExtractionResponse } from '../../types/pdf';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const headers = {
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
};

export async function uploadPdf(file: File): Promise<PdfUploadResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${SUPABASE_URL}/functions/v1/upload-pdf`, {
    method: 'POST',
    headers,
    body: formData,
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Upload failed (${res.status})`);
  return data as PdfUploadResponse;
}

export async function extractPdf(fileId: string): Promise<PdfExtractionResponse> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/extract-pdf`, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fileId }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Extraction failed (${res.status})`);
  return data as PdfExtractionResponse;
}
