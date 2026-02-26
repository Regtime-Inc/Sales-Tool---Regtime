import { describe, it, expect } from 'vitest';
import { reconcileStakeholders, applyLicenseEnrichment } from '../reconcile';
import type { StakeholderRecord } from '../../../types/stakeholders';

function makeRecord(overrides: Partial<StakeholderRecord> = {}): StakeholderRecord {
  return {
    role: 'OWNER',
    name: 'TEST ENTITY LLC',
    confidence: 0.80,
    provenance: [{
      sourceSystem: 'ACRIS_GRANTEE',
      datasetId: 'test',
      recordKey: 'doc123',
      fieldsUsed: ['name'],
      timestamp: '2026-01-01T00:00:00Z',
    }],
    ...overrides,
  };
}

describe('reconcileStakeholders', () => {
  it('returns empty for empty input', () => {
    expect(reconcileStakeholders([])).toEqual([]);
  });

  it('merges entries with same name and role', () => {
    const a = makeRecord({ name: 'ABC HOLDINGS LLC' });
    const b = makeRecord({
      name: 'ABC HOLDINGS LLC',
      provenance: [{
        sourceSystem: 'PLUTO',
        datasetId: 'pluto',
        recordKey: 'bbl123',
        fieldsUsed: ['ownername'],
        timestamp: '2026-01-01T00:00:00Z',
      }],
    });
    const result = reconcileStakeholders([a, b]);
    expect(result.length).toBe(1);
    expect(result[0].provenance.length).toBe(2);
  });

  it('keeps entries with same name but different roles separate', () => {
    const owner = makeRecord({ name: 'JOHN SMITH', role: 'OWNER' });
    const seller = makeRecord({ name: 'JOHN SMITH', role: 'SELLER' });
    const result = reconcileStakeholders([owner, seller]);
    expect(result.length).toBe(2);
  });

  it('does not merge entries with low name similarity', () => {
    const a = makeRecord({ name: 'ABC HOLDINGS LLC' });
    const b = makeRecord({ name: 'XYZ PARTNERS LP' });
    const result = reconcileStakeholders([a, b]);
    expect(result.length).toBe(2);
  });

  it('merges contacts from multiple sources', () => {
    const a = makeRecord({
      name: 'ABC LLC',
      contacts: { phones: [{ raw: '212-555-0100', confidence: 0.80 }], emails: [] },
    });
    const b = makeRecord({
      name: 'ABC LLC',
      contacts: { phones: [], emails: [{ email: 'test@example.com', confidence: 0.90 }] },
      provenance: [{
        sourceSystem: 'HPD_CONTACTS',
        datasetId: 'hpd',
        recordKey: 'reg1',
        fieldsUsed: ['email'],
        timestamp: '2026-01-01T00:00:00Z',
      }],
    });
    const result = reconcileStakeholders([a, b]);
    expect(result.length).toBe(1);
    expect(result[0].contacts?.phones.length).toBe(1);
    expect(result[0].contacts?.emails.length).toBe(1);
  });

  it('merges addresses and keeps highest confidence', () => {
    const a = makeRecord({
      name: 'ABC LLC',
      addresses: [{ line1: '123 Main St', city: 'NY', state: 'NY', zip: '10001', source: 'ACRIS', confidence: 0.50 }],
    });
    const b = makeRecord({
      name: 'ABC LLC',
      addresses: [{ line1: '123 Main St', city: 'NY', state: 'NY', zip: '10001', source: 'HPD', confidence: 0.90 }],
      provenance: [{
        sourceSystem: 'HPD_CONTACTS',
        datasetId: 'hpd',
        recordKey: 'reg1',
        fieldsUsed: ['address'],
        timestamp: '2026-01-01T00:00:00Z',
      }],
    });
    const result = reconcileStakeholders([a, b]);
    expect(result.length).toBe(1);
    expect(result[0].addresses?.length).toBe(1);
    expect(result[0].addresses![0].confidence).toBe(0.90);
  });

  it('sorts results by confidence descending', () => {
    const low = makeRecord({ name: 'LOW CONF ENTITY', role: 'GC', confidence: 0.50 });
    const high = makeRecord({
      name: 'HIGH CONF ENTITY', role: 'OWNER',
      provenance: [{
        sourceSystem: 'DOB_LICENSE_INFO',
        datasetId: 'dob',
        recordKey: 'lic1',
        fieldsUsed: ['license_nbr'],
        timestamp: '2026-01-01T00:00:00Z',
      }],
    });
    const result = reconcileStakeholders([low, high]);
    expect(result[0].name).toBe('HIGH CONF ENTITY');
  });

  it('skips entries with empty names', () => {
    const empty = makeRecord({ name: '   ' });
    const valid = makeRecord({ name: 'VALID NAME' });
    const result = reconcileStakeholders([empty, valid]);
    expect(result.length).toBe(1);
    expect(result[0].name).toBe('VALID NAME');
  });

  it('creates OWNER stakeholder from individual ownerName (not just business name)', () => {
    const entry = makeRecord({
      name: 'Karan Zoria',
      role: 'OWNER',
      provenance: [{
        sourceSystem: 'DOB_FILING',
        datasetId: 'w9ak-ipjd',
        recordKey: 'Q01183635-P4',
        fieldsUsed: ['owner_first_name', 'owner_last_name'],
        timestamp: '2026-02-25T00:00:00Z',
      }],
    });
    const result = reconcileStakeholders([entry]);
    expect(result.length).toBe(1);
    expect(result[0].role).toBe('OWNER');
    expect(result[0].name).toBe('Karan Zoria');
  });

  it('populates stakeholder address from DOB filing ownerAddress', () => {
    const entry = makeRecord({
      name: 'Karan Zoria',
      role: 'OWNER',
      addresses: [{ line1: '217-22 Northern Blvd, BAYSIDE, NY, 11361', source: 'DOB_FILING', confidence: 0.70 }],
      provenance: [{
        sourceSystem: 'DOB_FILING',
        datasetId: 'w9ak-ipjd',
        recordKey: 'Q01183635-P4',
        fieldsUsed: ['owner_address'],
        timestamp: '2026-02-25T00:00:00Z',
      }],
    });
    const result = reconcileStakeholders([entry]);
    expect(result.length).toBe(1);
    expect(result[0].addresses?.length).toBe(1);
    expect(result[0].addresses![0].line1).toContain('217-22 Northern Blvd');
  });

  it('populates stakeholder email from DOB filing ownerEmail', () => {
    const entry = makeRecord({
      name: 'Karan Zoria',
      role: 'OWNER',
      contacts: {
        phones: [{ raw: '5168499702', confidence: 0.75 }],
        emails: [{ email: 'KARANSZORIA@GMAIL.COM', confidence: 0.80 }],
      },
      provenance: [{
        sourceSystem: 'DOB_FILING',
        datasetId: 'w9ak-ipjd',
        recordKey: 'Q01183635-P4',
        fieldsUsed: ['owner_email', 'owner_phone'],
        timestamp: '2026-02-25T00:00:00Z',
      }],
    });
    const result = reconcileStakeholders([entry]);
    expect(result.length).toBe(1);
    expect(result[0].contacts?.emails.length).toBe(1);
    expect(result[0].contacts?.emails[0].email).toBe('KARANSZORIA@GMAIL.COM');
    expect(result[0].contacts?.phones.length).toBe(1);
    expect(result[0].contacts?.phones[0].raw).toBe('5168499702');
  });

  it('deduplicates emails by lowercase match when merging', () => {
    const a = makeRecord({
      name: 'Karan Zoria',
      role: 'OWNER',
      contacts: { phones: [], emails: [{ email: 'karanszoria@gmail.com', confidence: 0.70 }] },
    });
    const b = makeRecord({
      name: 'Karan Zoria',
      role: 'OWNER',
      contacts: { phones: [], emails: [{ email: 'KARANSZORIA@GMAIL.COM', confidence: 0.90 }] },
      provenance: [{
        sourceSystem: 'DOB_FILING',
        datasetId: 'w9ak-ipjd',
        recordKey: 'Q01183635-P4',
        fieldsUsed: ['owner_email'],
        timestamp: '2026-02-25T00:00:00Z',
      }],
    });
    const result = reconcileStakeholders([a, b]);
    expect(result.length).toBe(1);
    expect(result[0].contacts?.emails.length).toBe(1);
    expect(result[0].contacts?.emails[0].confidence).toBe(0.90);
  });

  it('creates APPLICANT from pre-joined applicantName string', () => {
    const entry = makeRecord({
      name: 'John Smith',
      role: 'APPLICANT',
      provenance: [{
        sourceSystem: 'DOB_FILING',
        datasetId: 'w9ak-ipjd',
        recordKey: 'Q01183635-P4',
        fieldsUsed: ['applicant_first_name', 'applicant_last_name'],
        timestamp: '2026-02-25T00:00:00Z',
      }],
    });
    const result = reconcileStakeholders([entry]);
    expect(result.length).toBe(1);
    expect(result[0].role).toBe('APPLICANT');
    expect(result[0].name).toBe('John Smith');
  });

  it('merges individual owner with business name from different sources', () => {
    const personEntry = makeRecord({
      name: 'Karan Zoria',
      role: 'OWNER',
      contacts: { phones: [{ raw: '5168499702', confidence: 0.75 }], emails: [{ email: 'KARANSZORIA@GMAIL.COM', confidence: 0.80 }] },
      provenance: [{
        sourceSystem: 'DOB_FILING',
        datasetId: 'w9ak-ipjd',
        recordKey: 'Q01183635-P4',
        fieldsUsed: ['owner_first_name', 'owner_last_name', 'owner_email', 'owner_phone'],
        timestamp: '2026-02-25T00:00:00Z',
      }],
    });
    const bizEntry = makeRecord({
      name: 'ZORIA HOLDINGS LLC',
      role: 'OWNER',
      provenance: [{
        sourceSystem: 'PLUTO',
        datasetId: 'pluto',
        recordKey: 'bbl123',
        fieldsUsed: ['ownername'],
        timestamp: '2026-02-25T00:00:00Z',
      }],
    });
    const result = reconcileStakeholders([personEntry, bizEntry]);
    expect(result.length).toBe(2);
    const karan = result.find(r => r.name === 'Karan Zoria');
    expect(karan).toBeDefined();
    expect(karan!.contacts?.emails[0].email).toBe('KARANSZORIA@GMAIL.COM');
  });
});

describe('applyLicenseEnrichment', () => {
  it('fills in phone and email from license records', () => {
    const stakeholders: StakeholderRecord[] = [
      makeRecord({
        name: 'ARCH FIRM',
        role: 'ARCHITECT',
        license: { type: 'RA', number: 'LIC123', source: 'DOB_FILING' },
      }),
    ];
    const licenseRecords = [{
      licenseNumber: 'LIC123',
      businessPhone: '212-555-9999',
      businessEmail: 'arch@firm.com',
      status: 'ACTIVE',
      provenance: {
        sourceSystem: 'DOB_LICENSE_INFO',
        datasetId: 'dob-lic',
        recordKey: 'LIC123',
        fieldsUsed: ['business_phone', 'business_email'],
        timestamp: '2026-01-01T00:00:00Z',
      },
    }];
    const result = applyLicenseEnrichment(stakeholders, licenseRecords);
    expect(result[0].contacts?.phones.length).toBe(1);
    expect(result[0].contacts?.phones[0].raw).toBe('212-555-9999');
    expect(result[0].contacts?.emails.length).toBe(1);
    expect(result[0].contacts?.emails[0].email).toBe('arch@firm.com');
    expect(result[0].license?.source).toBe('DOB_LICENSE_INFO');
    expect(result[0].license?.status).toBe('ACTIVE');
  });

  it('boosts confidence on enrichment', () => {
    const stakeholders: StakeholderRecord[] = [
      makeRecord({
        name: 'ENG FIRM',
        role: 'ENGINEER',
        confidence: 0.75,
        license: { type: 'PE', number: 'PE456', source: 'DOB_FILING' },
      }),
    ];
    const licenseRecords = [{
      licenseNumber: 'PE456',
      businessPhone: '718-555-1234',
      provenance: {
        sourceSystem: 'DOB_LICENSE_INFO',
        datasetId: 'dob-lic',
        recordKey: 'PE456',
        fieldsUsed: ['business_phone'],
        timestamp: '2026-01-01T00:00:00Z',
      },
    }];
    const result = applyLicenseEnrichment(stakeholders, licenseRecords);
    expect(result[0].confidence).toBe(0.90);
  });

  it('returns unchanged stakeholders when no matching license', () => {
    const stakeholders: StakeholderRecord[] = [
      makeRecord({ name: 'NO LICENSE' }),
    ];
    const result = applyLicenseEnrichment(stakeholders, []);
    expect(result).toEqual(stakeholders);
  });
});
