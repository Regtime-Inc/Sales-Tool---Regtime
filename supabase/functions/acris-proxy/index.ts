import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const RATE_LIMIT_MS = 5000;
const lastRequestByUser = new Map<string, number>();

const ACRIS_BASE = "https://a836-acris.nyc.gov/DS/DocumentSearch";
const ACRIS_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

function rateLimited(userId: string): number {
  const now = Date.now();
  const last = lastRequestByUser.get(userId) || 0;
  const elapsed = now - last;
  if (elapsed < RATE_LIMIT_MS) {
    return RATE_LIMIT_MS - elapsed;
  }
  lastRequestByUser.set(userId, now);
  return 0;
}

function errorResponse(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isBlocked(text: string): boolean {
  return (
    text.includes("Further access to ACRIS is denied") ||
    text.includes("Bandwidth") ||
    text.includes("exceeded the bandwidth")
  );
}

function extractEmbeddedUrl(html: string): string | null {
  const iframeSrc = html.match(
    /<iframe[^>]+src=["']([^"']*(?:DocumentImage|BBL_Image|ImageDoc|FakePropImage)[^"']*)/i
  );
  if (iframeSrc) return iframeSrc[1];

  const objectData = html.match(
    /<object[^>]+data=["']([^"']*(?:Image|\.tif|\.pdf)[^"']*)/i
  );
  if (objectData) return objectData[1];

  const embedSrc = html.match(
    /<embed[^>]+src=["']([^"']*(?:Image|\.tif|\.pdf)[^"']*)/i
  );
  if (embedSrc) return embedSrc[1];

  const imgSrc = html.match(
    /<img[^>]+src=["']([^"']*(?:DocImage|BBL_Image|FakePropImage)[^"']*)/i
  );
  if (imgSrc) return imgSrc[1];

  const scriptUrl = html.match(
    /["']((?:\/DS)?\/DocumentSearch\/(?:DocumentImage|BBL_Image|ImageDoc)[^"']*)/i
  );
  if (scriptUrl) return scriptUrl[1];

  return null;
}

function resolveUrl(base: string, relative: string): string {
  if (relative.startsWith("http")) return relative;
  if (relative.startsWith("//")) return "https:" + relative;
  if (relative.startsWith("/")) {
    const origin = new URL(base).origin;
    return origin + relative;
  }
  return base.replace(/\/[^/]*$/, "/") + relative;
}

async function fetchAcrisResource(
  url: string,
  accept: string
): Promise<Response> {
  return fetch(url, {
    headers: {
      "User-Agent": ACRIS_UA,
      Accept: accept,
      "Accept-Language": "en-US,en;q=0.9",
      Referer: `${ACRIS_BASE}/DocumentImageView`,
    },
    redirect: "follow",
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method !== "GET") {
      return errorResponse("Method not allowed", 405);
    }

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) {
      return errorResponse("Unauthorized", 401);
    }

    let userId = "anon";
    try {
      const payloadB64 = token.split(".")[1];
      if (payloadB64) {
        const payload = JSON.parse(atob(payloadB64));
        userId = payload.sub || "anon";
      }
    } catch {
      userId = "anon";
    }

    const waitMs = rateLimited(userId);
    if (waitMs > 0) {
      return new Response(
        JSON.stringify({ error: "rate_limited", retryAfterMs: waitMs }),
        {
          status: 429,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "Retry-After": String(Math.ceil(waitMs / 1000)),
          },
        }
      );
    }

    const url = new URL(req.url);
    const docId = url.searchParams.get("doc_id");
    if (!docId || !/^[\w]+$/.test(docId)) {
      return errorResponse("Missing or invalid doc_id parameter", 400);
    }

    const imageViewUrl = `${ACRIS_BASE}/DocumentImageView?doc_id=${encodeURIComponent(docId)}`;

    const acrisResponse = await fetchAcrisResource(
      imageViewUrl,
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/tiff,application/pdf,image/*;q=0.8,*/*;q=0.7"
    );

    if (!acrisResponse.ok) {
      return errorResponse(
        `ACRIS returned ${acrisResponse.status}`,
        acrisResponse.status >= 500 ? 502 : acrisResponse.status
      );
    }

    const contentType = acrisResponse.headers.get("content-type") || "";

    if (
      !contentType.includes("text/html") &&
      !contentType.includes("application/xhtml")
    ) {
      const body = await acrisResponse.arrayBuffer();
      return new Response(body, {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": contentType || "application/octet-stream",
          "X-Doc-Format": "binary",
          "Cache-Control": "public, max-age=600",
        },
      });
    }

    const html = await acrisResponse.text();

    if (isBlocked(html)) {
      return errorResponse("acris_blocked", 503);
    }

    const embeddedUrl = extractEmbeddedUrl(html);

    if (embeddedUrl) {
      const resolvedUrl = resolveUrl(imageViewUrl, embeddedUrl);
      try {
        const binaryRes = await fetchAcrisResource(
          resolvedUrl,
          "image/tiff,application/pdf,image/*,*/*"
        );
        if (binaryRes.ok) {
          const binaryType = binaryRes.headers.get("content-type") || "";
          if (
            !binaryType.includes("text/html") &&
            !binaryType.includes("application/xhtml")
          ) {
            const binaryBody = await binaryRes.arrayBuffer();
            return new Response(binaryBody, {
              status: 200,
              headers: {
                ...corsHeaders,
                "Content-Type": binaryType || "application/octet-stream",
                "X-Doc-Format": "binary",
                "Cache-Control": "public, max-age=600",
              },
            });
          }
        }
      } catch (e) {
        console.warn(`[acris-proxy] Embedded URL fetch failed: ${e}`);
      }
    }

    return new Response(
      JSON.stringify({
        error: "no_binary",
        message: "Could not extract document image from ACRIS. Open the document directly in your browser.",
        portalUrl: `${ACRIS_BASE}/DocumentDetail/${encodeURIComponent(docId)}`,
        imageViewUrl,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "X-Doc-Format": "unavailable",
        },
      }
    );
  } catch (e) {
    return errorResponse(String(e), 500);
  }
});
