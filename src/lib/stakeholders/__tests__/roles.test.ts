import { describe, it, expect } from 'vitest';
import {
  mapAcrisPartyType,
  mapHpdContactType,
  mapDobLicenseType,
  mapDobFilingRole,
} from '../roles';

describe('mapAcrisPartyType', () => {
  it('maps party_type 2 to OWNER', () => {
    expect(mapAcrisPartyType('2')).toBe('OWNER');
  });

  it('maps party_type 1 to SELLER', () => {
    expect(mapAcrisPartyType('1')).toBe('SELLER');
  });

  it('maps unknown types to OTHER', () => {
    expect(mapAcrisPartyType('3')).toBe('OTHER');
    expect(mapAcrisPartyType('')).toBe('OTHER');
  });
});

describe('mapHpdContactType', () => {
  it('maps Agent to MANAGING_AGENT', () => {
    expect(mapHpdContactType('Agent')).toBe('MANAGING_AGENT');
  });

  it('maps SiteManager to MANAGING_AGENT', () => {
    expect(mapHpdContactType('SiteManager')).toBe('MANAGING_AGENT');
  });

  it('maps CorporateOwner to OWNER', () => {
    expect(mapHpdContactType('CorporateOwner')).toBe('OWNER');
  });

  it('maps IndividualOwner to OWNER', () => {
    expect(mapHpdContactType('IndividualOwner')).toBe('OWNER');
  });

  it('maps JointOwner to OWNER', () => {
    expect(mapHpdContactType('JointOwner')).toBe('OWNER');
  });

  it('maps HeadOfficer to OWNER', () => {
    expect(mapHpdContactType('HeadOfficer')).toBe('OWNER');
  });

  it('handles case insensitivity and spaces', () => {
    expect(mapHpdContactType('site manager')).toBe('MANAGING_AGENT');
    expect(mapHpdContactType('AGENT')).toBe('MANAGING_AGENT');
  });

  it('maps unknown types to OTHER', () => {
    expect(mapHpdContactType('Tenant')).toBe('OTHER');
  });
});

describe('mapDobLicenseType', () => {
  it('maps PE to ENGINEER', () => {
    expect(mapDobLicenseType('PE')).toBe('ENGINEER');
  });

  it('maps RA to ARCHITECT', () => {
    expect(mapDobLicenseType('RA')).toBe('ARCHITECT');
  });

  it('maps GC to GC', () => {
    expect(mapDobLicenseType('GC')).toBe('GC');
  });

  it('maps unknown types to OTHER', () => {
    expect(mapDobLicenseType('XX')).toBe('OTHER');
  });
});

describe('mapDobFilingRole', () => {
  it('maps permittee to GC', () => {
    expect(mapDobFilingRole('permittee')).toBe('GC');
  });

  it('maps contractor to GC', () => {
    expect(mapDobFilingRole('contractor_name')).toBe('GC');
  });

  it('maps owner_business to OWNER', () => {
    expect(mapDobFilingRole('owner_business_name')).toBe('OWNER');
  });

  it('maps applicant to APPLICANT', () => {
    expect(mapDobFilingRole('applicant_name')).toBe('APPLICANT');
  });

  it('maps unknown fields to OTHER', () => {
    expect(mapDobFilingRole('random_field')).toBe('OTHER');
  });
});
