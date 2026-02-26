import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return new Response(JSON.stringify({ error: "No file provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (file.type !== "application/pdf") {
      return new Response(JSON.stringify({ error: "Only PDF files are accepted" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      return new Response(JSON.stringify({ error: "File exceeds 50MB limit" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `uploads/${timestamp}_${safeName}`;

    const bytes = await file.arrayBuffer();
    const { error: uploadError } = await supabase.storage
      .from("pdf-uploads")
      .upload(storagePath, bytes, {
        contentType: "application/pdf",
        upsert: false,
      });

    if (uploadError) {
      return new Response(JSON.stringify({ error: `Storage upload failed: ${uploadError.message}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: record, error: dbError } = await supabase
      .from("pdf_uploads")
      .insert({
        filename: file.name,
        storage_path: storagePath,
        file_size: file.size,
        status: "uploaded",
      })
      .select("id, filename, status")
      .single();

    if (dbError) {
      return new Response(JSON.stringify({ error: `Database insert failed: ${dbError.message}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ fileId: record.id, filename: record.filename, status: record.status }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
