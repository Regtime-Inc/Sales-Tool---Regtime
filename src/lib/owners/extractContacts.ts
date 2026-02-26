export interface ExtractedContact {
  type: 'email' | 'phone';
  value: string;
  evidenceSnippet: string;
}

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

const PHONE_RE = /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/g;

const SKIP_EMAIL_PREFIXES = [
  'noreply', 'no-reply', 'donotreply', 'do-not-reply',
  'support', 'help', 'info', 'admin', 'webmaster',
  'privacy', 'abuse', 'postmaster', 'mailer-daemon',
  'unsubscribe', 'feedback', 'newsletter', 'notifications',
];

const SKIP_EMAIL_DOMAINS = [
  'example.com', 'example.org', 'test.com', 'localhost',
  'sentry.io', 'gravatar.com', 'schema.org', 'w3.org',
  'googleapis.com', 'googleusercontent.com',
];

const SNIPPET_RADIUS = 60;

function extractSnippet(text: string, matchIndex: number, matchLength: number): string {
  const start = Math.max(0, matchIndex - SNIPPET_RADIUS);
  const end = Math.min(text.length, matchIndex + matchLength + SNIPPET_RADIUS);
  let snippet = text.slice(start, end).replace(/\s+/g, ' ').trim();
  if (start > 0) snippet = '...' + snippet;
  if (end < text.length) snippet = snippet + '...';
  return snippet;
}

function isSkippedEmail(email: string): boolean {
  const lower = email.toLowerCase();
  const localPart = lower.split('@')[0];
  const domain = lower.split('@')[1];
  if (!domain) return true;
  if (SKIP_EMAIL_PREFIXES.some((p) => localPart === p || localPart.startsWith(p + '+'))) return true;
  if (SKIP_EMAIL_DOMAINS.some((d) => domain === d || domain.endsWith('.' + d))) return true;
  if (/\.(png|jpg|jpeg|gif|svg|webp|css|js)$/i.test(domain)) return true;
  return false;
}

function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, '').replace(/^1(\d{10})$/, '$1');
}

export function extractContactsFromText(text: string): ExtractedContact[] {
  const results: ExtractedContact[] = [];
  const seenEmails = new Set<string>();
  const seenPhones = new Set<string>();

  let match: RegExpExecArray | null;
  const emailRe = new RegExp(EMAIL_RE.source, 'g');
  while ((match = emailRe.exec(text)) !== null) {
    const email = match[0].toLowerCase();
    if (isSkippedEmail(email)) continue;
    if (seenEmails.has(email)) continue;
    seenEmails.add(email);
    results.push({
      type: 'email',
      value: email,
      evidenceSnippet: extractSnippet(text, match.index, match[0].length),
    });
  }

  const phoneRe = new RegExp(PHONE_RE.source, 'g');
  while ((match = phoneRe.exec(text)) !== null) {
    const digits = normalizePhone(match[0]);
    if (digits.length < 10 || digits.length > 11) continue;
    if (/^(\d)\1{9}$/.test(digits)) continue;
    if (seenPhones.has(digits)) continue;
    seenPhones.add(digits);
    results.push({
      type: 'phone',
      value: match[0].trim(),
      evidenceSnippet: extractSnippet(text, match.index, match[0].length),
    });
  }

  return results;
}

export const BLOCKED_DOMAINS = [
  'linkedin.com', 'facebook.com', 'instagram.com',
  'twitter.com', 'x.com', 'tiktok.com',
  'pinterest.com', 'reddit.com',
  'login.', 'signin.', 'auth.',
  'accounts.google.com', 'appleid.apple.com',
];

export function isBlockedDomain(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return BLOCKED_DOMAINS.some((d) => hostname === d || hostname.endsWith('.' + d) || hostname.startsWith(d));
  } catch {
    return true;
  }
}
