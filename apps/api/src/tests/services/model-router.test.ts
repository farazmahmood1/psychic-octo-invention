/**
 * STORY-T4: Model routing tests.
 * Simple tasks use cheap model, complex tasks escalate to strong.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { routeModel, escalateModel } from '../../services/routing/model-router.js';
import { getRoutingSettings } from '../../services/settings.service.js';
import {
  createSimpleInboundEvent,
  createComplexInboundEvent,
  createVisionInboundEvent,
  createMockRoutingDecision,
} from '../fixtures/orchestration.fixture.js';

// Mock the settings service
vi.mock('../../services/settings.service.js', () => ({
  getRoutingSettings: vi.fn().mockResolvedValue({
    primaryModel: 'anthropic/claude-sonnet-4',
    fallbackModel: null,
    maxCostPerRequestUsd: null,
    maxMonthlyBudgetUsd: null,
    routingRules: [],
  }),
}));

describe('Model Router', () => {
  beforeEach(() => {
    vi.mocked(getRoutingSettings).mockResolvedValue({
      primaryModel: 'anthropic/claude-sonnet-4',
      fallbackModel: null,
      maxCostPerRequestUsd: null,
      maxMonthlyBudgetUsd: null,
      routingRules: [],
    });
  });

  describe('STORY-T4: simple task uses cheap model', () => {
    it('routes "Hi" to cheap tier', async () => {
      const event = createSimpleInboundEvent();
      const decision = await routeModel(event, []);

      expect(decision.tier).toBe('cheap');
      expect(decision.model).toBe('google/gemini-2.5-flash');
      expect(decision.provider).toBe('openrouter');
      expect(decision.escalatedFrom).toBeNull();
    });

    it('includes signals in decision', async () => {
      const event = createSimpleInboundEvent();
      const decision = await routeModel(event, []);

      expect(decision.signals.messageLength).toBe(2);
      expect(decision.signals.hasAttachments).toBe(false);
      expect(decision.signals.estimatedComplexity).toBe('low');
    });

    it('keeps cheap tier when tools are available but not needed', async () => {
      const event = createSimpleInboundEvent();
      const tools = [
        { name: 'ghl_crm', description: 'CRM operations', parameters: {} },
        { name: 'bookkeeping_receipt', description: 'Receipt processing', parameters: {} },
        { name: 'lead_followup', description: 'Lead follow-up', parameters: {} },
      ];

      const decision = await routeModel(event, tools);

      expect(decision.signals.requiresToolUse).toBe(false);
      expect(decision.tier).toBe('cheap');
      expect(decision.model).toBe('google/gemini-2.5-flash');
    });
  });

  describe('STORY-T4: complex task escalates', () => {
    it('routes complex analysis request to strong tier', async () => {
      const event = createComplexInboundEvent();
      const decision = await routeModel(event, []);

      expect(decision.tier).toBe('strong');
      expect(decision.signals.estimatedComplexity).toBe('high');
    });

    it('routes medium-length request with tools to standard tier', async () => {
      const event = createSimpleInboundEvent();
      event.text = 'Can you update my contact information in the CRM?';
      const tools = [{ name: 'ghl_crm', description: 'CRM operations', parameters: {} }];

      const decision = await routeModel(event, tools);

      expect(decision.signals.requiresToolUse).toBe(true);
      expect(['standard', 'strong']).toContain(decision.tier);
    });

    it('detects natural CRM update phrasing without explicit "contact" keyword', async () => {
      const event = createSimpleInboundEvent();
      event.text = "Update John Doe's phone number to 555-0199";
      const tools = [{ name: 'ghl_crm', description: 'CRM operations', parameters: {} }];

      const decision = await routeModel(event, tools);

      expect(decision.signals.requiresToolUse).toBe(true);
      expect(['standard', 'strong']).toContain(decision.tier);
    });

    it('detects bookkeeping category-only reply as tool-use context', async () => {
      const event = createSimpleInboundEvent();
      event.text = 'Client Meals';
      const tools = [{ name: 'bookkeeping_receipt', description: 'Receipt processing', parameters: {} }];

      const decision = await routeModel(event, tools);

      expect(decision.signals.requiresToolUse).toBe(true);
      expect(['standard', 'strong']).toContain(decision.tier);
    });
  });

  describe('Vision routing', () => {
    it('routes image attachments to at least standard tier', async () => {
      const event = createVisionInboundEvent();
      const decision = await routeModel(event, []);

      expect(decision.signals.requiresVision).toBe(true);
      expect(['standard', 'strong']).toContain(decision.tier);
    });
  });

  describe('Escalation', () => {
    it('escalates from cheap to strong', async () => {
      const event = createSimpleInboundEvent();
      const initial = createMockRoutingDecision('cheap');

      const escalated = await escalateModel(initial, event, []);

      expect(escalated).not.toBeNull();
      expect(escalated!.tier).toBe('strong');
      expect(escalated!.escalatedFrom).toBe('google/gemini-2.5-flash');
    });

    it('returns null when already at strong tier', async () => {
      const event = createSimpleInboundEvent();
      const initial = createMockRoutingDecision('strong');

      const result = await escalateModel(initial, event, []);

      expect(result).toBeNull();
    });

    it('returns null when already escalated once (prevent looping)', async () => {
      const event = createSimpleInboundEvent();
      const initial = {
        ...createMockRoutingDecision('standard'),
        escalatedFrom: 'google/gemini-2.5-flash',
      };

      const result = await escalateModel(initial, event, []);

      expect(result).toBeNull();
    });

    it('uses the admin-configured fallback model for strong-tier escalation', async () => {
      vi.mocked(getRoutingSettings).mockResolvedValueOnce({
        primaryModel: 'anthropic/claude-sonnet-4',
        fallbackModel: 'openai/gpt-4o',
        maxCostPerRequestUsd: null,
        maxMonthlyBudgetUsd: null,
        routingRules: [],
      });

      const event = createComplexInboundEvent();
      const decision = await routeModel(event, []);

      expect(decision.tier).toBe('strong');
      expect(decision.model).toBe('openai/gpt-4o');
    });
  });
});
