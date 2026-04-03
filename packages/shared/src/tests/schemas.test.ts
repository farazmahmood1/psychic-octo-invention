/**
 * Unit tests for shared Zod validation schemas.
 * Covers all API input schemas, password validation, and pagination.
 */
import { describe, it, expect } from 'vitest';
import {
  paginationQuerySchema,
  passwordSchema,
  loginRequestSchema,
  changePasswordSchema,
  conversationListQuerySchema,
  messageListQuerySchema,
  auditLogQuerySchema,
  usageSummaryQuerySchema,
  usageTimeseriesQuerySchema,
  jobListQuerySchema,
  memorySearchQuerySchema,
  skillToggleSchema,
  skillIngestSchema,
  skillManualOverrideSchema,
  routingSettingsSchema,
  firstPartyToolSettingsSchema,
  bookkeepingListQuerySchema,
  securityEventsQuerySchema,
} from '../schemas/api.js';

// ── Pagination ────────────────────────────────────────

describe('paginationQuerySchema', () => {
  it('applies defaults for missing page and pageSize', () => {
    const result = paginationQuerySchema.parse({});
    expect(result).toEqual({ page: 1, pageSize: 20 });
  });

  it('coerces string numbers', () => {
    const result = paginationQuerySchema.parse({ page: '3', pageSize: '50' });
    expect(result).toEqual({ page: 3, pageSize: 50 });
  });

  it('rejects page < 1', () => {
    expect(() => paginationQuerySchema.parse({ page: 0 })).toThrow();
    expect(() => paginationQuerySchema.parse({ page: -1 })).toThrow();
  });

  it('rejects pageSize > 100', () => {
    expect(() => paginationQuerySchema.parse({ pageSize: 101 })).toThrow();
  });

  it('rejects non-integer values', () => {
    expect(() => paginationQuerySchema.parse({ page: 1.5 })).toThrow();
  });
});

// ── Password ──────────────────────────────────────────

describe('passwordSchema', () => {
  const validPassword = 'MyP@ssw0rd!234';

  it('accepts valid complex password', () => {
    expect(() => passwordSchema.parse(validPassword)).not.toThrow();
  });

  it('rejects too short (< 12 chars)', () => {
    expect(() => passwordSchema.parse('Ab1!')).toThrow(/12 characters/);
  });

  it('rejects too long (> 128 chars)', () => {
    expect(() => passwordSchema.parse('A'.repeat(129) + 'a1!')).toThrow(/128/);
  });

  it('rejects missing uppercase', () => {
    expect(() => passwordSchema.parse('mypassword1!')).toThrow(/uppercase/);
  });

  it('rejects missing lowercase', () => {
    expect(() => passwordSchema.parse('MYPASSWORD1!')).toThrow(/lowercase/);
  });

  it('rejects missing number', () => {
    expect(() => passwordSchema.parse('MyPassword!!')).toThrow(/number/);
  });

  it('rejects missing symbol', () => {
    expect(() => passwordSchema.parse('MyPassword123')).toThrow(/symbol/);
  });
});

// ── Login ─────────────────────────────────────────────

describe('loginRequestSchema', () => {
  it('parses valid login and lowercases email', () => {
    const result = loginRequestSchema.parse({ email: 'Admin@NexClaw.Dev', password: 'test' });
    expect(result.email).toBe('admin@nexclaw.dev');
    expect(result.password).toBe('test');
  });

  it('rejects invalid email', () => {
    expect(() => loginRequestSchema.parse({ email: 'not-an-email', password: 'test' })).toThrow();
  });

  it('rejects empty password', () => {
    expect(() => loginRequestSchema.parse({ email: 'a@b.com', password: '' })).toThrow();
  });
});

// ── Change Password ───────────────────────────────────

describe('changePasswordSchema', () => {
  it('validates complex new password', () => {
    const result = changePasswordSchema.parse({
      currentPassword: 'old',
      newPassword: 'NewP@ssw0rd!234',
    });
    expect(result.currentPassword).toBe('old');
  });

  it('rejects weak new password', () => {
    expect(() =>
      changePasswordSchema.parse({ currentPassword: 'old', newPassword: 'weak' }),
    ).toThrow();
  });
});

// ── Conversation Filters ──────────────────────────────

describe('conversationListQuerySchema', () => {
  it('accepts all valid filters', () => {
    const result = conversationListQuerySchema.parse({
      page: '1',
      channel: 'telegram',
      status: 'active',
      participantExternalId: 'user-123',
      dateFrom: '2026-01-01',
      dateTo: '2026-12-31',
    });
    expect(result.channel).toBe('telegram');
    expect(result.status).toBe('active');
    expect(result.dateFrom).toBeInstanceOf(Date);
  });

  it('rejects invalid channel', () => {
    expect(() => conversationListQuerySchema.parse({ channel: 'whatsapp' })).toThrow();
  });

  it('rejects invalid status', () => {
    expect(() => conversationListQuerySchema.parse({ status: 'deleted' })).toThrow();
  });
});

// ── Message List ──────────────────────────────────────

describe('messageListQuerySchema', () => {
  it('accepts valid direction filter', () => {
    const result = messageListQuerySchema.parse({ direction: 'inbound' });
    expect(result.direction).toBe('inbound');
  });

  it('rejects invalid direction', () => {
    expect(() => messageListQuerySchema.parse({ direction: 'up' })).toThrow();
  });
});

// ── Audit Log ─────────────────────────────────────────

describe('auditLogQuerySchema', () => {
  it('accepts free-form action filter', () => {
    const result = auditLogQuerySchema.parse({ action: 'skill.toggled', actorId: 'admin-1' });
    expect(result.action).toBe('skill.toggled');
  });
});

// ── Usage Queries ─────────────────────────────────────

describe('usageSummaryQuerySchema', () => {
  it('parses date range', () => {
    const result = usageSummaryQuerySchema.parse({
      dateFrom: '2026-01-01',
      dateTo: '2026-03-01',
      provider: 'openrouter',
    });
    expect(result.dateFrom).toBeInstanceOf(Date);
  });
});

describe('usageTimeseriesQuerySchema', () => {
  it('defaults granularity to day', () => {
    const result = usageTimeseriesQuerySchema.parse({});
    expect(result.granularity).toBe('day');
  });

  it('accepts hour/week granularity', () => {
    expect(usageTimeseriesQuerySchema.parse({ granularity: 'hour' }).granularity).toBe('hour');
    expect(usageTimeseriesQuerySchema.parse({ granularity: 'week' }).granularity).toBe('week');
  });

  it('rejects invalid granularity', () => {
    expect(() => usageTimeseriesQuerySchema.parse({ granularity: 'month' })).toThrow();
  });
});

// ── Jobs ──────────────────────────────────────────────

describe('jobListQuerySchema', () => {
  it('accepts valid job status filter', () => {
    const result = jobListQuerySchema.parse({ status: 'failed', queueName: 'orchestration' });
    expect(result.status).toBe('failed');
  });

  it('rejects invalid job status', () => {
    expect(() => jobListQuerySchema.parse({ status: 'deleted' })).toThrow();
  });
});

// ── Memory Search ─────────────────────────────────────

describe('memorySearchQuerySchema', () => {
  it('accepts search query', () => {
    const result = memorySearchQuerySchema.parse({ q: 'billing issue', namespace: 'user' });
    expect(result.q).toBe('billing issue');
  });
});

// ── Skill Toggle ──────────────────────────────────────

describe('skillToggleSchema', () => {
  it('accepts boolean enabled', () => {
    expect(skillToggleSchema.parse({ enabled: true }).enabled).toBe(true);
    expect(skillToggleSchema.parse({ enabled: false }).enabled).toBe(false);
  });

  it('rejects non-boolean', () => {
    expect(() => skillToggleSchema.parse({ enabled: 'yes' })).toThrow();
  });
});

// ── Skill Ingest ──────────────────────────────────────

describe('skillIngestSchema', () => {
  const validInput = {
    slug: 'my-skill',
    displayName: 'My Skill',
    sourceType: 'builtin',
    version: '1.0.0',
    source: 'function greet() { return "hello"; }',
  };

  it('accepts valid skill ingest', () => {
    const result = skillIngestSchema.parse(validInput);
    expect(result.slug).toBe('my-skill');
  });

  it('rejects slug with uppercase', () => {
    expect(() => skillIngestSchema.parse({ ...validInput, slug: 'MySkill' })).toThrow();
  });

  it('rejects slug with spaces', () => {
    expect(() => skillIngestSchema.parse({ ...validInput, slug: 'my skill' })).toThrow();
  });

  it('rejects empty source', () => {
    expect(() => skillIngestSchema.parse({ ...validInput, source: '' })).toThrow();
  });
});

// ── Skill Manual Override ─────────────────────────────

describe('skillManualOverrideSchema', () => {
  it('accepts valid override', () => {
    const result = skillManualOverrideSchema.parse({
      result: 'passed',
      reason: 'Reviewed by security team and approved for production use',
    });
    expect(result.result).toBe('passed');
  });

  it('rejects too short reason', () => {
    expect(() => skillManualOverrideSchema.parse({ result: 'passed', reason: 'ok' })).toThrow();
  });

  it('rejects invalid result value', () => {
    expect(() =>
      skillManualOverrideSchema.parse({ result: 'failed', reason: 'This is a long enough reason' }),
    ).toThrow();
  });
});

// ── Routing Settings ──────────────────────────────────

describe('routingSettingsSchema', () => {
  it('accepts valid routing config', () => {
    const result = routingSettingsSchema.parse({
      primaryModel: 'anthropic/claude-sonnet-4',
      fallbackModel: 'google/gemini-2.5-flash',
      maxCostPerRequestUsd: 0.50,
      maxMonthlyBudgetUsd: 500,
      routingRules: [
        { pattern: 'tier:strong', model: 'anthropic/claude-opus-4', priority: 10 },
      ],
    });
    expect(result.primaryModel).toBe('anthropic/claude-sonnet-4');
    expect(result.routingRules).toHaveLength(1);
  });

  it('rejects empty primary model', () => {
    expect(() => routingSettingsSchema.parse({ primaryModel: '' })).toThrow();
  });

  it('rejects negative cost', () => {
    expect(() =>
      routingSettingsSchema.parse({ primaryModel: 'test', maxCostPerRequestUsd: -1 }),
    ).toThrow();
  });

  it('rejects cost > 10', () => {
    expect(() =>
      routingSettingsSchema.parse({ primaryModel: 'test', maxCostPerRequestUsd: 11 }),
    ).toThrow();
  });
});

describe('firstPartyToolSettingsSchema', () => {
  it('accepts valid built-in tool toggles', () => {
    const result = firstPartyToolSettingsSchema.parse({
      ghlCrmEnabled: true,
      bookkeepingReceiptEnabled: false,
      leadFollowupEnabled: true,
    });
    expect(result.bookkeepingReceiptEnabled).toBe(false);
  });

  it('rejects non-boolean toggle values', () => {
    expect(() =>
      firstPartyToolSettingsSchema.parse({
        ghlCrmEnabled: 'yes',
        bookkeepingReceiptEnabled: true,
        leadFollowupEnabled: true,
      }),
    ).toThrow();
  });
});

// ── Bookkeeping ───────────────────────────────────────

describe('bookkeepingListQuerySchema', () => {
  it('accepts valid status filter', () => {
    const result = bookkeepingListQuerySchema.parse({ status: 'pending' });
    expect(result.status).toBe('pending');
  });

  it('rejects invalid status', () => {
    expect(() => bookkeepingListQuerySchema.parse({ status: 'approved' })).toThrow();
  });
});

// ── Security Events ───────────────────────────────────

describe('securityEventsQuerySchema', () => {
  it('accepts action filter', () => {
    const result = securityEventsQuerySchema.parse({ action: 'security.skill_blocked' });
    expect(result.action).toBe('security.skill_blocked');
  });
});
