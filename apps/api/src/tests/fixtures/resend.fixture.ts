import type {
  EmailReceivedEvent,
  GetReceivingEmailResponseSuccess,
} from 'resend';

export const RESEND_WEBHOOK_SECRET = 'whsec_test-resend-webhook-secret';

export function createResendEmailReceivedEvent(
  emailId = 're_email_123',
): EmailReceivedEvent {
  return {
    type: 'email.received',
    created_at: new Date().toISOString(),
    data: {
      email_id: emailId,
      created_at: new Date().toISOString(),
      from: 'Jane Client <client@example.com>',
      to: ['support@forrof.io'],
      bcc: [],
      cc: ['billing@example.com'],
      message_id: '<resend-msg-001@example.com>',
      subject: 'Need help with my invoice',
      attachments: [
        {
          id: 'attachment_1',
          filename: 'invoice.pdf',
          content_type: 'application/pdf',
          content_disposition: 'attachment',
          content_id: null,
        },
      ],
    },
  };
}

export function createResendReceivingEmail(
  emailId = 're_email_123',
): GetReceivingEmailResponseSuccess {
  return {
    object: 'email',
    id: emailId,
    to: ['support@forrof.io'],
    from: 'Jane Client <client@example.com>',
    created_at: new Date().toISOString(),
    subject: 'Need help with my invoice',
    bcc: [],
    cc: ['billing@example.com'],
    reply_to: null,
    html: '<p>Hi, I need help understanding my latest invoice.</p>',
    text: 'Hi, I need help understanding my latest invoice.',
    headers: {
      'Message-Id': '<resend-msg-001@example.com>',
      'In-Reply-To': '<prior-msg@example.com>',
      References: '<root-msg@example.com> <prior-msg@example.com>',
    },
    message_id: '<resend-msg-001@example.com>',
    raw: null,
    attachments: [
      {
        id: 'attachment_1',
        filename: 'invoice.pdf',
        size: 1024,
        content_type: 'application/pdf',
        content_id: null,
        content_disposition: 'attachment',
      },
    ],
  };
}
