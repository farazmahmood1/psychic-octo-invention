import type { RoutingSettings, RoutingSettingsInput } from '@openclaw/shared';
import { settingRepository } from '../repositories/setting.repository.js';
import { auditRepository } from '../repositories/audit.repository.js';

const ROUTING_KEY = 'model_routing';

const DEFAULT_ROUTING: RoutingSettings = {
  primaryModel: 'openai/gpt-4o',
  fallbackModel: null,
  maxCostPerRequestUsd: null,
  maxMonthlyBudgetUsd: null,
  routingRules: [],
};

export async function getRoutingSettings(): Promise<RoutingSettings> {
  const setting = await settingRepository.getByKey(ROUTING_KEY);
  if (!setting) {
    return DEFAULT_ROUTING;
  }
  return setting.value as unknown as RoutingSettings;
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
