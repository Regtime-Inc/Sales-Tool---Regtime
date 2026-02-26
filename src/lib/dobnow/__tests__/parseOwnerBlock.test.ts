import { describe, it, expect } from 'vitest';
import { parseOwnerBlock, ownerContactDisplayName } from '../parseOwnerBlock';

const FULL_BLOCK = `Owner Type  Individual
First Name*  Karan
Middle Initial  S
Last Name*  Zoria
Business Name  Not Applicable
Title  Not Applicable
Email*  KARANSZORIA@GMAIL.COM
Telephone Number*  5168499702
Street Address  217-22 Northern Blvd
City  BAYSIDE
State  NY
Zip  11361`;

describe('parseOwnerBlock', () => {
  it('parses a full DOB NOW owner block', () => {
    const result = parseOwnerBlock(FULL_BLOCK, 'Q01183635-P4');
    expect(result.ownerType).toBe('Individual');
    expect(result.firstName).toBe('Karan');
    expect(result.middleInitial).toBe('S');
    expect(result.lastName).toBe('Zoria');
    expect(result.businessName).toBeNull();
    expect(result.title).toBeNull();
    expect(result.email).toBe('KARANSZORIA@GMAIL.COM');
    expect(result.phone).toBe('5168499702');
    expect(result.addressLine1).toBe('217-22 Northern Blvd');
    expect(result.city).toBe('BAYSIDE');
    expect(result.state).toBe('NY');
    expect(result.zip).toBe('11361');
    expect(result.source).toBe('dobnow_manual_import');
    expect(result.evidence[0].jobNumber).toBe('Q01183635-P4');
  });

  it('parses colon-delimited format', () => {
    const text = `First Name: John
Last Name: Doe
Email: john@example.com
Telephone Number: (212) 555-0123
Business Name: DOE HOLDINGS LLC`;
    const result = parseOwnerBlock(text, 'X001');
    expect(result.firstName).toBe('John');
    expect(result.lastName).toBe('Doe');
    expect(result.email).toBe('john@example.com');
    expect(result.phone).toBe('2125550123');
    expect(result.businessName).toBe('DOE HOLDINGS LLC');
  });

  it('treats "Not Applicable" as null', () => {
    const text = `First Name: Jane
Last Name: Smith
Business Name: Not Applicable
Email: N/A`;
    const result = parseOwnerBlock(text, 'X002');
    expect(result.firstName).toBe('Jane');
    expect(result.lastName).toBe('Smith');
    expect(result.businessName).toBeNull();
    expect(result.email).toBeNull();
  });

  it('strips asterisks from labels', () => {
    const text = `First Name*: Alice
Email*: alice@test.com`;
    const result = parseOwnerBlock(text, 'X003');
    expect(result.firstName).toBe('Alice');
    expect(result.email).toBe('alice@test.com');
  });

  it('extracts email from unstructured text via regex fallback', () => {
    const text = `Some random text with contact@example.org embedded in it.`;
    const result = parseOwnerBlock(text, 'X004');
    expect(result.email).toBe('contact@example.org');
  });

  it('extracts phone from unstructured text via regex fallback', () => {
    const text = `Call me at 917-555-1234 for details.`;
    const result = parseOwnerBlock(text, 'X005');
    expect(result.phone).toBe('9175551234');
  });

  it('returns all nulls for empty text', () => {
    const result = parseOwnerBlock('', 'X006');
    expect(result.firstName).toBeNull();
    expect(result.lastName).toBeNull();
    expect(result.email).toBeNull();
    expect(result.phone).toBeNull();
    expect(result.source).toBe('dobnow_manual_import');
  });

  it('handles tab-separated label-value pairs', () => {
    const text = "Owner Type\tIndividual\nFirst Name\tBob\nLast Name\tJones";
    const result = parseOwnerBlock(text, 'X007');
    expect(result.ownerType).toBe('Individual');
    expect(result.firstName).toBe('Bob');
    expect(result.lastName).toBe('Jones');
  });

  it('handles mixed formats in same block', () => {
    const text = `Owner Type  Corporation
Business Name  METRO DEVELOPMENT LLC
Email: info@metrodev.com
Telephone Number  2125559999
Street Address: 100 Broadway
City  NEW YORK
State: NY
Zip  10005`;
    const result = parseOwnerBlock(text, 'X008');
    expect(result.ownerType).toBe('Corporation');
    expect(result.businessName).toBe('METRO DEVELOPMENT LLC');
    expect(result.email).toBe('info@metrodev.com');
    expect(result.phone).toBe('2125559999');
    expect(result.addressLine1).toBe('100 Broadway');
    expect(result.city).toBe('NEW YORK');
    expect(result.zip).toBe('10005');
  });
});

describe('ownerContactDisplayName', () => {
  it('returns person name when available', () => {
    const result = parseOwnerBlock(FULL_BLOCK, 'Q01183635-P4');
    expect(ownerContactDisplayName(result)).toBe('Karan S Zoria');
  });

  it('falls back to business name', () => {
    const text = `Business Name: METRO LLC`;
    const result = parseOwnerBlock(text, 'X009');
    expect(ownerContactDisplayName(result)).toBe('METRO LLC');
  });

  it('returns null when nothing available', () => {
    const result = parseOwnerBlock('', 'X010');
    expect(ownerContactDisplayName(result)).toBeNull();
  });
});
