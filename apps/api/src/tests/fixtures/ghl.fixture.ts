/**
 * Realistic GHL CRM response fixtures.
 */
import type { GhlContact, GhlContactSearchResult } from '@nexclaw/shared';

export function createGhlContact(overrides: Partial<GhlContact> = {}): GhlContact {
  return {
    id: 'ghl-contact-001',
    firstName: 'Ahmed',
    lastName: 'Khan',
    name: 'Ahmed Khan',
    email: 'ahmed@example.com',
    phone: '+15551234567',
    address1: '123 Main St',
    city: 'Toronto',
    state: 'ON',
    postalCode: 'M5V 2A8',
    website: 'https://ahmed-khan.example.com',
    tags: ['vip', 'active'],
    source: 'website',
    dateAdded: '2025-01-15T10:00:00Z',
    dateUpdated: '2026-02-20T14:30:00Z',
    ...overrides,
  };
}

export function createGhlSearchResult(contacts: GhlContact[] = [createGhlContact()]): GhlContactSearchResult {
  return {
    contacts,
    total: contacts.length,
  };
}

export function createAmbiguousGhlSearchResult(): GhlContactSearchResult {
  return {
    contacts: [
      createGhlContact({ id: 'ghl-1', firstName: 'Ahmed', lastName: 'Khan', email: 'ahmed.k@example.com' }),
      createGhlContact({ id: 'ghl-2', firstName: 'Ahmed', lastName: 'Khanal', email: 'ahmed.kh@example.com' }),
      createGhlContact({ id: 'ghl-3', firstName: 'Ahmad', lastName: 'Khan', email: 'ahmad@example.com' }),
    ],
    total: 3,
  };
}
