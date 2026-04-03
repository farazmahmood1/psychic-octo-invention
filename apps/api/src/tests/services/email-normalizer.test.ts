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

  it('handles payload.to as a single string instead of an array', () => {
    const payload = createInboundEmailPayload({
      to: 'support@nexclaw.dev' as unknown as string[],
    });
    const event = normalizeInboundEmail(payload);

    expect(event).not.toBeNull();
    expect(event!.metadata['emailTo']).toEqual(['support@nexclaw.dev']);
  });

  it('handles payload.cc as a single string instead of an array', () => {
    const payload = createInboundEmailPayload({
      cc: 'boss@example.com' as unknown as string[],
    });
    const event = normalizeInboundEmail(payload);

    expect(event).not.toBeNull();
    expect(event!.metadata['emailCc']).toEqual(['boss@example.com']);
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
