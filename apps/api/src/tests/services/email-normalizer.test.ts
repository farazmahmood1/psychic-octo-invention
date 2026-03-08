import { describe, it, expect } from 'vitest';
import { normalizeInboundEmail } from '../../integrations/email/normalizer.js';
import {
  createInboundEmailPayload,
  createThreadedEmailPayload,
  createForwardedEmailPayload,
} from '../fixtures/email.fixture.js';

describe('Email Normalizer - T2 threading behavior', () => {
  it('uses root reference as external thread ID for threaded replies', () => {
    const payload = createThreadedEmailPayload();
    const event = normalizeInboundEmail(payload);

    expect(event).not.toBeNull();
    expect(event!.externalThreadId).toBe('<msg-001@example.com>');
    expect(event!.metadata['emailInReplyTo']).toBe('<msg-001@example.com>');
    expect(event!.text).toContain('Subject: Re: Need help with my invoice');
  });

  it('keeps forwarded message context in metadata and orchestration text', () => {
    const payload = createForwardedEmailPayload();
    const event = normalizeInboundEmail(payload);

    expect(event).not.toBeNull();
    const parsed = event!.metadata['emailThreadParsed'] as { isForwarded?: boolean };
    expect(parsed.isForwarded).toBe(true);
    expect(event!.text.toLowerCase()).toContain('thread history');
  });

  it('falls back to deterministic thread ID when message-id headers are missing', () => {
    const payload = createInboundEmailPayload({
      messageId: undefined,
      inReplyTo: undefined,
      references: undefined,
    });

    const event = normalizeInboundEmail(payload);

    expect(event).not.toBeNull();
    expect(event!.externalThreadId.startsWith('generated:')).toBe(true);
  });
});
