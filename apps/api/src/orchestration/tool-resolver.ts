import type { LlmToolDefinition } from '@openclaw/shared';
import { GHL_CRM_TOOL_NAME, GHL_EDITABLE_FIELDS, BOOKKEEPING_TOOL_NAME, BOOKKEEPING_CATEGORIES, FOLLOWUP_TOOL_NAME } from '@openclaw/shared';
import { prisma } from '../db/client.js';
import { logger } from '@openclaw/config';
import { skillExecutionGuard } from '../security/execution-guard.js';
import { getFirstPartyToolSettings, isFirstPartyToolEnabled } from '../services/settings.service.js';

/**
 * Built-in tool definition for the GHL CRM sub-agent.
 * This is first-party and can be runtime-disabled via admin settings.
 */
const GHL_CRM_TOOL: LlmToolDefinition = {
  name: GHL_CRM_TOOL_NAME,
  description: `GoHighLevel CRM operations. Use this tool to search for contacts, get contact details, or update contact fields in the CRM.

Supported actions:
- search_contact: Search for a contact by name, email, or phone
- get_contact: Get detailed info for a specific contact by ID
- update_contact: Update one or more fields on a contact

Editable fields: ${GHL_EDITABLE_FIELDS.join(', ')}

IMPORTANT:
- Always search for the contact first before updating
- If multiple contacts match, ask the user to clarify
- Confirm what was changed in your response
- Do not update if the match is ambiguous`,
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['search_contact', 'get_contact', 'update_contact'],
        description: 'The CRM action to perform',
      },
      query: {
        type: 'string',
        description: 'Search query (name, email, or phone) — used with search_contact',
      },
      contactId: {
        type: 'string',
        description: 'Contact ID — used with get_contact and update_contact',
      },
      updates: {
        type: 'object',
        description: 'Fields to update — used with update_contact. Keys must be from the editable fields list.',
      },
    },
    required: ['action'],
  },
};

/**
 * Built-in tool definition for the Bookkeeping receipt sub-agent.
 * First-party integration that can be runtime-disabled via admin settings.
 */
const BOOKKEEPING_TOOL: LlmToolDefinition = {
  name: BOOKKEEPING_TOOL_NAME,
  description: `Bookkeeping receipt processor. Use this tool when the user sends a receipt image or wants to categorize a pending receipt.

Supported actions:
- process_receipt: Extract data from a receipt image (requires imageUrl)
- set_category: Set the category for a pending receipt that needs categorization
- get_pending: Check if there is a pending receipt awaiting categorization in this conversation

Common categories: ${BOOKKEEPING_CATEGORIES.join(', ')}

IMPORTANT:
- When the user sends a receipt image, use process_receipt with the image URL
- If the system asks for a category and the user provides one, use set_category
- After successful extraction, confirm the extracted details with the user
- If confidence is low, mention that the user should verify the details`,
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['process_receipt', 'set_category', 'get_pending'],
        description: 'The bookkeeping action to perform',
      },
      imageUrl: {
        type: 'string',
        description: 'URL of the receipt image — used with process_receipt',
      },
      receiptTaskId: {
        type: 'string',
        description: 'Receipt task ID — used with set_category to target a specific receipt',
      },
      category: {
        type: 'string',
        description: 'Expense category — used with set_category',
      },
      notes: {
        type: 'string',
        description: 'Optional notes about the receipt',
      },
    },
    required: ['action'],
  },
};

/**
 * Built-in tool definition for the Lead Follow-Up sub-agent.
 * First-party integration that can be runtime-disabled via admin settings.
 */
const FOLLOWUP_TOOL: LlmToolDefinition = {
  name: FOLLOWUP_TOOL_NAME,
  description: `Lead follow-up and appointment recovery agent. Use this tool to help recover lost leads, draft follow-up messages, and manage follow-up recommendations.

Supported actions:
- find_stale: Find leads/conversations with no reply in a given number of days
- draft_followup: Generate a follow-up message for a specific contact
- list_pending: List pending follow-up recommendations
- approve_send: Approve a follow-up for sending (requires explicit user approval)
- dismiss: Dismiss a follow-up recommendation

IMPORTANT:
- Never auto-send messages. Always show the draft and ask for approval first.
- When finding stale leads, ask the user which ones they want to follow up on.
- Keep the tone friendly and professional — not pushy or aggressive.
- If the user says "follow up with X" or "check on stale leads", use this tool.`,
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['find_stale', 'draft_followup', 'list_pending', 'approve_send', 'dismiss'],
        description: 'The follow-up action to perform',
      },
      contactQuery: {
        type: 'string',
        description: 'Contact name, email, or phone — used with draft_followup',
      },
      staleDays: {
        type: 'number',
        description: 'Number of days to consider a lead "stale" (default: 5) — used with find_stale',
      },
      context: {
        type: 'string',
        description: 'Custom context or reason for the follow-up — used with draft_followup',
      },
      recommendationId: {
        type: 'string',
        description: 'Follow-up recommendation ID — used with approve_send and dismiss',
      },
      sendChannel: {
        type: 'string',
        description: 'Preferred channel to send via (telegram, email) — used with approve_send',
      },
    },
    required: ['action'],
  },
};

const DEFAULT_EXTERNAL_TOOL_TIMEOUT_MS = 8_000;
const MAX_EXTERNAL_TOOL_TIMEOUT_MS = 20_000;

export interface ExternalSkillToolRuntime {
  toolName: string;
  skillSlug: string;
  skillId: string;
  source: string;
  timeoutMs: number;
}

export interface ResolvedToolCatalog {
  tools: LlmToolDefinition[];
  externalToolsByName: Map<string, ExternalSkillToolRuntime>;
}

/**
 * Resolve currently available tools from enabled, vetted skills
 * plus built-in sub-agent tools (GHL CRM, Bookkeeping, Follow-Up)
 * that remain enabled in runtime settings.
 *
 * Security enforcement:
 * - Only skills that are enabled AND have passed vetting are exposed
 * - The execution guard performs additional runtime checks
 * - Blocked skills are logged via audit trail
 * - Built-in sub-agent tools are filtered by runtime settings
 */
export async function resolveTools(): Promise<LlmToolDefinition[]> {
  const catalog = await resolveToolCatalog();
  return catalog.tools;
}

export async function resolveToolCatalog(): Promise<ResolvedToolCatalog> {
  const builtInTools = [GHL_CRM_TOOL, BOOKKEEPING_TOOL, FOLLOWUP_TOOL];
  let tools: LlmToolDefinition[] = builtInTools;
  const externalToolsByName = new Map<string, ExternalSkillToolRuntime>();

  try {
    const firstPartyToolSettings = await getFirstPartyToolSettings();
    tools = builtInTools.filter((tool) => isFirstPartyToolEnabled(tool.name, firstPartyToolSettings));

    const disabledBuiltInTools = builtInTools
      .filter((tool) => !isFirstPartyToolEnabled(tool.name, firstPartyToolSettings))
      .map((tool) => tool.name);

    if (disabledBuiltInTools.length > 0) {
      logger.info({ disabledBuiltInTools }, 'Built-in tool catalog filtered by runtime settings');
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to load first-party tool settings, defaulting built-in tools to enabled');
  }

  try {
    const skills = await prisma.skill.findMany({
      where: {
        enabled: true,
        currentVersion: {
          vettingResults: {
            some: { result: { in: ['passed', 'warning'] } },
          },
        },
      },
      select: {
        id: true,
        slug: true,
        sourceType: true,
        displayName: true,
        description: true,
        metadata: true,
        currentVersion: {
          select: {
            config: true,
          },
        },
      },
    });

    for (const skill of skills) {
      // Runtime execution guard check
      const guardResult = await skillExecutionGuard.canExecute(skill.slug, {
        requireSourceHash: skill.sourceType !== 'builtin',
      });
      if (!guardResult.approved) {
        logger.warn(
          { slug: skill.slug, reason: guardResult.reason },
          'Skill blocked by execution guard during tool resolution',
        );
        continue;
      }

      const meta = skill.metadata as Record<string, unknown> | null;
      const toolDef = meta?.['toolDefinition'] as LlmToolDefinition | undefined;
      if (toolDef && toolDef.name && toolDef.description && toolDef.parameters) {
        const source = extractSourceFromSkillConfig(skill.currentVersion?.config);
        if (!source) {
          logger.warn(
            { slug: skill.slug, toolName: toolDef.name },
            'External skill tool skipped from runtime map due to missing source snapshot',
          );
          continue;
        }

        if (!guardResult.skillId) {
          logger.warn(
            { slug: skill.slug, toolName: toolDef.name },
            'External skill tool skipped due to missing guard skillId',
          );
          continue;
        }

        if (externalToolsByName.has(toolDef.name)) {
          logger.warn(
            { toolName: toolDef.name, slug: skill.slug },
            'Duplicate external tool name detected; skipping later skill binding',
          );
          continue;
        }

        tools.push(toolDef);
        externalToolsByName.set(toolDef.name, {
          toolName: toolDef.name,
          skillSlug: skill.slug,
          skillId: guardResult.skillId,
          source,
          timeoutMs: resolveExternalToolTimeout(meta),
        });
      }
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to resolve tools from skills, proceeding with built-in tools only');
  }

  return { tools, externalToolsByName };
}

function extractSourceFromSkillConfig(config: unknown): string | null {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return null;
  }

  const source = (config as Record<string, unknown>)['__source'];
  if (typeof source !== 'string') {
    return null;
  }

  const trimmed = source.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveExternalToolTimeout(metadata: Record<string, unknown> | null): number {
  const raw = metadata?.['executionTimeoutMs'];
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return DEFAULT_EXTERNAL_TOOL_TIMEOUT_MS;
  }

  const bounded = Math.floor(raw);
  if (bounded < 500) return 500;
  if (bounded > MAX_EXTERNAL_TOOL_TIMEOUT_MS) return MAX_EXTERNAL_TOOL_TIMEOUT_MS;
  return bounded;
}
