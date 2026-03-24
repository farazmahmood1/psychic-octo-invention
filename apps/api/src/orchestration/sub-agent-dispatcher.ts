import { logger } from '@openclaw/config';
import type {
  SubAgentDispatch,
  ToolDispatch,
  GhlSubAgentInput,
  BookkeepingSubAgentInput,
  FollowUpSubAgentInput,
  LlmToolCall,
} from '@openclaw/shared';
import { GHL_CRM_TOOL_NAME, BOOKKEEPING_TOOL_NAME, FOLLOWUP_TOOL_NAME } from '@openclaw/shared';
import { processGhlDispatch, processBookkeepingDispatch, processFollowUpDispatch } from '../services/subagents/index.js';
import { subAgentTaskRepository } from '../repositories/sub-agent-task.repository.js';
import { getFirstPartyToolSettings, isFirstPartyToolEnabled } from '../services/settings.service.js';

/** Tool names that are handled by sub-agents rather than external skills. */
const SUB_AGENT_TOOLS = new Set<string>([GHL_CRM_TOOL_NAME, BOOKKEEPING_TOOL_NAME, FOLLOWUP_TOOL_NAME]);

/**
 * Check whether a tool call is a sub-agent dispatch (handled internally)
 * rather than an external skill tool.
 */
export function isSubAgentToolCall(toolName: string): boolean {
  return SUB_AGENT_TOOLS.has(toolName);
}

/** Context passed to sub-agents that need conversation/user info. */
export interface SubAgentCallContext {
  conversationId?: string;
  externalUserId?: string;
  sourceChannel?: string;
  sourceMessageId?: string;
  sourceImageUrl?: string;
}

/**
 * Process tool calls from the LLM response that map to sub-agents.
 * Executes each sub-agent synchronously and returns the dispatch results.
 *
 * Returns separate arrays for:
 * - toolDispatches: updated tool dispatches with results
 * - subAgentDispatches: sub-agent dispatch records
 * - toolResultMessages: tool result messages for multi-turn LLM conversation
 */
export async function processSubAgentCalls(
  toolCalls: LlmToolCall[],
  context?: SubAgentCallContext,
): Promise<{
  toolDispatches: ToolDispatch[];
  subAgentDispatches: SubAgentDispatch[];
  toolResults: Array<{ toolCallId: string; result: string }>;
}> {
  const toolDispatches: ToolDispatch[] = [];
  const subAgentDispatches: SubAgentDispatch[] = [];
  const toolResults: Array<{ toolCallId: string; result: string }> = [];
  const toolSettings = await getFirstPartyToolSettings().catch((err) => {
    logger.warn({ err }, 'Failed to load first-party tool settings during sub-agent dispatch');
    return {
      ghlCrmEnabled: true,
      bookkeepingReceiptEnabled: true,
      leadFollowupEnabled: true,
    };
  });

  for (const tc of toolCalls) {
    if (!isSubAgentToolCall(tc.name)) continue;

    const args = safeParseJson(tc.arguments);
    let dispatch: SubAgentDispatch;

    if (!isFirstPartyToolEnabled(tc.name, toolSettings)) {
      logger.warn({ toolName: tc.name }, 'Blocked first-party tool call because the tool is disabled in runtime settings');
      dispatch = buildDisabledDispatch(tc.name, args);
    } else if (tc.name === GHL_CRM_TOOL_NAME) {
      dispatch = await executeGhlSubAgent(tc.id, args);
    } else if (tc.name === BOOKKEEPING_TOOL_NAME) {
      dispatch = await executeBookkeepingSubAgent(tc.id, args, context);
    } else if (tc.name === FOLLOWUP_TOOL_NAME) {
      dispatch = await executeFollowUpSubAgent(tc.id, args, context);
    } else {
      continue;
    }

    subAgentDispatches.push(dispatch);

    const output = dispatch.output as Record<string, unknown> | undefined;
    const resultText = buildToolResultText(output, dispatch);

    toolDispatches.push({
      toolName: tc.name,
      arguments: args,
      result: resultText,
      status: dispatch.status === 'completed' ? 'completed' : 'failed',
      error: dispatch.error,
    });

    toolResults.push({
      toolCallId: tc.id,
      result: resultText,
    });
  }

  return { toolDispatches, subAgentDispatches, toolResults };
}

async function executeGhlSubAgent(
  _toolCallId: string,
  args: Record<string, unknown>,
): Promise<SubAgentDispatch> {
  const VALID_GHL_ACTIONS: GhlSubAgentInput['action'][] = [
    'search_contact', 'update_contact', 'get_contact', 'create_contact',
    'create_opportunity', 'get_opportunity', 'update_opportunity', 'search_opportunities', 'delete_opportunity',
    'get_pipelines',
    'add_note', 'list_notes', 'get_note', 'update_note', 'delete_note',
    'send_sms', 'send_email',
    'list_conversations', 'get_conversation', 'update_conversation', 'list_conversation_messages',
    'create_task', 'list_tasks', 'update_task', 'delete_task',
    'list_calendars', 'get_free_slots', 'create_appointment',
    'update_calendar_event', 'delete_calendar_event', 'list_contact_appointments',
    'list_users', 'get_location', 'update_location', 'list_reviews',
    'create_invoice', 'get_invoice', 'list_invoices', 'send_invoice',
    'list_orders', 'get_order',
    'list_campaigns', 'list_workflows', 'trigger_workflow',
    'list_forms', 'get_form_submissions',
    'list_surveys', 'get_survey_submissions',
  ];

  const rawAction = (args['action'] as string) ?? 'search_contact';
  const action = (VALID_GHL_ACTIONS.includes(rawAction as GhlSubAgentInput['action'])
    ? rawAction
    : 'search_contact') as GhlSubAgentInput['action'];

  const query = firstStringArg(args, ['query', 'contactQuery', 'contactName', 'name']);
  const contactId = firstStringArg(args, ['contactId', 'id']);
  let updates = isRecord(args['updates']) ? args['updates'] as Record<string, unknown> : undefined;
  if (!updates && typeof args['field'] === 'string' && Object.prototype.hasOwnProperty.call(args, 'value')) {
    updates = { [args['field']]: args['value'] };
  }

  const input: GhlSubAgentInput = {
    action,
    query,
    contactId,
    updates,
    // Note fields
    noteBody: firstStringArg(args, ['noteBody', 'note_body', 'note', 'body']),
    // SMS fields
    message: firstStringArg(args, ['message', 'smsMessage', 'sms_message', 'text']),
    // Opportunity fields
    opportunityName: firstStringArg(args, ['opportunityName', 'opportunity_name', 'dealName', 'deal_name']),
    pipelineId: firstStringArg(args, ['pipelineId', 'pipeline_id']),
    pipelineStageId: firstStringArg(args, ['pipelineStageId', 'pipeline_stage_id', 'stageId', 'stage_id']),
    monetaryValue: typeof args['monetaryValue'] === 'number' ? args['monetaryValue'] : undefined,
    // Calendar / Appointment fields
    calendarId: firstStringArg(args, ['calendarId', 'calendar_id']),
    startTime: firstStringArg(args, ['startTime', 'start_time', 'startDate', 'start_date']),
    endTime: firstStringArg(args, ['endTime', 'end_time', 'endDate', 'end_date']),
    title: firstStringArg(args, ['title', 'appointmentTitle', 'appointment_title']),
    appointmentNotes: firstStringArg(args, ['appointmentNotes', 'appointment_notes']),
    // Calendar event management
    eventId: firstStringArg(args, ['eventId', 'event_id', 'appointmentId', 'appointment_id']),
    // Invoice fields
    invoiceId: firstStringArg(args, ['invoiceId', 'invoice_id']),
    invoiceName: firstStringArg(args, ['invoiceName', 'invoice_name', 'invoiceTitle', 'invoice_title']),
    invoiceItems: Array.isArray(args['invoiceItems']) ? args['invoiceItems'] as GhlSubAgentInput['invoiceItems'] : undefined,
    dueDate: firstStringArg(args, ['dueDate', 'due_date']),
    currency: firstStringArg(args, ['currency', 'currencyCode', 'currency_code']),
    // Order fields
    orderId: firstStringArg(args, ['orderId', 'order_id']),
    // Location fields
    locationUpdates: isRecord(args['locationUpdates']) ? args['locationUpdates'] as Record<string, unknown> : undefined,
    // Workflow fields
    workflowId: firstStringArg(args, ['workflowId', 'workflow_id']),
    // Form fields
    formId: firstStringArg(args, ['formId', 'form_id']),
    // Survey fields
    surveyId: firstStringArg(args, ['surveyId', 'survey_id']),
    // Email fields
    emailSubject: firstStringArg(args, ['emailSubject', 'email_subject', 'subject']),
    emailBody: firstStringArg(args, ['emailBody', 'email_body', 'body']),
    emailHtml: firstStringArg(args, ['emailHtml', 'email_html', 'html']),
    // Conversation fields
    conversationId: firstStringArg(args, ['conversationId', 'conversation_id']),
    conversationStatus: firstStringArg(args, ['conversationStatus', 'conversation_status']),
    assignedTo: firstStringArg(args, ['assignedTo', 'assigned_to', 'assignedUserId', 'assigned_user_id']),
    // Opportunity fields (enhanced)
    opportunityId: firstStringArg(args, ['opportunityId', 'opportunity_id', 'dealId', 'deal_id']),
    opportunityStatus: firstStringArg(args, ['opportunityStatus', 'opportunity_status', 'dealStatus', 'deal_status']),
    // Note fields (enhanced)
    noteId: firstStringArg(args, ['noteId', 'note_id']),
    // Task fields
    taskId: firstStringArg(args, ['taskId', 'task_id']),
    taskTitle: firstStringArg(args, ['taskTitle', 'task_title', 'taskName', 'task_name']),
    taskBody: firstStringArg(args, ['taskBody', 'task_body', 'taskDescription', 'task_description']),
    taskDueDate: firstStringArg(args, ['taskDueDate', 'task_due_date', 'taskDue', 'task_due']),
    taskStatus: firstStringArg(args, ['taskStatus', 'task_status']),
    taskCompleted: typeof args['taskCompleted'] === 'boolean' ? args['taskCompleted'] : (typeof args['task_completed'] === 'boolean' ? args['task_completed'] : undefined),
  };

  // Persist sub-agent task record
  let taskId: string | undefined;
  try {
    const task = await subAgentTaskRepository.create({
      agentName: GHL_CRM_TOOL_NAME,
      taskType: input.action,
      input: input as any,
    });
    taskId = task.id;
    await subAgentTaskRepository.updateStatus(task.id, 'running');
  } catch (err) {
    logger.warn({ err }, 'Failed to persist sub-agent task record');
  }

  const dispatch: SubAgentDispatch = {
    agentName: GHL_CRM_TOOL_NAME,
    taskType: input.action,
    input: input as unknown as Record<string, unknown>,
    status: 'queued',
  };

  const result = await processGhlDispatch(dispatch);

  // Update task status
  if (taskId) {
    subAgentTaskRepository.updateStatus(
      taskId,
      result.status === 'completed' ? 'completed' : 'failed',
      {
        output: result.output as any,
        errorDetails: result.error ? { message: result.error } : undefined,
      },
    ).catch((err) => {
      logger.warn({ err, taskId }, 'Failed to update sub-agent task status');
    });
  }

  return result;
}

async function executeBookkeepingSubAgent(
  _toolCallId: string,
  args: Record<string, unknown>,
  context?: SubAgentCallContext,
): Promise<SubAgentDispatch> {
  const rawAction = (args['action'] as string) ?? 'process_receipt';
  const action = (['process_receipt', 'set_category', 'get_pending', 'manual_entry'].includes(rawAction)
    ? rawAction
    : 'process_receipt') as BookkeepingSubAgentInput['action'];

  // Prefer the real attachment URL from context (the LLM cannot see the
  // actual file URL and frequently hallucinates a placeholder).
  const imageUrl = context?.sourceImageUrl
    ?? firstStringArg(args, ['imageUrl', 'image_url', 'attachmentUrl', 'attachment_url', 'url']);
  const receiptTaskId = firstStringArg(args, ['receiptTaskId', 'receiptTaskID', 'receipt_task_id', 'receipt_id', 'taskId']);
  const category = firstStringArg(args, ['category', 'expenseCategory', 'expense_category'])
    ?? (typeof args['value'] === 'string' ? args['value'] : undefined);
  const notes = firstStringArg(args, ['notes', 'note']);
  const vendor = firstStringArg(args, ['vendor', 'vendorName', 'vendor_name', 'store', 'storeName', 'store_name', 'merchant', 'merchantName', 'merchant_name']);
  const amount = typeof args['amount'] === 'number' ? args['amount'] : undefined;
  const transactionDate = firstStringArg(args, ['transactionDate', 'transaction_date', 'date']);
  const currency = firstStringArg(args, ['currency', 'currencyCode']);

  const input: BookkeepingSubAgentInput & { _context?: SubAgentCallContext } = {
    action,
    imageUrl,
    receiptTaskId,
    category,
    notes,
    vendor,
    amount,
    transactionDate,
    currency,
    _context: context,
  };

  // Persist sub-agent task record
  let taskId: string | undefined;
  try {
    const task = await subAgentTaskRepository.create({
      agentName: BOOKKEEPING_TOOL_NAME,
      taskType: input.action,
      input: input as any,
    });
    taskId = task.id;
    await subAgentTaskRepository.updateStatus(task.id, 'running');
  } catch (err) {
    logger.warn({ err }, 'Failed to persist bookkeeping sub-agent task record');
  }

  const dispatch: SubAgentDispatch = {
    agentName: BOOKKEEPING_TOOL_NAME,
    taskType: input.action,
    input: input as unknown as Record<string, unknown>,
    status: 'queued',
  };

  const result = await processBookkeepingDispatch(dispatch);

  // Update task status
  if (taskId) {
    subAgentTaskRepository.updateStatus(
      taskId,
      result.status === 'completed' ? 'completed' : 'failed',
      {
        output: result.output as any,
        errorDetails: result.error ? { message: result.error } : undefined,
      },
    ).catch((err) => {
      logger.warn({ err, taskId }, 'Failed to update bookkeeping sub-agent task status');
    });
  }

  return result;
}

async function executeFollowUpSubAgent(
  _toolCallId: string,
  args: Record<string, unknown>,
  context?: SubAgentCallContext,
): Promise<SubAgentDispatch> {
  const rawAction = (args['action'] as string) ?? 'find_stale';
  const action = (['find_stale', 'draft_followup', 'approve_send', 'list_pending', 'dismiss'].includes(rawAction)
    ? rawAction
    : 'find_stale') as FollowUpSubAgentInput['action'];

  const input: FollowUpSubAgentInput & { _context?: SubAgentCallContext } = {
    action,
    contactQuery: args['contactQuery'] as string | undefined,
    staleDays: args['staleDays'] as number | undefined,
    context: args['context'] as string | undefined,
    recommendationId: args['recommendationId'] as string | undefined,
    sendChannel: args['sendChannel'] as string | undefined,
    _context: context,
  };

  // Persist sub-agent task record
  let taskId: string | undefined;
  try {
    const task = await subAgentTaskRepository.create({
      agentName: FOLLOWUP_TOOL_NAME,
      taskType: input.action,
      input: input as any,
    });
    taskId = task.id;
    await subAgentTaskRepository.updateStatus(task.id, 'running');
  } catch (err) {
    logger.warn({ err }, 'Failed to persist follow-up sub-agent task record');
  }

  const dispatch: SubAgentDispatch = {
    agentName: FOLLOWUP_TOOL_NAME,
    taskType: input.action,
    input: input as unknown as Record<string, unknown>,
    status: 'queued',
  };

  const result = await processFollowUpDispatch(dispatch);

  // Update task status
  if (taskId) {
    subAgentTaskRepository.updateStatus(
      taskId,
      result.status === 'completed' ? 'completed' : 'failed',
      {
        output: result.output as any,
        errorDetails: result.error ? { message: result.error } : undefined,
      },
    ).catch((err) => {
      logger.warn({ err, taskId }, 'Failed to update follow-up sub-agent task status');
    });
  }

  return result;
}

function safeParseJson(str: string): Record<string, unknown> {
  try {
    return JSON.parse(str) as Record<string, unknown>;
  } catch {
    return { raw: str };
  }
}

function firstStringArg(
  args: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const value = args[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function buildToolResultText(
  output: Record<string, unknown> | undefined,
  dispatch: SubAgentDispatch,
): string {
  const summary = typeof output?.['summary'] === 'string' ? output['summary'] : null;
  if (!summary) {
    return dispatch.status === 'completed' ? 'Operation completed.' : `Error: ${dispatch.error}`;
  }

  const needsClarification = output?.['needsClarification'] === true;
  const clarificationQuestion = typeof output?.['clarificationQuestion'] === 'string'
    ? output['clarificationQuestion']
    : null;
  if (needsClarification && clarificationQuestion) {
    return `${summary}\n\n${clarificationQuestion}`;
  }

  return summary;
}

function buildDisabledDispatch(
  toolName: string,
  input: Record<string, unknown>,
): SubAgentDispatch {
  return {
    agentName: toolName,
    taskType: typeof input['action'] === 'string' ? input['action'] : 'disabled',
    input,
    status: 'failed',
    error: `${toolName} is currently disabled in admin settings.`,
    output: {
      summary: `${toolName} is currently disabled in admin settings.`,
    },
  };
}
