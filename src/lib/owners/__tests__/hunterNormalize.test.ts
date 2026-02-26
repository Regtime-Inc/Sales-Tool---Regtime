import { describe, it, expect } from 'vitest';

function extractDomain(urlOrDomain: string): string | null {
  let input = urlOrDomain.trim();
  if (!input) return null;
  if (!input.includes('://')) input = 'https://' + input;
  try {
    let hostname = new URL(input).hostname.toLowerCase();
    hostname = hostname.replace(/^www\./, '');
    if (!hostname.includes('.')) return null;
    return hostname;
  } catch {
    const cleaned = urlOrDomain.toLowerCase().replace(/^www\./, '').trim();
    if (/^[a-z0-9.-]+\.[a-z]{2,}$/.test(cleaned)) return cleaned;
    return null;
  }
}

function normalizePersonName(fullName: string): { firstName?: string; lastName?: string } {
  const trimmed = fullName.trim();
  if (!trimmed) return {};
  if (trimmed.includes(',')) {
    const parts = trimmed.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      return { firstName: parts[1].split(/\s+/)[0], lastName: parts[0] };
    }
  }
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length === 1) return { lastName: tokens[0] };
  return { firstName: tokens[0], lastName: tokens[tokens.length - 1] };
}

function normalizeCacheKey(ownerName: string, domain: string): string {
  const name = ownerName
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, '')
    .replace(/\b(LLC|INC|CORP|LTD|LP|CO|THE|PLLC|LLP)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return `hunter:${domain.toLowerCase()}:${name}`;
}

interface HunterCandidate {
  email: string;
  confidence: number;
  firstName?: string;
  lastName?: string;
  position?: string;
  source: string;
  evidenceSnippet: string;
}

function candidatesFromDomainSearch(
  emails: Array<{
    value?: string;
    confidence?: number;
    first_name?: string;
    last_name?: string;
    position?: string;
    sources?: Array<{ uri?: string }>;
  }>,
  domain: string
): HunterCandidate[] {
  return emails
    .filter((e) => e.value)
    .map((e) => ({
      email: e.value!.toLowerCase(),
      confidence: Math.round(((e.confidence ?? 50) / 100) * 100) / 100,
      firstName: e.first_name || undefined,
      lastName: e.last_name || undefined,
      position: e.position || undefined,
      source: 'hunter_domain_search',
      evidenceSnippet: `domain_search: email=${e.value}, score=${e.confidence ?? '?'}, position=${e.position || 'unknown'}, sources=${e.sources?.length ?? 0}`,
    }));
}

describe('Hunter: extractDomain', () => {
  it('extracts domain from full URL', () => {
    expect(extractDomain('https://www.acmerealty.com/about')).toBe('acmerealty.com');
  });

  it('extracts domain from URL without protocol', () => {
    expect(extractDomain('www.acmerealty.com')).toBe('acmerealty.com');
  });

  it('extracts bare domain', () => {
    expect(extractDomain('acmerealty.com')).toBe('acmerealty.com');
  });

  it('handles http protocol', () => {
    expect(extractDomain('http://example.org')).toBe('example.org');
  });

  it('strips www prefix', () => {
    expect(extractDomain('www.test.io')).toBe('test.io');
  });

  it('returns null for empty string', () => {
    expect(extractDomain('')).toBeNull();
  });

  it('returns null for invalid input', () => {
    expect(extractDomain('not a domain')).toBeNull();
  });

  it('handles subdomains', () => {
    expect(extractDomain('https://portal.company.co.uk/path')).toBe('portal.company.co.uk');
  });

  it('lowercases domain', () => {
    expect(extractDomain('HTTPS://WWW.UPPERCASE.COM')).toBe('uppercase.com');
  });
});

describe('Hunter: normalizePersonName', () => {
  it('splits "FIRST LAST"', () => {
    expect(normalizePersonName('John Smith')).toEqual({
      firstName: 'John',
      lastName: 'Smith',
    });
  });

  it('handles "LAST, FIRST" format', () => {
    expect(normalizePersonName('Smith, John')).toEqual({
      firstName: 'John',
      lastName: 'Smith',
    });
  });

  it('handles "LAST, FIRST MIDDLE" format', () => {
    const result = normalizePersonName('Smith, John Robert');
    expect(result.firstName).toBe('John');
    expect(result.lastName).toBe('Smith');
  });

  it('handles single name', () => {
    expect(normalizePersonName('Madonna')).toEqual({
      lastName: 'Madonna',
    });
  });

  it('handles three-part name', () => {
    const result = normalizePersonName('John Robert Smith');
    expect(result.firstName).toBe('John');
    expect(result.lastName).toBe('Smith');
  });

  it('returns empty for empty string', () => {
    expect(normalizePersonName('')).toEqual({});
  });

  it('trims whitespace', () => {
    expect(normalizePersonName('  Jane Doe  ')).toEqual({
      firstName: 'Jane',
      lastName: 'Doe',
    });
  });
});

describe('Hunter: cache key normalization', () => {
  it('prefixes with hunter and domain', () => {
    const key = normalizeCacheKey('Acme LLC', 'acme.com');
    expect(key).toBe('hunter:acme.com:ACME');
  });

  it('strips entity suffixes', () => {
    const key = normalizeCacheKey('Big Corp Inc', 'bigcorp.com');
    expect(key).toContain('BIG');
    expect(key).not.toContain('INC');
  });

  it('lowercases domain', () => {
    const key = normalizeCacheKey('Test', 'EXAMPLE.COM');
    expect(key).toBe('hunter:example.com:TEST');
  });
});

describe('Hunter: candidatesFromDomainSearch', () => {
  it('maps Hunter emails to candidates', () => {
    const emails = [
      {
        value: 'CEO@acme.com',
        confidence: 95,
        first_name: 'John',
        last_name: 'Doe',
        position: 'CEO',
        sources: [{ uri: 'https://acme.com/about' }],
      },
    ];
    const candidates = candidatesFromDomainSearch(emails, 'acme.com');
    expect(candidates).toHaveLength(1);
    expect(candidates[0].email).toBe('ceo@acme.com');
    expect(candidates[0].confidence).toBe(0.95);
    expect(candidates[0].firstName).toBe('John');
    expect(candidates[0].position).toBe('CEO');
    expect(candidates[0].source).toBe('hunter_domain_search');
  });

  it('handles missing confidence', () => {
    const candidates = candidatesFromDomainSearch(
      [{ value: 'test@test.com' }],
      'test.com'
    );
    expect(candidates[0].confidence).toBe(0.5);
  });

  it('skips entries without email', () => {
    const candidates = candidatesFromDomainSearch(
      [{ confidence: 80, first_name: 'Jane' }],
      'test.com'
    );
    expect(candidates).toHaveLength(0);
  });

  it('generates deterministic evidence snippet', () => {
    const candidates = candidatesFromDomainSearch(
      [{ value: 'a@b.com', confidence: 75, position: 'CTO', sources: [{ uri: 'https://b.com' }, { uri: 'https://c.com' }] }],
      'b.com'
    );
    expect(candidates[0].evidenceSnippet).toBe(
      'domain_search: email=a@b.com, score=75, position=CTO, sources=2'
    );
  });

  it('handles multiple emails', () => {
    const emails = [
      { value: 'a@test.com', confidence: 90 },
      { value: 'b@test.com', confidence: 80 },
      { value: 'c@test.com', confidence: 70 },
    ];
    const candidates = candidatesFromDomainSearch(emails, 'test.com');
    expect(candidates).toHaveLength(3);
    expect(candidates.map((c) => c.confidence)).toEqual([0.9, 0.8, 0.7]);
  });
});
