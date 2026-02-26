const PROCESSOR_ID_PATTERN =
  /^projects\/[^/]+\/locations\/[^/]+\/processors\/[^/]+$/;

export function resolveProcessorId(
  raw: string,
): { resolved: string | null; hint?: string } {
  if (PROCESSOR_ID_PATTERN.test(raw)) return { resolved: raw };

  if (/^[a-f0-9]+$/i.test(raw)) {
    const project = Deno.env.get("GOOGLE_DOC_AI_PROJECT");
    if (!project) {
      return {
        resolved: null,
        hint: `Bare processor ID detected ("${raw.slice(0, 8)}..."). Set GOOGLE_DOC_AI_PROJECT to your GCP project ID so the full resource path can be assembled.`,
      };
    }
    const location = Deno.env.get("GOOGLE_DOC_AI_LOCATION") || "us";
    return {
      resolved: `projects/${project}/locations/${location}/processors/${raw}`,
    };
  }

  return {
    resolved: null,
    hint: `Unrecognized GOOGLE_DOC_AI_PROCESSOR_ID format. Provide either the full resource path (projects/{PROJECT}/locations/{LOC}/processors/{ID}) or a bare hex processor ID with GOOGLE_DOC_AI_PROJECT set. Got: "${raw.slice(0, 40)}..."`,
  };
}

let cachedToken: string | null = null;
let cachedTokenExpiry = 0;

function base64url(input: Uint8Array): string {
  const raw = btoa(String.fromCharCode(...input));
  return raw.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlStr(input: string): string {
  return base64url(new TextEncoder().encode(input));
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const lines = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const binary = atob(lines);
  const buf = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    buf[i] = binary.charCodeAt(i);
  }
  return buf.buffer;
}

export async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  if (cachedToken && now < cachedTokenExpiry - 60) {
    return cachedToken;
  }

  const saJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
  if (!saJson) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_JSON is not set. Create a GCP service account with Document AI access and store its JSON key as a Supabase secret.",
    );
  }

  const sa = JSON.parse(saJson);
  const clientEmail: string = sa.client_email;
  const privateKeyPem: string = sa.private_key;

  if (!clientEmail || !privateKeyPem) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_JSON is missing client_email or private_key fields.",
    );
  }

  const iat = now;
  const exp = now + 3600;

  const header = base64urlStr(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64urlStr(
    JSON.stringify({
      iss: clientEmail,
      scope: "https://www.googleapis.com/auth/cloud-platform",
      aud: "https://oauth2.googleapis.com/token",
      iat,
      exp,
    }),
  );

  const signingInput = `${header}.${payload}`;

  const keyData = pemToArrayBuffer(privateKeyPem);
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyData,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = new Uint8Array(
    await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      cryptoKey,
      new TextEncoder().encode(signingInput),
    ),
  );

  const jwt = `${signingInput}.${base64url(signature)}`;

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Google OAuth2 token exchange failed (${resp.status}): ${errText}`);
  }

  const tokenData = await resp.json();
  cachedToken = tokenData.access_token;
  cachedTokenExpiry = now + (tokenData.expires_in || 3600);
  return cachedToken!;
}
