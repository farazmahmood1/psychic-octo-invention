import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  sendEmailMock,
  buildReferencesHeaderMock,
  ensureReplySubjectMock,
  findByConversationIdMock,
  createEmailMessageMock,
  upsertMock,
  findUniqueMock,
  updateMock,
} = vi.hoisted(() => ({
  sendEmailMock: vi.fn(),
  buildReferencesHeaderMock: vi.fn(),
  ensureReplySubjectMock: vi.fn(),
  findByConversationIdMock: vi.fn(),
  createEmailMessageMock: vi.fn(),
  upsertMock: vi.fn(),
  findUniqueMock: vi.fn(),
  updateMock: vi.fn(),
}));

vi.mock('../../integrations/email/index.js', () => ({
  sendEmail: sendEmailMock,
  buildReferencesHeader: buildReferencesHeaderMock,
  ensureReplySubject: ensureReplySubjectMock,
}));

vi.mock('../../repositories/email-thread.repository.js', () => ({
  emailThreadRepository: {
    findByConversationId: findByConversationIdMock,
    createEmailMessage: createEmailMessageMock,
    upsert: upsertMock,
  },
}));

vi.mock('../../db/client.js', () => ({
  prisma: {
    message: {
      findUnique: findUniqueMock,
      update: updateMock,
    },
  },
}));

import { deliverToEmail } from '../../services/channels/email.delivery.js';

describe('Email Delivery Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureReplySubjectMock.mockImplementation((subject: string) => `Re: ${subject}`);
    buildReferencesHeaderMock.mockImplementation((existing: string, current: string) => `${existing} ${current}`.trim());
    findByConversationIdMock.mockResolvedValue({
      id: 'thread-1',
      subject: 'Need help with my invoice',
      threadId: '<root-msg@example.com>',
      fromAddress: 'client@example.com',
      toAddresses: ['resend@forrof.io'],
      emailMessages: [
        {
          providerEmailId: '<client-msg@example.com>',
        },
      ],
    });
    sendEmailMock.mockResolvedValue({
      success: true,
      providerMessageId: '<reply-msg@example.com>',
      error: null,
    });
    findUniqueMock.mockResolvedValue({ metadata: null });
    updateMock.mockResolvedValue({});
    createEmailMessageMock.mockResolvedValue({});
    upsertMock.mockResolvedValue({});
  });

  it('preserves the inbound alias as reply-to and keeps thread recipients stable', async () => {
    const result = await deliverToEmail(
      'conv-1',
      'msg-1',
      'Here is the breakdown.',
    );

    expect(result.success).toBe(true);
    expect(sendEmailMock).toHaveBeenCalledWith({
      to: ['client@example.com'],
      cc: undefined,
      subject: 'Re: Need help with my invoice',
      textBody: 'Here is the breakdown.',
      replyTo: 'resend@forrof.io',
      inReplyTo: '<client-msg@example.com>',
      references: '<root-msg@example.com> <client-msg@example.com>',
    });

    expect(createEmailMessageMock).toHaveBeenCalledWith(expect.objectContaining({
      messageId: 'msg-1',
      providerEmailId: '<reply-msg@example.com>',
      fromAddress: 'noreply@nexclaw.dev',
      toAddresses: ['client@example.com'],
      headers: expect.objectContaining({
        'Reply-To': 'resend@forrof.io',
      }),
    }));

    expect(upsertMock).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: 'conv-1',
      fromAddress: 'client@example.com',
      toAddresses: ['resend@forrof.io'],
    }));
  });
});
