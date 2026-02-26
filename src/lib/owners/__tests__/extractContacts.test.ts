import { describe, it, expect } from 'vitest';
import { extractContactsFromText, isBlockedDomain, BLOCKED_DOMAINS } from '../extractContacts';

describe('extractContactsFromText', () => {
  it('extracts a simple email', () => {
    const text = 'Contact us at john.doe@example.net for more info.';
    const results = extractContactsFromText(text);
    expect(results).toHaveLength(1);
    expect(results[0].type).toBe('email');
    expect(results[0].value).toBe('john.doe@example.net');
    expect(results[0].evidenceSnippet).toContain('john.doe@example.net');
  });

  it('extracts multiple emails and deduplicates', () => {
    const text = 'Email: alice@corp.com or ALICE@CORP.COM or bob@firm.org';
    const results = extractContactsFromText(text);
    const emails = results.filter((r) => r.type === 'email');
    expect(emails).toHaveLength(2);
    expect(emails.map((e) => e.value).sort()).toEqual(['alice@corp.com', 'bob@firm.org']);
  });

  it('skips noreply / system emails', () => {
    const text = 'noreply@company.com support@company.com real.person@company.com';
    const results = extractContactsFromText(text);
    const emails = results.filter((r) => r.type === 'email');
    expect(emails).toHaveLength(1);
    expect(emails[0].value).toBe('real.person@company.com');
  });

  it('skips emails with image-like domains', () => {
    const text = 'icon@images.png user@real-domain.com';
    const results = extractContactsFromText(text);
    const emails = results.filter((r) => r.type === 'email');
    expect(emails).toHaveLength(1);
    expect(emails[0].value).toBe('user@real-domain.com');
  });

  it('extracts US phone numbers in various formats', () => {
    const text = `
      Call (212) 555-1234 or 718.555.6789 or 1-917-555-0001
      Also try +1 646 555 7890
    `;
    const results = extractContactsFromText(text);
    const phones = results.filter((r) => r.type === 'phone');
    expect(phones.length).toBeGreaterThanOrEqual(3);
    const digits = phones.map((p) => p.value.replace(/\D/g, '').replace(/^1(\d{10})$/, '$1'));
    expect(digits).toContain('2125551234');
    expect(digits).toContain('7185556789');
    expect(digits).toContain('9175550001');
  });

  it('deduplicates phone numbers by digits', () => {
    const text = 'Phone: (212) 555-1234 or 212.555.1234 or 2125551234';
    const results = extractContactsFromText(text);
    const phones = results.filter((r) => r.type === 'phone');
    expect(phones).toHaveLength(1);
  });

  it('rejects phone numbers that are all the same digit', () => {
    const text = 'Not a real phone: 1111111111 or (222) 222-2222';
    const results = extractContactsFromText(text);
    const phones = results.filter((r) => r.type === 'phone');
    expect(phones).toHaveLength(0);
  });

  it('rejects short phone numbers with fewer than 10 digits', () => {
    const text = 'Short: 555-1234';
    const results = extractContactsFromText(text);
    const phones = results.filter((r) => r.type === 'phone');
    expect(phones).toHaveLength(0);
  });

  it('returns empty for text with no contacts', () => {
    const text = 'This is a plain text page about NYC real estate development trends in 2025.';
    const results = extractContactsFromText(text);
    expect(results).toHaveLength(0);
  });

  it('includes evidence snippets for all results', () => {
    const text = 'Our office email is manager@building.com and phone is (212) 555-9999.';
    const results = extractContactsFromText(text);
    for (const r of results) {
      expect(r.evidenceSnippet).toBeTruthy();
      expect(r.evidenceSnippet.length).toBeGreaterThan(10);
      expect(r.evidenceSnippet).toContain(r.value.toLowerCase ? r.value : r.value);
    }
  });

  it('truncates evidence snippets for long surrounding text', () => {
    const padding = 'word '.repeat(100);
    const text = `${padding}contact@email.com ${padding}`;
    const results = extractContactsFromText(text);
    expect(results).toHaveLength(1);
    expect(results[0].evidenceSnippet).toContain('contact@email.com');
    expect(results[0].evidenceSnippet.length).toBeLessThan(text.length);
  });

  it('extracts both emails and phones from mixed text', () => {
    const text = 'John Doe: john@doe.com, (347) 555-8888, 123 Main St, Brooklyn NY';
    const results = extractContactsFromText(text);
    const emails = results.filter((r) => r.type === 'email');
    const phones = results.filter((r) => r.type === 'phone');
    expect(emails).toHaveLength(1);
    expect(phones).toHaveLength(1);
  });
});

describe('isBlockedDomain', () => {
  it('blocks linkedin.com', () => {
    expect(isBlockedDomain('https://www.linkedin.com/in/johndoe')).toBe(true);
  });

  it('blocks facebook.com', () => {
    expect(isBlockedDomain('https://facebook.com/page')).toBe(true);
  });

  it('blocks x.com and twitter.com', () => {
    expect(isBlockedDomain('https://x.com/user')).toBe(true);
    expect(isBlockedDomain('https://twitter.com/user')).toBe(true);
  });

  it('allows normal domains', () => {
    expect(isBlockedDomain('https://www.companycorp.com')).toBe(false);
    expect(isBlockedDomain('https://nyc.gov/buildings')).toBe(false);
  });

  it('blocks invalid URLs', () => {
    expect(isBlockedDomain('not-a-url')).toBe(true);
  });

  it('has expected blocked domains', () => {
    expect(BLOCKED_DOMAINS).toContain('linkedin.com');
    expect(BLOCKED_DOMAINS).toContain('facebook.com');
    expect(BLOCKED_DOMAINS).toContain('instagram.com');
  });
});
