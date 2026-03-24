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
  description: `GoHighLevel CRM and business management operations. Use this tool for contacts, opportunities, notes, SMS, appointments, users, locations, reviews, invoices, and orders.

Supported actions:
CONTACTS:
- search_contact: Search for a contact by name, email, or phone
- get_contact: Get detailed info for a specific contact by ID
- update_contact: Update one or more fields on a contact
- create_contact: Create a new contact (provide fields via updates)

OPPORTUNITIES / PIPELINES:
- get_pipelines: List available pipelines and their stages
- create_opportunity: Create a deal in a pipeline for a contact
- get_opportunity: Get opportunity details by ID
- update_opportunity: Update a deal (move stage, change status/value)
- search_opportunities: Search/list opportunities (filter by pipeline, status, contact)
- delete_opportunity: Delete an opportunity by ID

NOTES:
- add_note: Add a note to a contact
- list_notes: List all notes for a contact
- get_note: Get a specific note by ID
- update_note: Update a note's body text
- delete_note: Delete a note

SMS & EMAIL:
- send_sms: Send an SMS message to a contact
- send_email: Send an email to a contact (requires subject and body)

CONVERSATIONS (Unified Inbox):
- list_conversations: List/search conversations (filter by status, query)
- get_conversation: Get conversation details by ID
- update_conversation: Update a conversation (mark read, assign, change status)
- list_conversation_messages: Get messages for a conversation (includes calls, SMS, emails)

TASKS:
- create_task: Create a task linked to a contact
- list_tasks: List all tasks for a contact
- get_task: Get a specific task by ID
- update_task: Update a task (title, body, dueDate, status, completed)
- delete_task: Delete a task

CALENDARS & APPOINTMENTS:
- list_calendars: List available calendars
- get_free_slots: Get available time slots for a calendar
- create_appointment: Book an appointment for a contact
- get_appointment: Get appointment details by ID
- update_calendar_event: Update an existing calendar event/appointment
- delete_calendar_event: Delete a calendar event/appointment
- list_contact_appointments: List all appointments for a contact

BUSINESS MANAGEMENT:
- list_users: List all users for the business location
- get_location: Get business location details
- update_location: Update business location info
- list_reviews: Fetch Google/Facebook reviews for the location
- create_invoice: Create an invoice for a contact
- get_invoice: Get invoice details by ID
- list_invoices: List all invoices (optionally filtered by contact)
- update_invoice: Update an invoice (name, dueDate, currency, items)
- send_invoice: Send an invoice to the contact
- list_orders: List payment orders and transactions
- get_order: Get order details by ID

CAMPAIGNS & WORKFLOWS:
- list_campaigns: List email/SMS campaigns
- list_workflows: List available workflows
- trigger_workflow: Add a contact to a workflow

FORMS & SURVEYS:
- list_forms: List available forms
- get_form_submissions: Get submissions for a form
- list_surveys: List available surveys
- get_survey_submissions: Get submissions for a survey

Editable contact fields: ${GHL_EDITABLE_FIELDS.join(', ')}

IMPORTANT:
- Always search for the contact first before updating, adding notes, sending SMS, or booking
- If multiple contacts match, ask the user to clarify
- For create_opportunity, use get_pipelines first to get valid pipeline/stage IDs
- For update_opportunity, use search_opportunities or get_opportunity to find the deal first
- For appointments, use list_calendars then get_free_slots before booking
- For invoices, use list_invoices or get_invoice to check status before sending
- For workflows, use list_workflows first to get valid workflow IDs before triggering
- For form/survey submissions, use list_forms or list_surveys first to get IDs
- For send_email, always provide a subject and body
- For conversations, use list_conversations to find conversations before reading messages
- For tasks, use list_tasks to find task IDs before updating or deleting
- For notes, use list_notes to find note IDs before updating or deleting
- Confirm what was done in your response
- Do not proceed if the contact match is ambiguous`,
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: [
          'search_contact', 'get_contact', 'update_contact', 'create_contact',
          'get_pipelines', 'create_opportunity', 'get_opportunity', 'update_opportunity', 'search_opportunities', 'delete_opportunity',
          'add_note', 'list_notes', 'get_note', 'update_note', 'delete_note',
          'send_sms', 'send_email',
          'list_conversations', 'get_conversation', 'update_conversation', 'list_conversation_messages',
          'create_task', 'list_tasks', 'get_task', 'update_task', 'delete_task',
          'list_calendars', 'get_free_slots', 'create_appointment', 'get_appointment',
          'update_calendar_event', 'delete_calendar_event', 'list_contact_appointments',
          'list_users', 'get_location', 'update_location', 'list_reviews',
          'create_invoice', 'get_invoice', 'list_invoices', 'update_invoice', 'send_invoice',
          'list_orders', 'get_order',
          'list_campaigns', 'list_workflows', 'trigger_workflow',
          'list_forms', 'get_form_submissions',
          'list_surveys', 'get_survey_submissions',
        ],
        description: 'The CRM / business management action to perform',
      },
      query: {
        type: 'string',
        description: 'Search query (name, email, or phone) — used to resolve a contact for any contact-linked action',
      },
      contactId: {
        type: 'string',
        description: 'Contact ID — used with get_contact, update_contact, add_note, send_sms, create_opportunity, create_appointment',
      },
      updates: {
        type: 'object',
        description: 'Fields to set — used with update_contact and create_contact. Keys must be from the editable fields list.',
      },
      noteBody: {
        type: 'string',
        description: 'Note text — used with add_note',
      },
      message: {
        type: 'string',
        description: 'SMS message text — used with send_sms',
      },
      opportunityName: {
        type: 'string',
        description: 'Deal/opportunity name — used with create_opportunity',
      },
      pipelineId: {
        type: 'string',
        description: 'Pipeline ID — used with create_opportunity (get from get_pipelines)',
      },
      pipelineStageId: {
        type: 'string',
        description: 'Pipeline stage ID — used with create_opportunity (get from get_pipelines)',
      },
      monetaryValue: {
        type: 'number',
        description: 'Monetary value of the deal — used with create_opportunity',
      },
      calendarId: {
        type: 'string',
        description: 'Calendar ID — used with get_free_slots and create_appointment (get from list_calendars)',
      },
      startTime: {
        type: 'string',
        description: 'Start time (ISO 8601) — used with get_free_slots (as date range start) and create_appointment',
      },
      endTime: {
        type: 'string',
        description: 'End time (ISO 8601) — used with get_free_slots (as date range end) and create_appointment',
      },
      title: {
        type: 'string',
        description: 'Appointment title — used with create_appointment',
      },
      appointmentNotes: {
        type: 'string',
        description: 'Appointment notes — used with create_appointment',
      },
      eventId: {
        type: 'string',
        description: 'Calendar event/appointment ID — used with update_calendar_event and delete_calendar_event',
      },
      invoiceId: {
        type: 'string',
        description: 'Invoice ID — used with get_invoice and send_invoice',
      },
      invoiceName: {
        type: 'string',
        description: 'Invoice name/title — used with create_invoice',
      },
      invoiceItems: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Item name' },
            description: { type: 'string', description: 'Item description' },
            quantity: { type: 'number', description: 'Item quantity' },
            unitPrice: { type: 'number', description: 'Unit price' },
          },
          required: ['name', 'quantity', 'unitPrice'],
        },
        description: 'Line items — used with create_invoice',
      },
      dueDate: {
        type: 'string',
        description: 'Due date (YYYY-MM-DD) — used with create_invoice',
      },
      currency: {
        type: 'string',
        description: 'Currency code (e.g. USD) — used with create_invoice',
      },
      orderId: {
        type: 'string',
        description: 'Order ID — used with get_order',
      },
      locationUpdates: {
        type: 'object',
        description: 'Fields to update on the location — used with update_location (e.g. name, address, phone, email, website)',
      },
      workflowId: {
        type: 'string',
        description: 'Workflow ID — used with trigger_workflow (get from list_workflows)',
      },
      formId: {
        type: 'string',
        description: 'Form ID — used with get_form_submissions to filter by form',
      },
      surveyId: {
        type: 'string',
        description: 'Survey ID — used with get_survey_submissions to filter by survey',
      },
      emailSubject: {
        type: 'string',
        description: 'Email subject line — used with send_email',
      },
      emailBody: {
        type: 'string',
        description: 'Email body text — used with send_email',
      },
      emailHtml: {
        type: 'string',
        description: 'Email HTML body — used with send_email (optional, overrides emailBody)',
      },
      conversationId: {
        type: 'string',
        description: 'Conversation ID — used with get_conversation, update_conversation, list_conversation_messages',
      },
      conversationStatus: {
        type: 'string',
        description: 'Conversation status filter or update value — used with list_conversations and update_conversation (e.g. "read", "unread", "open", "closed")',
      },
      assignedTo: {
        type: 'string',
        description: 'User ID to assign to — used with update_conversation, create_task, update_task, update_opportunity',
      },
      opportunityId: {
        type: 'string',
        description: 'Opportunity/deal ID — used with get_opportunity, update_opportunity, delete_opportunity',
      },
      opportunityStatus: {
        type: 'string',
        description: 'Opportunity status — used with update_opportunity and search_opportunities (e.g. "open", "won", "lost", "abandoned")',
      },
      noteId: {
        type: 'string',
        description: 'Note ID — used with get_note, update_note, delete_note (get from list_notes)',
      },
      taskId: {
        type: 'string',
        description: 'Task ID — used with update_task, delete_task (get from list_tasks)',
      },
      taskTitle: {
        type: 'string',
        description: 'Task title — used with create_task and update_task',
      },
      taskBody: {
        type: 'string',
        description: 'Task description/body — used with create_task and update_task',
      },
      taskDueDate: {
        type: 'string',
        description: 'Task due date (ISO 8601) — used with create_task and update_task',
      },
      taskStatus: {
        type: 'string',
        description: 'Task status — used with update_task',
      },
      taskCompleted: {
        type: 'boolean',
        description: 'Whether the task is completed — used with create_task and update_task',
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
  description: `Bookkeeping receipt and expense processor. You MUST call this tool to record any expense — you cannot record expenses by generating text alone. Only this tool can persist data to the database and Google Sheets.

Supported actions:
- process_receipt: Extract data from a receipt image (requires imageUrl). The system will pass the image automatically from the user's attachment.
- set_category: Set the category for a pending receipt that needs categorization
- get_pending: Check if there is a pending receipt awaiting categorization in this conversation
- manual_entry: Log an expense manually without a receipt image (requires vendor, amount, category)

Common categories: ${BOOKKEEPING_CATEGORIES.join(', ')}

CRITICAL RULES — you must follow these exactly:
1. When the user sends a receipt/invoice image, IMMEDIATELY call process_receipt. Do NOT try to read the image yourself and respond with text — only this tool can save the data.
2. When the user provides a category for a pending receipt, call set_category. Do NOT respond with "Expense Recorded" unless this tool returns success.
3. When the user describes an expense in text (e.g. "$18.50 at Starbucks for client lunch"), call manual_entry with vendor, amount, and category.
4. NEVER generate an "Expense Recorded" or confirmation message without first getting a success result from this tool. If you respond without calling the tool, the expense will NOT be saved.
5. If you already asked the user for clarification (e.g. category) and they respond, call set_category or manual_entry — do not just reply with text.
6. If confidence is low, mention that the user should verify the details.`,
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['process_receipt', 'set_category', 'get_pending', 'manual_entry'],
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
        description: 'Expense category — used with set_category and manual_entry',
      },
      vendor: {
        type: 'string',
        description: 'Vendor/store name — used with manual_entry',
      },
      amount: {
        type: 'number',
        description: 'Expense amount — used with manual_entry',
      },
      transactionDate: {
        type: 'string',
        description: 'Transaction date (YYYY-MM-DD) — used with manual_entry. Defaults to today.',
      },
      currency: {
        type: 'string',
        description: 'Currency code (e.g. USD) — used with manual_entry. Defaults to USD.',
      },
      notes: {
        type: 'string',
        description: 'Optional notes about the receipt or expense',
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
