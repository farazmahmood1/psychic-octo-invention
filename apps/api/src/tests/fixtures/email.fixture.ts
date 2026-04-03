/**
 * Realistic inbound email webhook payload fixtures.
 */
import type { InboundEmailPayload } from '@nexclaw/shared';

export function createInboundEmailPayload(overrides: Partial<InboundEmailPayload> = {}): InboundEmailPayload {
  return {
    from: 'client@example.com',
    fromName: 'Jane Client',
    to: ['support@nexclaw.dev'],
    subject: 'Need help with my invoice',
    messageId: '<msg-001@example.com>',
    textBody: 'Hi, I need help understanding my latest invoice. Can you break down the charges?',
    timestamp: new Date().toISOString(),
    headers: {
      'message-id': '<msg-001@example.com>',
      'date': new Date().toUTCString(),
    },
    ...overrides,
  };
}

export function createThreadedEmailPayload(): InboundEmailPayload {
  return {
    from: 'client@example.com',
    to: ['support@nexclaw.dev'],
    subject: 'Re: Need help with my invoice',
    messageId: '<msg-002@example.com>',
    inReplyTo: '<msg-001@example.com>',
    references: '<msg-001@example.com>',
    textBody: 'Thanks for the breakdown. One more question — what is the "platform fee"?',
    timestamp: new Date().toISOString(),
  };
}

export function createForwardedEmailPayload(): InboundEmailPayload {
  return {
    from: 'colleague@example.com',
    to: ['support@nexclaw.dev'],
    subject: 'Fwd: Client complaint',
    messageId: '<msg-003@example.com>',
    textBody: `
---------- Forwarded message ----------
From: angry-client@example.com
Date: Mon, 3 Mar 2026 10:00:00 +0000
Subject: Complaint about service
To: colleague@example.com

I am very unhappy with the service quality. Please address this immediately.
`.trim(),
    timestamp: new Date().toISOString(),
  };
}

export function createHtmlOnlyEmailPayload(): InboundEmailPayload {
  return {
    from: 'marketing@example.com',
    to: ['support@nexclaw.dev'],
    subject: 'HTML-only email',
    messageId: '<msg-004@example.com>',
    htmlBody: '<html><body><p>This is an <strong>HTML-only</strong> email.</p></body></html>',
    timestamp: new Date().toISOString(),
  };
}

export const EMAIL_WEBHOOK_SECRET = 'test-email-webhook-secret';
