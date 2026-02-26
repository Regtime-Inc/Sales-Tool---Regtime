import { describe, it, expect } from 'vitest';

function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, '').replace(/^1(\d{10})$/, '$1');
}

function isSkippedEmail(email: string): boolean {
  const SKIP_EMAIL_PREFIXES = [
    'noreply', 'no-reply', 'donotreply', 'do-not-reply',
    'support', 'help', 'admin', 'webmaster',
    'privacy', 'abuse', 'postmaster', 'mailer-daemon',
    'unsubscribe', 'feedback', 'newsletter', 'notifications',
  ];
  const SKIP_EMAIL_DOMAINS = [
    'example.com', 'example.org', 'test.com', 'localhost',
    'sentry.io', 'gravatar.com', 'schema.org', 'w3.org',
    'googleapis.com', 'googleusercontent.com',
  ];
  const lower = email.toLowerCase();
  const localPart = lower.split('@')[0];
  const domain = lower.split('@')[1];
  if (!domain) return true;
  if (SKIP_EMAIL_PREFIXES.some((p) => localPart === p || localPart.startsWith(p + '+'))) return true;
  if (SKIP_EMAIL_DOMAINS.some((d) => domain === d || domain.endsWith('.' + d))) return true;
  if (/\.(png|jpg|jpeg|gif|svg|webp|css|js)$/i.test(domain)) return true;
  return false;
}

function normalizeCacheKey(ownerName: string, location?: string): string {
  const name = ownerName
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, '')
    .replace(/\b(LLC|INC|CORP|LTD|LP|CO|THE|PLLC|LLP)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const loc = location?.toUpperCase().replace(/[^A-Z0-9]/g, '').trim() || '';
  return `serpapi:${name}:${loc}`;
}

interface ContactCandidate {
  type: 'email' | 'phone' | 'address';
  value: string;
  confidence: number;
  sourceUrl: string;
  evidenceSnippet: string;
  source: string;
}

function extractFromKnowledgeGraph(kg: {
  title?: string; website?: string; phone?: string;
  address?: string; email?: string; description?: string;
}, ownerName: string): ContactCandidate[] {
  const candidates: ContactCandidate[] = [];
  const kgUrl = kg.website || `https://www.google.com/search?q=${encodeURIComponent(ownerName)}`;

  if (kg.phone) {
    const digits = normalizePhone(kg.phone);
    if (digits.length >= 10) {
      candidates.push({
        type: 'phone',
        value: kg.phone,
        confidence: 0.9,
        sourceUrl: kgUrl,
        evidenceSnippet: `Knowledge Graph phone: ${kg.phone} (${kg.title || ownerName})`,
        source: 'serpapi_serp',
      });
    }
  }

  if (kg.email && !isSkippedEmail(kg.email)) {
    candidates.push({
      type: 'email',
      value: kg.email.toLowerCase(),
      confidence: 0.9,
      sourceUrl: kgUrl,
      evidenceSnippet: `Knowledge Graph email: ${kg.email} (${kg.title || ownerName})`,
      source: 'serpapi_serp',
    });
  }

  if (kg.address) {
    candidates.push({
      type: 'address',
      value: kg.address,
      confidence: 0.85,
      sourceUrl: kgUrl,
      evidenceSnippet: `Knowledge Graph address: ${kg.address} (${kg.title || ownerName})`,
      source: 'serpapi_serp',
    });
  }

  return candidates;
}

function extractEmailsFromSnippet(snippet: string, sourceUrl: string): ContactCandidate[] {
  const emailRe = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  const candidates: ContactCandidate[] = [];
  let match: RegExpExecArray | null;
  while ((match = emailRe.exec(snippet)) !== null) {
    const email = match[0].toLowerCase();
    if (!isSkippedEmail(email)) {
      candidates.push({
        type: 'email',
        value: email,
        confidence: 0.6,
        sourceUrl,
        evidenceSnippet: snippet,
        source: 'serpapi_serp',
      });
    }
  }
  return candidates;
}

function extractPhonesFromSnippet(snippet: string, sourceUrl: string): ContactCandidate[] {
  const phoneRe = /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/g;
  const candidates: ContactCandidate[] = [];
  let match: RegExpExecArray | null;
  while ((match = phoneRe.exec(snippet)) !== null) {
    const digits = normalizePhone(match[0]);
    if (digits.length >= 10 && digits.length <= 11 && !/^(\d)\1{9}$/.test(digits)) {
      candidates.push({
        type: 'phone',
        value: match[0].trim(),
        confidence: 0.55,
        sourceUrl,
        evidenceSnippet: snippet,
        source: 'serpapi_serp',
      });
    }
  }
  return candidates;
}

describe('SERP extraction: cache key normalization', () => {
  it('strips entity suffixes and normalizes', () => {
    expect(normalizeCacheKey('ACME LLC', 'New York, NY'))
      .toBe('serpapi:ACME:NEWYORKNY');
  });

  it('handles empty location', () => {
    const key = normalizeCacheKey('John Smith');
    expect(key).toBe('serpapi:JOHN SMITH:');
  });

  it('strips multiple entity suffixes', () => {
    const key = normalizeCacheKey('THE Big Corp Inc');
    expect(key).toContain('BIG');
    expect(key).not.toContain('INC');
    expect(key).not.toContain('THE');
  });
});

describe('SERP extraction: knowledge graph', () => {
  it('extracts phone from knowledge graph', () => {
    const candidates = extractFromKnowledgeGraph({
      title: 'Acme Realty',
      phone: '(212) 555-1234',
      website: 'https://acmerealty.com',
    }, 'Acme Realty');

    const phones = candidates.filter((c) => c.type === 'phone');
    expect(phones).toHaveLength(1);
    expect(phones[0].value).toBe('(212) 555-1234');
    expect(phones[0].confidence).toBe(0.9);
    expect(phones[0].source).toBe('serpapi_serp');
    expect(phones[0].sourceUrl).toBe('https://acmerealty.com');
  });

  it('extracts email from knowledge graph', () => {
    const candidates = extractFromKnowledgeGraph({
      title: 'Acme Realty',
      email: 'Info@AcmeRealty.com',
    }, 'Acme Realty');

    const emails = candidates.filter((c) => c.type === 'email');
    expect(emails).toHaveLength(1);
    expect(emails[0].value).toBe('info@acmerealty.com');
    expect(emails[0].confidence).toBe(0.9);
  });

  it('skips noreply emails', () => {
    const candidates = extractFromKnowledgeGraph({
      email: 'noreply@acme.com',
    }, 'Acme');
    expect(candidates.filter((c) => c.type === 'email')).toHaveLength(0);
  });

  it('extracts address from knowledge graph', () => {
    const candidates = extractFromKnowledgeGraph({
      title: 'Acme',
      address: '123 Main St, New York, NY 10001',
    }, 'Acme');
    const addrs = candidates.filter((c) => c.type === 'address');
    expect(addrs).toHaveLength(1);
    expect(addrs[0].confidence).toBe(0.85);
  });

  it('handles empty knowledge graph', () => {
    const candidates = extractFromKnowledgeGraph({}, 'Test');
    expect(candidates).toHaveLength(0);
  });
});

describe('SERP extraction: snippet email regex', () => {
  it('extracts email from organic snippet', () => {
    const snippet = 'Contact us at john@acmerealty.com or visit our website';
    const candidates = extractEmailsFromSnippet(snippet, 'https://acmerealty.com/contact');
    expect(candidates).toHaveLength(1);
    expect(candidates[0].value).toBe('john@acmerealty.com');
    expect(candidates[0].confidence).toBe(0.6);
  });

  it('skips system emails in snippet', () => {
    const snippet = 'Email support@company.com or admin@company.com for help';
    const candidates = extractEmailsFromSnippet(snippet, 'https://company.com');
    expect(candidates).toHaveLength(0);
  });

  it('extracts multiple emails', () => {
    const snippet = 'Reach out: alice@firm.com, bob@firm.com';
    const candidates = extractEmailsFromSnippet(snippet, 'https://firm.com');
    expect(candidates).toHaveLength(2);
  });
});

describe('SERP extraction: snippet phone regex', () => {
  it('extracts US phone from snippet', () => {
    const snippet = 'Call us at (212) 555-1234 today';
    const candidates = extractPhonesFromSnippet(snippet, 'https://company.com');
    expect(candidates).toHaveLength(1);
    expect(candidates[0].type).toBe('phone');
    expect(candidates[0].confidence).toBe(0.55);
  });

  it('skips repeated-digit phones', () => {
    const snippet = 'Phone: 111-111-1111';
    const candidates = extractPhonesFromSnippet(snippet, 'https://test.com');
    expect(candidates).toHaveLength(0);
  });

  it('skips too-short numbers', () => {
    const snippet = 'Ref: 555-1234 for info';
    const candidates = extractPhonesFromSnippet(snippet, 'https://test.com');
    expect(candidates).toHaveLength(0);
  });

  it('extracts +1 prefixed phones', () => {
    const snippet = 'Call +1-212-555-9876 for details';
    const candidates = extractPhonesFromSnippet(snippet, 'https://test.com');
    expect(candidates).toHaveLength(1);
  });
});

describe('SERP extraction: email filtering', () => {
  it('skips image-domain emails', () => {
    expect(isSkippedEmail('icon@images.png')).toBe(true);
  });

  it('allows normal domain emails', () => {
    expect(isSkippedEmail('john@company.com')).toBe(false);
  });

  it('skips googleapis domain', () => {
    expect(isSkippedEmail('something@googleapis.com')).toBe(true);
  });

  it('skips w3.org domain', () => {
    expect(isSkippedEmail('spec@w3.org')).toBe(true);
  });
});
