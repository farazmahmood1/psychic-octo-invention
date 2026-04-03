import type {
  RoutingSettings,
  RoutingSettingsInput,
  FirstPartyToolSettings,
  FirstPartyToolSettingsInput,
} from '@nexclaw/shared';
import {
  GHL_CRM_TOOL_NAME,
  BOOKKEEPING_TOOL_NAME,
  FOLLOWUP_TOOL_NAME,
} from '@nexclaw/shared';
import { settingRepository } from '../repositories/setting.repository.js';
import { auditRepository } from '../repositories/audit.repository.js';

const ROUTING_KEY = 'model_routing';
const FIRST_PARTY_TOOLS_KEY = 'first_party_tools';

const DEFAULT_ROUTING: RoutingSettings = {
  primaryModel: 'anthropic/claude-sonnet-4',
  fallbackModel: 'anthropic/claude-opus-4',
  maxCostPerRequestUsd: null,
  maxMonthlyBudgetUsd: null,
  routingRules: [],
};

const DEFAULT_FIRST_PARTY_TOOLS: FirstPartyToolSettings = {
  ghlCrmEnabled: true,
  bookkeepingReceiptEnabled: true,
  leadFollowupEnabled: true,
};

export async function getRoutingSettings(): Promise<RoutingSettings> {
  const setting = await settingRepository.getByKey(ROUTING_KEY);
  if (!setting) {
    return DEFAULT_ROUTING;
  }
  return normalizeRoutingSettings(setting.value);
}

export async function updateRoutingSettings(
  input: RoutingSettingsInput,
  actorId: string,
  ip: string,
): Promise<RoutingSettings> {
  const settings: RoutingSettings = {
    primaryModel: input.primaryModel,
    fallbackModel: input.fallbackModel ?? null,
    maxCostPerRequestUsd: input.maxCostPerRequestUsd ?? null,
    maxMonthlyBudgetUsd: input.maxMonthlyBudgetUsd ?? null,
      routingRules: input.routingRules ?? [],
  };

  await settingRepository.upsert(ROUTING_KEY, settings, actorId, 'AI model routing configuration');

  await auditRepository.create({
    actorId,
    actorType: 'admin',
    action: 'settings.routing_updated',
    targetType: 'setting',
    targetId: ROUTING_KEY,
    ipAddress: ip,
    metadata: { primaryModel: settings.primaryModel },
  });

  return settings;
}

export async function getFirstPartyToolSettings(): Promise<FirstPartyToolSettings> {
  const setting = await settingRepository.getByKey(FIRST_PARTY_TOOLS_KEY);
  if (!setting) {
    return DEFAULT_FIRST_PARTY_TOOLS;
  }
  return normalizeFirstPartyToolSettings(setting.value);
}

export async function updateFirstPartyToolSettings(
  input: FirstPartyToolSettingsInput,
  actorId: string,
  ip: string,
): Promise<FirstPartyToolSettings> {
  const settings = normalizeFirstPartyToolSettings(input);

  await settingRepository.upsert(
    FIRST_PARTY_TOOLS_KEY,
    settings,
    actorId,
    'Runtime enablement for first-party tools and sub-agents',
  );

  await auditRepository.create({
    actorId,
    actorType: 'admin',
    action: 'settings.tools_updated',
    targetType: 'setting',
    targetId: FIRST_PARTY_TOOLS_KEY,
    ipAddress: ip,
    metadata: { ...settings },
  });

  return settings;
}

export function isFirstPartyToolEnabled(
  toolName: string,
  settings: FirstPartyToolSettings,
): boolean {
  switch (toolName) {
    case GHL_CRM_TOOL_NAME:
      return settings.ghlCrmEnabled;
    case BOOKKEEPING_TOOL_NAME:
      return settings.bookkeepingReceiptEnabled;
    case FOLLOWUP_TOOL_NAME:
      return settings.leadFollowupEnabled;
    default:
      return true;
  }
}

function normalizeRoutingSettings(value: unknown): RoutingSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return DEFAULT_ROUTING;
  }

  const raw = value as Partial<RoutingSettings>;
  return {
    primaryModel: raw.primaryModel?.trim() || DEFAULT_ROUTING.primaryModel,
    fallbackModel: raw.fallbackModel?.trim() || DEFAULT_ROUTING.fallbackModel,
    maxCostPerRequestUsd: raw.maxCostPerRequestUsd ?? null,
    maxMonthlyBudgetUsd: raw.maxMonthlyBudgetUsd ?? null,
    routingRules: Array.isArray(raw.routingRules) ? raw.routingRules : [],
  };
}

function normalizeFirstPartyToolSettings(value: unknown): FirstPartyToolSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return DEFAULT_FIRST_PARTY_TOOLS;
  }

  const raw = value as Partial<FirstPartyToolSettings>;
  return {
    ghlCrmEnabled: raw.ghlCrmEnabled ?? DEFAULT_FIRST_PARTY_TOOLS.ghlCrmEnabled,
    bookkeepingReceiptEnabled: raw.bookkeepingReceiptEnabled ?? DEFAULT_FIRST_PARTY_TOOLS.bookkeepingReceiptEnabled,
    leadFollowupEnabled: raw.leadFollowupEnabled ?? DEFAULT_FIRST_PARTY_TOOLS.leadFollowupEnabled,
  };
}
