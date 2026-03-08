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

  for (const tc of toolCalls) {
    if (!isSubAgentToolCall(tc.name)) continue;

    const args = safeParseJson(tc.arguments);
    let dispatch: SubAgentDispatch;

    if (tc.name === GHL_CRM_TOOL_NAME) {
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
  const rawAction = (args['action'] as string) ?? 'search_contact';
  const action = (['search_contact', 'update_contact', 'get_contact'].includes(rawAction)
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
  const action = (['process_receipt', 'set_category', 'get_pending'].includes(rawAction)
    ? rawAction
    : 'process_receipt') as BookkeepingSubAgentInput['action'];

  const imageUrl = firstStringArg(args, ['imageUrl', 'image_url', 'attachmentUrl', 'attachment_url', 'url'])
    ?? context?.sourceImageUrl;
  const receiptTaskId = firstStringArg(args, ['receiptTaskId', 'receiptTaskID', 'receipt_task_id', 'receipt_id', 'taskId']);
  const category = firstStringArg(args, ['category', 'expenseCategory', 'expense_category'])
    ?? (typeof args['value'] === 'string' ? args['value'] : undefined);
  const notes = firstStringArg(args, ['notes', 'note']);

  const input: BookkeepingSubAgentInput & { _context?: SubAgentCallContext } = {
    action,
    imageUrl,
    receiptTaskId,
    category,
    notes,
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
