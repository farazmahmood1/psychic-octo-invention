import { logger } from '@openclaw/config';
import type {
  GhlSubAgentInput,
  GhlSubAgentOutput,
  GhlContact,
  GhlActionType,
  SubAgentDispatch,
} from '@openclaw/shared';
// GHL_CRM_TOOL_NAME used externally; not needed in this service file
import {
  searchContacts,
  getContact,
  updateContact,
  GhlApiError,
} from '../../integrations/ghl/index.js';
import { ghlActionLogRepository } from '../../repositories/ghl-action-log.repository.js';
import { validateUpdates } from '../../validators/ghl-fields.js';

/**
 * GHL CRM Sub-Agent Service.
 *
 * Executes CRM operations routed through the orchestration layer.
 * The LLM produces a tool call with action + parameters, and this
 * service performs the actual GHL API operations with safeguards.
 *
 * Safeguards:
 * - Ambiguous contact matches trigger clarification instead of update
 * - Field validation prevents invalid data writes
 * - All operations are logged to GhlActionLog
 * - Only editable fields in the allowlist can be changed
 */
export async function executeGhlTask(
  input: GhlSubAgentInput,
): Promise<GhlSubAgentOutput> {
  switch (input.action) {
    case 'search_contact':
      return handleSearchContact(input);
    case 'get_contact':
      return handleGetContact(input);
    case 'update_contact':
      return handleUpdateContact(input);
    default:
      return {
        success: false,
        action: input.action,
        summary: `Unsupported CRM action: "${input.action}". Supported actions: search_contact, get_contact, update_contact.`,
        error: `Unsupported action: ${input.action}`,
      };
  }
}

/**
 * Process a SubAgentDispatch from the orchestrator.
 * Bridges the orchestration dispatch format to the sub-agent input.
 */
export async function processGhlDispatch(
  dispatch: SubAgentDispatch,
): Promise<SubAgentDispatch> {
  const input = dispatch.input as unknown as GhlSubAgentInput;

  try {
    const output = await executeGhlTask(input);
    return {
      ...dispatch,
      status: output.success ? 'completed' : 'failed',
      output: output as unknown as Record<string, unknown>,
      error: output.error,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return {
      ...dispatch,
      status: 'failed',
      error,
    };
  }
}

// ── Search Contact ─────────────────────────────────────────

async function handleSearchContact(input: GhlSubAgentInput): Promise<GhlSubAgentOutput> {
  const query = input.query?.trim();
  if (!query) {
    return {
      success: false,
      action: 'search_contact',
      summary: 'No search query provided. Please specify a name, email, or phone number to search for.',
      error: 'Missing search query',
    };
  }

  try {
    const result = await searchContacts(query);

    await ghlActionLogRepository.create({
      actionType: 'search_contact',
      requestPayload: { action: 'search', query },
      responsePayload: { total: result.total, contactIds: result.contacts.map((c) => c.id) },
      success: true,
      latencyMs: result.latencyMs,
    });

    if (result.total === 0) {
      return {
        success: true,
        action: 'search_contact',
        summary: `No contacts found matching "${query}".`,
        contact: null,
        candidates: [],
      };
    }

    if (result.total === 1) {
      const contact = result.contacts[0]!;
      return {
        success: true,
        action: 'search_contact',
        summary: `Found contact: ${formatContactName(contact)} (${contact.email ?? contact.phone ?? contact.id}).`,
        contact,
        candidates: result.contacts,
      };
    }

    // Multiple matches — return candidates for disambiguation
    const names = result.contacts
      .slice(0, 5)
      .map((c, i) => `${i + 1}. ${formatContactName(c)} (${c.email ?? c.phone ?? c.id})`)
      .join('\n');

    return {
      success: true,
      action: 'search_contact',
      summary: `Found ${result.total} contacts matching "${query}":\n${names}`,
      candidates: result.contacts.slice(0, 5),
      needsClarification: true,
      clarificationQuestion: `Multiple contacts match "${query}". Which one do you mean? Please provide more details (email, phone, or number from the list).`,
    };
  } catch (err) {
    return handleGhlError(err, 'search_contact', { query });
  }
}

// ── Get Contact ────────────────────────────────────────────

async function handleGetContact(input: GhlSubAgentInput): Promise<GhlSubAgentOutput> {
  const contactId = input.contactId?.trim();
  if (!contactId) {
    return {
      success: false,
      action: 'get_contact',
      summary: 'No contact ID provided.',
      error: 'Missing contactId',
    };
  }

  try {
    const contact = await getContact(contactId);
    const latencyMs = contact._latencyMs;

    await ghlActionLogRepository.create({
      actionType: 'get_contact',
      contactId,
      requestPayload: { action: 'get', contactId },
      responsePayload: { contactId: contact.id },
      success: true,
      latencyMs,
    });

    return {
      success: true,
      action: 'get_contact',
      summary: `Contact details for ${formatContactName(contact)}: email=${contact.email ?? 'N/A'}, phone=${contact.phone ?? 'N/A'}.`,
      contact,
    };
  } catch (err) {
    return handleGhlError(err, 'get_contact', { contactId });
  }
}

// ── Update Contact ─────────────────────────────────────────

async function handleUpdateContact(input: GhlSubAgentInput): Promise<GhlSubAgentOutput> {
  const query = input.query?.trim();
  let contactId = input.contactId?.trim();
  const updates = input.updates;

  if (!contactId) {
    if (!query) {
      return {
        success: false,
        action: 'update_contact',
        summary: 'No contact ID or contact query was provided for this update.',
        error: 'Missing contactId and query',
      };
    }

    try {
      const searchResult = await searchContacts(query);
      if (searchResult.total === 0) {
        return {
          success: false,
          action: 'update_contact',
          summary: `No contacts found matching "${query}", so I could not apply the update.`,
          error: 'Contact not found',
        };
      }

      if (searchResult.total > 1) {
        const names = searchResult.contacts
          .slice(0, 5)
          .map((c, i) => `${i + 1}. ${formatContactName(c)} (${c.email ?? c.phone ?? c.id})`)
          .join('\n');
        return {
          success: false,
          action: 'update_contact',
          summary: `Found ${searchResult.total} contacts matching "${query}":\n${names}`,
          candidates: searchResult.contacts.slice(0, 5),
          needsClarification: true,
          clarificationQuestion: `Multiple contacts match "${query}". Which one should I update?`,
          error: 'Ambiguous contact match',
        };
      }

      contactId = searchResult.contacts[0]?.id?.trim();
      if (!contactId) {
        return {
          success: false,
          action: 'update_contact',
          summary: `I found a contact for "${query}" but could not resolve a valid contact ID.`,
          error: 'Invalid contact ID from search',
        };
      }
    } catch (err) {
      return handleGhlError(err, 'update_contact', { query, updates });
    }
  }

  if (!contactId) {
    return {
      success: false,
      action: 'update_contact',
      summary: 'No contact ID provided for update.',
      error: 'Missing contactId',
    };
  }

  if (!updates || Object.keys(updates).length === 0) {
    return {
      success: false,
      action: 'update_contact',
      summary: 'No fields to update were specified.',
      error: 'Empty updates',
    };
  }

  // Validate field values
  const validation = validateUpdates(updates);
  if (!validation.valid) {
    return {
      success: false,
      action: 'update_contact',
      summary: `Cannot update: ${validation.errors.join('; ')}`,
      error: validation.errors.join('; '),
    };
  }

  try {
    // Fetch current contact to detect unchanged values
    let currentContact: GhlContact;
    try {
      currentContact = await getContact(contactId);
    } catch (err) {
      if (err instanceof GhlApiError && err.statusCode === 404) {
        return {
          success: false,
          action: 'update_contact',
          summary: `Contact with ID "${contactId}" was not found in the CRM.`,
          error: 'Contact not found',
        };
      }
      throw err;
    }

    // Detect unchanged fields
    const changedFields: Record<string, { from: unknown; to: unknown }> = {};
    const actualUpdates: Record<string, unknown> = {};

    for (const [field, newValue] of Object.entries(validation.validated)) {
      const currentValue = (currentContact as unknown as Record<string, unknown>)[field];
      if (currentValue !== newValue) {
        changedFields[field] = { from: currentValue, to: newValue };
        actualUpdates[field] = newValue;
      }
    }

    if (Object.keys(actualUpdates).length === 0) {
      return {
        success: true,
        action: 'update_contact',
        summary: `No changes needed - ${formatContactName(currentContact)}'s fields already have the requested values.`,
        contact: currentContact,
        changedFields: {},
      };
    }

    // Execute the update
    const result = await updateContact(contactId, actualUpdates);

    // Log to GHL action log
    await ghlActionLogRepository.create({
      actionType: 'update_contact',
      contactId,
      requestPayload: { updates: actualUpdates } as any,
      responsePayload: { contactId: result.contact.id, changedFields } as any,
      statusCode: result.statusCode,
      success: true,
      latencyMs: result.latencyMs,
    });

    // Build confirmation message
    const changeLines = Object.entries(changedFields)
      .map(([field, { from, to }]) => `- ${field}: "${from ?? 'empty'}" -> "${to}"`)
      .join('\n');

    return {
      success: true,
      action: 'update_contact',
      summary: `Updated ${formatContactName(result.contact)}:\n${changeLines}`,
      contact: result.contact,
      changedFields,
    };
  } catch (err) {
    return handleGhlError(err, 'update_contact', { contactId, query, updates });
  }
}

// ── Helpers ────────────────────────────────────────────────

function formatContactName(contact: GhlContact): string {
  if (contact.firstName && contact.lastName) return `${contact.firstName} ${contact.lastName}`;
  if (contact.name) return contact.name;
  if (contact.firstName) return contact.firstName;
  return contact.email ?? contact.phone ?? contact.id;
}

async function handleGhlError(
  err: unknown,
  action: string,
  request: Record<string, unknown>,
): Promise<GhlSubAgentOutput> {
  const error = err instanceof Error ? err : new Error(String(err));
  const isApiError = err instanceof GhlApiError;

  logger.error({ err: error, action }, 'GHL sub-agent operation failed');

  await ghlActionLogRepository.create({
    actionType: action as GhlActionType,
    contactId: request['contactId'] as string | undefined,
    requestPayload: request as any,
    statusCode: isApiError ? (err as GhlApiError).statusCode : undefined,
    success: false,
    errorMessage: error.message,
    latencyMs: isApiError ? (err as GhlApiError).latencyMs : undefined,
  }).catch((logErr) => {
    logger.warn({ err: logErr }, 'Failed to log GHL action error');
  });

  if (isApiError && (err as GhlApiError).statusCode === 429) {
    return {
      success: false,
      action,
      summary: 'The CRM API is temporarily rate-limited. Please try again in a moment.',
      error: 'Rate limited',
    };
  }

  if (error.message.includes('GHL API token is not configured')) {
    return {
      success: false,
      action,
      summary: 'The CRM integration is not configured. Set a real GHL_API_TOKEN before retrying.',
      error: 'GHL not configured',
    };
  }

  // Provide specific feedback based on the HTTP status code
  if (isApiError) {
    const status = (err as GhlApiError).statusCode;
    if (status === 401 || status === 403) {
      return {
        success: false,
        action,
        summary: 'The CRM API key is invalid or lacks the required permissions. Please check the GHL_API_TOKEN in settings.',
        error: `GHL auth error (${status}): ${error.message}`,
      };
    }
    if (status === 404) {
      return {
        success: false,
        action,
        summary: 'The requested CRM resource was not found. The contact may not exist, or the API endpoint is incorrect.',
        error: `GHL not found (404): ${error.message}`,
      };
    }
    if (status >= 500) {
      return {
        success: false,
        action,
        summary: 'The GoHighLevel API is experiencing server issues. Please try again later.',
        error: `GHL server error (${status}): ${error.message}`,
      };
    }
  }

  return {
    success: false,
    action,
    summary: `CRM operation failed: ${error.message.slice(0, 200)}`,
    error: error.message,
  };
}
