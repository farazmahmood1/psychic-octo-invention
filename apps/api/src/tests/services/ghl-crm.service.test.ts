import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  searchContactsMock,
  getContactMock,
  updateContactMock,
  actionLogCreateMock,
} = vi.hoisted(() => ({
  searchContactsMock: vi.fn(),
  getContactMock: vi.fn(),
  updateContactMock: vi.fn(),
  actionLogCreateMock: vi.fn(),
}));

vi.mock('../../integrations/ghl/index.js', () => ({
  searchContacts: searchContactsMock,
  getContact: getContactMock,
  updateContact: updateContactMock,
  GhlApiError: class GhlApiError extends Error {
    constructor(
      message: string,
      public readonly statusCode: number,
      public readonly latencyMs: number,
    ) {
      super(message);
      this.name = 'GhlApiError';
    }
  },
}));

vi.mock('../../repositories/ghl-action-log.repository.js', () => ({
  ghlActionLogRepository: {
    create: actionLogCreateMock,
  },
}));

import { executeGhlTask } from '../../services/subagents/ghl-crm.service.js';

describe('GHL CRM Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actionLogCreateMock.mockResolvedValue({});
  });

  it('resolves a unique contact from query and updates phone when contactId is missing', async () => {
    searchContactsMock.mockResolvedValueOnce({
      contacts: [{ id: 'contact-1', firstName: 'John', lastName: 'Doe', phone: '5550000' }],
      total: 1,
      latencyMs: 12,
    });
    getContactMock.mockResolvedValueOnce({
      id: 'contact-1',
      firstName: 'John',
      lastName: 'Doe',
      phone: '5550000',
      _latencyMs: 9,
    });
    updateContactMock.mockResolvedValueOnce({
      contact: { id: 'contact-1', firstName: 'John', lastName: 'Doe', phone: '5550199' },
      latencyMs: 18,
      statusCode: 200,
    });

    const result = await executeGhlTask({
      action: 'update_contact',
      query: 'John Doe',
      updates: { phone: '555-0199' },
    });

    expect(searchContactsMock).toHaveBeenCalledWith('John Doe');
    expect(getContactMock).toHaveBeenCalledWith('contact-1');
    expect(updateContactMock).toHaveBeenCalledWith('contact-1', { phone: '5550199' });
    expect(result.success).toBe(true);
    expect(result.changedFields?.['phone']).toEqual({ from: '5550000', to: '5550199' });
  });

  it('returns clarification when query resolves to multiple contacts', async () => {
    searchContactsMock.mockResolvedValueOnce({
      contacts: [
        { id: 'contact-1', firstName: 'John', lastName: 'Doe', email: 'john1@example.com' },
        { id: 'contact-2', firstName: 'John', lastName: 'Doe', email: 'john2@example.com' },
      ],
      total: 2,
      latencyMs: 7,
    });

    const result = await executeGhlTask({
      action: 'update_contact',
      query: 'John Doe',
      updates: { phone: '555-0199' },
    });

    expect(result.success).toBe(false);
    expect(result.needsClarification).toBe(true);
    expect(result.candidates).toHaveLength(2);
    expect(updateContactMock).not.toHaveBeenCalled();
  });
});
