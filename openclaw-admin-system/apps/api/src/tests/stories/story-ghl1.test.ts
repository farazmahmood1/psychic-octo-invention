/**
 * STORY-GHL1: GHL contact update flow.
 * Tests the sub-agent input validation, ambiguous match handling,
 * and field update logic.
 */
import { describe, it, expect } from 'vitest';
import { GHL_EDITABLE_FIELDS } from '@openclaw/shared';
import {
  createGhlContact,
  createGhlSearchResult,
  createAmbiguousGhlSearchResult,
} from '../fixtures/ghl.fixture.js';

describe('STORY-GHL1: GHL contact update flow', () => {
  describe('Editable fields validation', () => {
    it('allows all defined editable fields', () => {
      const contact = createGhlContact();
      for (const field of GHL_EDITABLE_FIELDS) {
        expect(contact).toHaveProperty(field);
      }
    });

    it('has exactly the expected editable fields', () => {
      expect(GHL_EDITABLE_FIELDS).toEqual([
        'firstName', 'lastName', 'email', 'phone',
        'address1', 'city', 'state', 'postalCode',
        'website', 'tags',
      ]);
    });
  });

  describe('Search result handling', () => {
    it('single match returns contact directly', () => {
      const result = createGhlSearchResult();
      expect(result.contacts).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.contacts[0].firstName).toBe('Ahmed');
    });

    it('ambiguous match returns multiple candidates for clarification', () => {
      const result = createAmbiguousGhlSearchResult();
      expect(result.contacts.length).toBeGreaterThan(1);
      expect(result.total).toBe(3);

      // Verify distinct IDs
      const ids = result.contacts.map((c) => c.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('empty search returns no contacts', () => {
      const result = createGhlSearchResult([]);
      expect(result.contacts).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  describe('Field update validation', () => {
    it('detects unchanged fields (skip notification)', () => {
      const contact = createGhlContact({ email: 'ahmed@example.com' });
      const updates = { email: 'ahmed@example.com' };

      const changedFields: Record<string, { from: unknown; to: unknown }> = {};
      for (const [key, newVal] of Object.entries(updates)) {
        const currentVal = (contact as any)[key];
        if (currentVal !== newVal) {
          changedFields[key] = { from: currentVal, to: newVal };
        }
      }

      expect(Object.keys(changedFields)).toHaveLength(0);
    });

    it('tracks field changes correctly', () => {
      const contact = createGhlContact({ phone: '+15551234567' });
      const updates = { phone: '+15559876543' };

      const changedFields: Record<string, { from: unknown; to: unknown }> = {};
      for (const [key, newVal] of Object.entries(updates)) {
        const currentVal = (contact as any)[key];
        if (currentVal !== newVal) {
          changedFields[key] = { from: currentVal, to: newVal };
        }
      }

      expect(changedFields.phone).toEqual({
        from: '+15551234567',
        to: '+15559876543',
      });
    });

    it('rejects non-editable fields', () => {
      const nonEditable = ['id', 'source', 'dateAdded', 'dateUpdated', 'customField'];
      for (const field of nonEditable) {
        expect(GHL_EDITABLE_FIELDS).not.toContain(field);
      }
    });
  });
});
