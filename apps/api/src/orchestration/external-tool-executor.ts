import { Script, createContext } from 'node:vm';
import { logger } from '@nexclaw/config';
import type { LlmToolCall, ToolDispatch } from '@nexclaw/shared';
import { auditRepository } from '../repositories/audit.repository.js';
import { skillExecutionGuard } from '../security/execution-guard.js';
import type { ExternalSkillToolRuntime } from './tool-resolver.js';

const MAX_TOOL_RESULT_CHARS = 4_000;

export interface ExternalToolExecutionContext {
  conversationId: string;
  externalUserId: string;
  sourceChannel: string;
  sourceMessageId: string;
}

export async function executeExternalToolCalls(
  toolCalls: LlmToolCall[],
  runtimesByToolName: Map<string, ExternalSkillToolRuntime>,
  context: ExternalToolExecutionContext,
): Promise<{
  toolDispatches: ToolDispatch[];
  toolResults: Array<{ toolCallId: string; result: string }>;
}> {
  const toolDispatches: ToolDispatch[] = [];
  const toolResults: Array<{ toolCallId: string; result: string }> = [];

  for (const toolCall of toolCalls) {
    const args = safeParseJson(toolCall.arguments);
    const runtime = runtimesByToolName.get(toolCall.name);

    if (!runtime) {
      const missingResult = `Tool "${toolCall.name}" is unavailable or not executable.`;
      toolDispatches.push({
        toolName: toolCall.name,
        arguments: args,
        status: 'failed',
        result: missingResult,
        error: missingResult,
      });
      toolResults.push({ toolCallId: toolCall.id, result: missingResult });
      continue;
    }

    const guardResult = await skillExecutionGuard.canExecute(runtime.skillSlug, {
      source: runtime.source,
      requireSourceHash: true,
    });

    if (!guardResult.approved) {
      const blockedResult = `Tool execution blocked: ${guardResult.reason}.`;
      toolDispatches.push({
        toolName: toolCall.name,
        arguments: args,
        status: 'failed',
        result: blockedResult,
        error: guardResult.reason,
      });
      toolResults.push({ toolCallId: toolCall.id, result: blockedResult });
      continue;
    }

    try {
      const rawResult = await runExternalTool(runtime, args, context);
      const formatted = formatToolResult(rawResult);

      toolDispatches.push({
        toolName: toolCall.name,
        arguments: args,
        status: 'completed',
        result: formatted,
      });
      toolResults.push({ toolCallId: toolCall.id, result: formatted });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const safeError = `Tool execution failed: ${message}`;

      await auditExecutionFailure(runtime, toolCall.name, message);
      logger.error(
        { err, skillSlug: runtime.skillSlug, toolName: toolCall.name },
        'External tool execution failed',
      );

      toolDispatches.push({
        toolName: toolCall.name,
        arguments: args,
        status: 'failed',
        result: safeError,
        error: message,
      });
      toolResults.push({ toolCallId: toolCall.id, result: safeError });
    }
  }

  return {
    toolDispatches,
    toolResults,
  };
}

async function runExternalTool(
  runtime: ExternalSkillToolRuntime,
  args: Record<string, unknown>,
  context: ExternalToolExecutionContext,
): Promise<unknown> {
  const moduleRef: { exports: unknown } = { exports: {} };
  const exportsRef: Record<string, unknown> = {};
  const sandbox: Record<string, unknown> = {
    module: moduleRef,
    exports: exportsRef,
    console: createNoopConsole(),
    process: undefined,
    require: undefined,
    global: undefined,
    Buffer: undefined,
    eval: undefined,
    Function: undefined,
  };
  sandbox['globalThis'] = sandbox;

  const vmContext = createContext(sandbox, {
    codeGeneration: { strings: false, wasm: false },
  });

  const script = new Script(runtime.source, {
    filename: `${runtime.skillSlug}.skill.js`,
  });
  script.runInContext(vmContext, { timeout: runtime.timeoutMs });

  const runner = resolveRunner(runtime.toolName, moduleRef.exports, exportsRef, sandbox);
  if (!runner) {
    throw new Error(
      `Skill "${runtime.skillSlug}" must export a function named "${runtime.toolName}" or "run".`,
    );
  }

  const executionContext = {
    conversationId: context.conversationId,
    externalUserId: context.externalUserId,
    sourceChannel: context.sourceChannel,
    sourceMessageId: context.sourceMessageId,
    timestamp: new Date().toISOString(),
  };

  const result = runner(args, executionContext);
  return Promise.resolve(result);
}

function resolveRunner(
  toolName: string,
  moduleExports: unknown,
  namedExports: Record<string, unknown>,
  sandbox: Record<string, unknown>,
): ((args: Record<string, unknown>, context: Record<string, unknown>) => unknown) | null {
  const candidateFn =
    extractRunnerFromCandidate(moduleExports, toolName)
    ?? extractRunnerFromCandidate(namedExports, toolName)
    ?? extractRunnerFromCandidate(sandbox, toolName);

  return candidateFn;
}

function extractRunnerFromCandidate(
  candidate: unknown,
  toolName: string,
): ((args: Record<string, unknown>, context: Record<string, unknown>) => unknown) | null {
  if (typeof candidate === 'function') {
    return candidate as (args: Record<string, unknown>, context: Record<string, unknown>) => unknown;
  }
  if (!candidate || typeof candidate !== 'object') {
    return null;
  }

  const record = candidate as Record<string, unknown>;
  const toolSpecific = record[toolName];
  if (typeof toolSpecific === 'function') {
    return toolSpecific as (args: Record<string, unknown>, context: Record<string, unknown>) => unknown;
  }

  const generic = record['run'];
  if (typeof generic === 'function') {
    return generic as (args: Record<string, unknown>, context: Record<string, unknown>) => unknown;
  }

  return null;
}

function safeParseJson(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return { value: parsed };
  } catch {
    return { raw };
  }
}

function formatToolResult(value: unknown): string {
  if (typeof value === 'string') {
    return truncate(value);
  }
  if (value == null) {
    return 'Tool completed successfully.';
  }

  try {
    return truncate(JSON.stringify(value));
  } catch {
    return truncate(String(value));
  }
}

function truncate(value: string): string {
  if (value.length <= MAX_TOOL_RESULT_CHARS) {
    return value;
  }
  return `${value.slice(0, MAX_TOOL_RESULT_CHARS - 3)}...`;
}

function createNoopConsole(): {
  log: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
} {
  const noop = (..._args: unknown[]) => {};
  return {
    log: noop,
    info: noop,
    warn: noop,
    error: noop,
    debug: noop,
  };
}

async function auditExecutionFailure(
  runtime: ExternalSkillToolRuntime,
  toolName: string,
  reason: string,
): Promise<void> {
  try {
    await auditRepository.create({
      actorId: null,
      actorType: 'system',
      action: 'skill.execution_failed',
      targetType: 'skill',
      targetId: runtime.skillId,
      metadata: {
        skillSlug: runtime.skillSlug,
        skillName: runtime.skillSlug,
        toolName,
        reason,
      } as Record<string, string>,
    });
  } catch (err) {
    logger.warn({ err, skillSlug: runtime.skillSlug, toolName }, 'Failed to write skill failure audit');
  }
}
