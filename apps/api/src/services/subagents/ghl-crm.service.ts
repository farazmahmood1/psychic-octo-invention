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
  createContact,
  createOpportunity,
  getOpportunity,
  updateOpportunity,
  searchOpportunities,
  deleteOpportunity,
  getPipelines,
  addNote,
  listNotes,
  getNote,
  updateNote,
  deleteNote,
  sendSms,
  listConversations,
  getConversation,
  updateConversation,
  listConversationMessages,
  listCalendars,
  getFreeSlots,
  createAppointment,
  updateAppointment,
  deleteCalendarEvent,
  createTask,
  listTasks,
  getTask,
  updateTask,
  deleteTask,
  getAppointment,
  updateInvoice,
  listUsers,
  getLocation,
  updateLocation,
  listReviews,
  createInvoice,
  getInvoice,
  listInvoices,
  sendInvoice,
  listOrders,
  getOrder,
  listContactAppointments,
  listCampaigns,
  listWorkflows,
  triggerWorkflow,
  listForms,
  getFormSubmissions,
  listSurveys,
  getSurveySubmissions,
  sendEmail,
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
    case 'create_contact':
      return handleCreateContact(input);
    case 'create_opportunity':
      return handleCreateOpportunity(input);
    case 'get_opportunity':
      return handleGetOpportunity(input);
    case 'update_opportunity':
      return handleUpdateOpportunity(input);
    case 'search_opportunities':
      return handleSearchOpportunities(input);
    case 'delete_opportunity':
      return handleDeleteOpportunity(input);
    case 'get_pipelines':
      return handleGetPipelines();
    case 'add_note':
      return handleAddNote(input);
    case 'list_notes':
      return handleListNotes(input);
    case 'get_note':
      return handleGetNote(input);
    case 'update_note':
      return handleUpdateNote(input);
    case 'delete_note':
      return handleDeleteNote(input);
    case 'send_sms':
      return handleSendSms(input);
    case 'list_conversations':
      return handleListConversations(input);
    case 'get_conversation':
      return handleGetConversation(input);
    case 'update_conversation':
      return handleUpdateConversation(input);
    case 'list_conversation_messages':
      return handleListConversationMessages(input);
    case 'list_calendars':
      return handleListCalendars();
    case 'get_free_slots':
      return handleGetFreeSlots(input);
    case 'create_appointment':
      return handleCreateAppointment(input);
    case 'get_appointment':
      return handleGetAppointment(input);
    case 'update_calendar_event':
      return handleUpdateCalendarEvent(input);
    case 'delete_calendar_event':
      return handleDeleteCalendarEvent(input);
    case 'list_contact_appointments':
      return handleListContactAppointments(input);
    case 'list_users':
      return handleListUsers();
    case 'get_location':
      return handleGetLocation();
    case 'update_location':
      return handleUpdateLocation(input);
    case 'list_reviews':
      return handleListReviews();
    case 'create_invoice':
      return handleCreateInvoice(input);
    case 'get_invoice':
      return handleGetInvoice(input);
    case 'list_invoices':
      return handleListInvoices(input);
    case 'send_invoice':
      return handleSendInvoice(input);
    case 'update_invoice':
      return handleUpdateInvoice(input);
    case 'list_orders':
      return handleListOrders(input);
    case 'get_order':
      return handleGetOrder(input);
    case 'list_campaigns':
      return handleListCampaigns();
    case 'list_workflows':
      return handleListWorkflows();
    case 'trigger_workflow':
      return handleTriggerWorkflow(input);
    case 'list_forms':
      return handleListForms();
    case 'get_form_submissions':
      return handleGetFormSubmissions(input);
    case 'list_surveys':
      return handleListSurveys();
    case 'get_survey_submissions':
      return handleGetSurveySubmissions(input);
    case 'send_email':
      return handleSendEmail(input);
    case 'create_task':
      return handleCreateTask(input);
    case 'list_tasks':
      return handleListTasks(input);
    case 'get_task':
      return handleGetTask(input);
    case 'update_task':
      return handleUpdateTask(input);
    case 'delete_task':
      return handleDeleteTask(input);
    default:
      return {
        success: false,
        action: input.action,
        summary: `Unsupported CRM action: "${input.action}".`,
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

    ghlActionLogRepository.create({
      actionType: 'search_contact',
      requestPayload: { action: 'search', query },
      responsePayload: { total: result.total, contactIds: result.contacts.map((c) => c.id) },
      success: true,
      latencyMs: result.latencyMs,
    }).catch((logErr) => {
      logger.warn({ err: logErr }, 'Failed to log GHL search action');
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

    ghlActionLogRepository.create({
      actionType: 'get_contact',
      contactId,
      requestPayload: { action: 'get', contactId },
      responsePayload: { contactId: contact.id },
      success: true,
      latencyMs,
    }).catch((logErr) => {
      logger.warn({ err: logErr }, 'Failed to log GHL get_contact action');
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

    // Log to GHL action log (non-blocking)
    ghlActionLogRepository.create({
      actionType: 'update_contact',
      contactId,
      requestPayload: { updates: actualUpdates } as any,
      responsePayload: { contactId: result.contact.id, changedFields } as any,
      statusCode: result.statusCode,
      success: true,
      latencyMs: result.latencyMs,
    }).catch((logErr) => {
      logger.warn({ err: logErr }, 'Failed to log GHL update_contact action');
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

// ── Create Contact ────────────────────────────────────────

async function handleCreateContact(input: GhlSubAgentInput): Promise<GhlSubAgentOutput> {
  const updates = input.updates;
  if (!updates || Object.keys(updates).length === 0) {
    return {
      success: false,
      action: 'create_contact',
      summary: 'No contact fields provided. Please provide at least a name, email, or phone number.',
      error: 'Missing contact fields',
    };
  }

  // Validate provided fields
  const validation = validateUpdates(updates);
  if (!validation.valid) {
    return {
      success: false,
      action: 'create_contact',
      summary: `Cannot create contact: ${validation.errors.join('; ')}`,
      error: validation.errors.join('; '),
    };
  }

  try {
    const result = await createContact(validation.validated);

    ghlActionLogRepository.create({
      actionType: 'create_contact',
      contactId: result.contact.id,
      requestPayload: { updates: validation.validated } as any,
      responsePayload: { contactId: result.contact.id } as any,
      statusCode: result.statusCode,
      success: true,
      latencyMs: result.latencyMs,
    }).catch((logErr) => {
      logger.warn({ err: logErr }, 'Failed to log GHL create_contact action');
    });

    return {
      success: true,
      action: 'create_contact',
      summary: `Created new contact: ${formatContactName(result.contact)} (ID: ${result.contact.id}).`,
      contact: result.contact,
    };
  } catch (err) {
    return handleGhlError(err, 'create_contact', { updates });
  }
}

// ── Opportunities / Pipelines ─────────────────────────────

async function handleGetPipelines(): Promise<GhlSubAgentOutput> {
  try {
    const result = await getPipelines();

    ghlActionLogRepository.create({
      actionType: 'custom',
      requestPayload: { action: 'get_pipelines' },
      responsePayload: { count: result.pipelines.length },
      success: true,
      latencyMs: result.latencyMs,
    }).catch((logErr) => {
      logger.warn({ err: logErr }, 'Failed to log GHL get_pipelines action');
    });

    if (result.pipelines.length === 0) {
      return {
        success: true,
        action: 'get_pipelines',
        summary: 'No pipelines found for this location.',
        pipelines: [],
      };
    }

    const pipelineList = result.pipelines
      .map((p) => {
        const stageNames = p.stages?.map((s) => s.name).join(', ') ?? 'no stages';
        return `- ${p.name} (ID: ${p.id}) — Stages: ${stageNames}`;
      })
      .join('\n');

    return {
      success: true,
      action: 'get_pipelines',
      summary: `Found ${result.pipelines.length} pipeline(s):\n${pipelineList}`,
      pipelines: result.pipelines,
    };
  } catch (err) {
    return handleGhlError(err, 'get_pipelines', {});
  }
}

async function handleCreateOpportunity(input: GhlSubAgentInput): Promise<GhlSubAgentOutput> {
  const { opportunityName, pipelineId, pipelineStageId, monetaryValue, contactId, query } = input;

  if (!opportunityName?.trim()) {
    return {
      success: false,
      action: 'create_opportunity',
      summary: 'No opportunity name provided. Please specify a name for the deal.',
      error: 'Missing opportunity name',
    };
  }

  if (!pipelineId?.trim() || !pipelineStageId?.trim()) {
    return {
      success: false,
      action: 'create_opportunity',
      summary: 'Pipeline ID and stage ID are required. Use get_pipelines to see available pipelines and stages.',
      error: 'Missing pipelineId or pipelineStageId',
    };
  }

  // Resolve contact ID if only a query was provided
  let resolvedContactId = contactId?.trim();
  if (!resolvedContactId) {
    if (!query?.trim()) {
      return {
        success: false,
        action: 'create_opportunity',
        summary: 'No contact ID or contact query provided. An opportunity must be linked to a contact.',
        error: 'Missing contactId and query',
      };
    }

    try {
      const searchResult = await searchContacts(query);
      if (searchResult.total === 0) {
        return {
          success: false,
          action: 'create_opportunity',
          summary: `No contacts found matching "${query}".`,
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
          action: 'create_opportunity',
          summary: `Found ${searchResult.total} contacts matching "${query}":\n${names}`,
          candidates: searchResult.contacts.slice(0, 5),
          needsClarification: true,
          clarificationQuestion: `Multiple contacts match "${query}". Which one should the opportunity be linked to?`,
          error: 'Ambiguous contact match',
        };
      }
      resolvedContactId = searchResult.contacts[0]?.id?.trim();
    } catch (err) {
      return handleGhlError(err, 'create_opportunity', { query, opportunityName });
    }
  }

  if (!resolvedContactId) {
    return {
      success: false,
      action: 'create_opportunity',
      summary: 'Could not resolve a valid contact ID.',
      error: 'Invalid contact ID',
    };
  }

  try {
    const result = await createOpportunity({
      pipelineId: pipelineId.trim(),
      pipelineStageId: pipelineStageId.trim(),
      contactId: resolvedContactId,
      name: opportunityName.trim(),
      monetaryValue,
    });

    ghlActionLogRepository.create({
      actionType: 'create_opportunity',
      contactId: resolvedContactId,
      opportunityId: result.opportunity.id,
      requestPayload: { opportunityName, pipelineId, pipelineStageId, monetaryValue, contactId: resolvedContactId } as any,
      responsePayload: { opportunityId: result.opportunity.id } as any,
      statusCode: result.statusCode,
      success: true,
      latencyMs: result.latencyMs,
    }).catch((logErr) => {
      logger.warn({ err: logErr }, 'Failed to log GHL create_opportunity action');
    });

    const valueStr = monetaryValue != null ? ` — Value: $${monetaryValue}` : '';
    return {
      success: true,
      action: 'create_opportunity',
      summary: `Created opportunity "${opportunityName}" (ID: ${result.opportunity.id})${valueStr}, linked to contact ${resolvedContactId}.`,
      opportunity: result.opportunity,
    };
  } catch (err) {
    return handleGhlError(err, 'create_opportunity', { opportunityName, pipelineId, pipelineStageId, contactId: resolvedContactId });
  }
}

// ── Add Note ──────────────────────────────────────────────

async function handleAddNote(input: GhlSubAgentInput): Promise<GhlSubAgentOutput> {
  const noteBody = input.noteBody?.trim();
  if (!noteBody) {
    return {
      success: false,
      action: 'add_note',
      summary: 'No note text provided. Please specify the note content.',
      error: 'Missing noteBody',
    };
  }

  // Resolve contact
  let contactId = input.contactId?.trim();
  if (!contactId) {
    const query = input.query?.trim();
    if (!query) {
      return {
        success: false,
        action: 'add_note',
        summary: 'No contact ID or search query provided. Please specify which contact to add the note to.',
        error: 'Missing contactId and query',
      };
    }

    try {
      const searchResult = await searchContacts(query);
      if (searchResult.total === 0) {
        return { success: false, action: 'add_note', summary: `No contacts found matching "${query}".`, error: 'Contact not found' };
      }
      if (searchResult.total > 1) {
        const names = searchResult.contacts
          .slice(0, 5)
          .map((c, i) => `${i + 1}. ${formatContactName(c)} (${c.email ?? c.phone ?? c.id})`)
          .join('\n');
        return {
          success: false, action: 'add_note',
          summary: `Found ${searchResult.total} contacts matching "${query}":\n${names}`,
          candidates: searchResult.contacts.slice(0, 5),
          needsClarification: true,
          clarificationQuestion: `Multiple contacts match "${query}". Which one should the note be added to?`,
          error: 'Ambiguous contact match',
        };
      }
      contactId = searchResult.contacts[0]?.id?.trim();
    } catch (err) {
      return handleGhlError(err, 'add_note', { query, noteBody });
    }
  }

  if (!contactId) {
    return { success: false, action: 'add_note', summary: 'Could not resolve a valid contact ID.', error: 'Invalid contact ID' };
  }

  try {
    const result = await addNote(contactId, noteBody);

    ghlActionLogRepository.create({
      actionType: 'add_note',
      contactId,
      requestPayload: { noteBody } as any,
      responsePayload: { noteId: result.note.id } as any,
      statusCode: result.statusCode,
      success: true,
      latencyMs: result.latencyMs,
    }).catch((logErr) => {
      logger.warn({ err: logErr }, 'Failed to log GHL add_note action');
    });

    return {
      success: true,
      action: 'add_note',
      summary: `Note added to contact ${contactId}: "${noteBody.slice(0, 100)}${noteBody.length > 100 ? '...' : ''}"`,
      note: result.note,
    };
  } catch (err) {
    return handleGhlError(err, 'add_note', { contactId, noteBody });
  }
}

// ── Send SMS ──────────────────────────────────────────────

async function handleSendSms(input: GhlSubAgentInput): Promise<GhlSubAgentOutput> {
  const message = input.message?.trim();
  if (!message) {
    return {
      success: false,
      action: 'send_sms',
      summary: 'No message text provided. Please specify the SMS content.',
      error: 'Missing message',
    };
  }

  // Resolve contact
  let contactId = input.contactId?.trim();
  if (!contactId) {
    const query = input.query?.trim();
    if (!query) {
      return {
        success: false,
        action: 'send_sms',
        summary: 'No contact ID or search query provided. Please specify who to send the SMS to.',
        error: 'Missing contactId and query',
      };
    }

    try {
      const searchResult = await searchContacts(query);
      if (searchResult.total === 0) {
        return { success: false, action: 'send_sms', summary: `No contacts found matching "${query}".`, error: 'Contact not found' };
      }
      if (searchResult.total > 1) {
        const names = searchResult.contacts
          .slice(0, 5)
          .map((c, i) => `${i + 1}. ${formatContactName(c)} (${c.email ?? c.phone ?? c.id})`)
          .join('\n');
        return {
          success: false, action: 'send_sms',
          summary: `Found ${searchResult.total} contacts matching "${query}":\n${names}`,
          candidates: searchResult.contacts.slice(0, 5),
          needsClarification: true,
          clarificationQuestion: `Multiple contacts match "${query}". Which one should receive the SMS?`,
          error: 'Ambiguous contact match',
        };
      }
      contactId = searchResult.contacts[0]?.id?.trim();
    } catch (err) {
      return handleGhlError(err, 'send_sms', { query, message });
    }
  }

  if (!contactId) {
    return { success: false, action: 'send_sms', summary: 'Could not resolve a valid contact ID.', error: 'Invalid contact ID' };
  }

  try {
    const result = await sendSms(contactId, message);

    ghlActionLogRepository.create({
      actionType: 'send_sms',
      contactId,
      requestPayload: { message } as any,
      responsePayload: { conversationId: result.conversationId, messageId: result.messageId } as any,
      statusCode: result.statusCode,
      success: true,
      latencyMs: result.latencyMs,
    }).catch((logErr) => {
      logger.warn({ err: logErr }, 'Failed to log GHL send_sms action');
    });

    return {
      success: true,
      action: 'send_sms',
      summary: `SMS sent to contact ${contactId}: "${message.slice(0, 80)}${message.length > 80 ? '...' : ''}"`,
      messageResult: {
        contactId,
        type: 'SMS',
        message,
        conversationId: result.conversationId,
      },
    };
  } catch (err) {
    return handleGhlError(err, 'send_sms', { contactId, message });
  }
}

// ── Calendars / Appointments ──────────────────────────────

async function handleListCalendars(): Promise<GhlSubAgentOutput> {
  try {
    const result = await listCalendars();

    ghlActionLogRepository.create({
      actionType: 'custom',
      requestPayload: { action: 'list_calendars' },
      responsePayload: { count: result.calendars.length },
      success: true,
      latencyMs: result.latencyMs,
    }).catch((logErr) => {
      logger.warn({ err: logErr }, 'Failed to log GHL list_calendars action');
    });

    if (result.calendars.length === 0) {
      return { success: true, action: 'list_calendars', summary: 'No calendars found for this location.', calendars: [] };
    }

    const calList = result.calendars
      .map((c) => `- ${c.name} (ID: ${c.id})${c.isActive === false ? ' [inactive]' : ''}`)
      .join('\n');

    return {
      success: true,
      action: 'list_calendars',
      summary: `Found ${result.calendars.length} calendar(s):\n${calList}`,
      calendars: result.calendars,
    };
  } catch (err) {
    return handleGhlError(err, 'list_calendars', {});
  }
}

async function handleGetFreeSlots(input: GhlSubAgentInput): Promise<GhlSubAgentOutput> {
  const calendarId = input.calendarId?.trim();
  const startTime = input.startTime?.trim();
  const endTime = input.endTime?.trim();

  if (!calendarId) {
    return {
      success: false,
      action: 'get_free_slots',
      summary: 'No calendar ID provided. Use list_calendars first to find available calendars.',
      error: 'Missing calendarId',
    };
  }
  if (!startTime || !endTime) {
    return {
      success: false,
      action: 'get_free_slots',
      summary: 'Both startTime and endTime are required (ISO 8601 format, e.g. "2025-01-15").',
      error: 'Missing startTime or endTime',
    };
  }

  try {
    const result = await getFreeSlots(calendarId, startTime, endTime);

    ghlActionLogRepository.create({
      actionType: 'custom',
      requestPayload: { action: 'get_free_slots', calendarId, startTime, endTime },
      responsePayload: { slotCount: result.slots.length },
      success: true,
      latencyMs: result.latencyMs,
    }).catch((logErr) => {
      logger.warn({ err: logErr }, 'Failed to log GHL get_free_slots action');
    });

    if (result.slots.length === 0) {
      return {
        success: true,
        action: 'get_free_slots',
        summary: `No available slots between ${startTime} and ${endTime}.`,
        slots: [],
      };
    }

    const slotList = result.slots
      .slice(0, 10)
      .map((s) => `- ${s.start} → ${s.end}`)
      .join('\n');
    const moreText = result.slots.length > 10 ? `\n...and ${result.slots.length - 10} more` : '';

    return {
      success: true,
      action: 'get_free_slots',
      summary: `Found ${result.slots.length} available slot(s):\n${slotList}${moreText}`,
      slots: result.slots,
    };
  } catch (err) {
    return handleGhlError(err, 'get_free_slots', { calendarId, startTime, endTime });
  }
}

async function handleCreateAppointment(input: GhlSubAgentInput): Promise<GhlSubAgentOutput> {
  const { calendarId, startTime, endTime, title, appointmentNotes } = input;

  if (!calendarId?.trim()) {
    return {
      success: false,
      action: 'create_appointment',
      summary: 'No calendar ID provided. Use list_calendars first to find available calendars.',
      error: 'Missing calendarId',
    };
  }
  if (!startTime?.trim() || !endTime?.trim()) {
    return {
      success: false,
      action: 'create_appointment',
      summary: 'Both startTime and endTime are required (ISO 8601 format).',
      error: 'Missing startTime or endTime',
    };
  }

  // Resolve contact
  let contactId = input.contactId?.trim();
  if (!contactId) {
    const query = input.query?.trim();
    if (!query) {
      return {
        success: false,
        action: 'create_appointment',
        summary: 'No contact ID or search query provided. An appointment must be linked to a contact.',
        error: 'Missing contactId and query',
      };
    }

    try {
      const searchResult = await searchContacts(query);
      if (searchResult.total === 0) {
        return { success: false, action: 'create_appointment', summary: `No contacts found matching "${query}".`, error: 'Contact not found' };
      }
      if (searchResult.total > 1) {
        const names = searchResult.contacts
          .slice(0, 5)
          .map((c, i) => `${i + 1}. ${formatContactName(c)} (${c.email ?? c.phone ?? c.id})`)
          .join('\n');
        return {
          success: false, action: 'create_appointment',
          summary: `Found ${searchResult.total} contacts matching "${query}":\n${names}`,
          candidates: searchResult.contacts.slice(0, 5),
          needsClarification: true,
          clarificationQuestion: `Multiple contacts match "${query}". Which one should the appointment be booked for?`,
          error: 'Ambiguous contact match',
        };
      }
      contactId = searchResult.contacts[0]?.id?.trim();
    } catch (err) {
      return handleGhlError(err, 'create_appointment', { query, calendarId, startTime, endTime });
    }
  }

  if (!contactId) {
    return { success: false, action: 'create_appointment', summary: 'Could not resolve a valid contact ID.', error: 'Invalid contact ID' };
  }

  try {
    const result = await createAppointment({
      calendarId: calendarId.trim(),
      contactId,
      startTime: startTime.trim(),
      endTime: endTime.trim(),
      title: title?.trim(),
      notes: appointmentNotes?.trim(),
    });

    ghlActionLogRepository.create({
      actionType: 'custom',
      contactId,
      requestPayload: { calendarId, contactId, startTime, endTime, title, notes: appointmentNotes } as any,
      responsePayload: { appointmentId: result.appointment.id } as any,
      statusCode: result.statusCode,
      success: true,
      latencyMs: result.latencyMs,
    }).catch((logErr) => {
      logger.warn({ err: logErr }, 'Failed to log GHL create_appointment action');
    });

    const titleStr = title ? ` "${title}"` : '';
    return {
      success: true,
      action: 'create_appointment',
      summary: `Appointment${titleStr} created (ID: ${result.appointment.id}) for contact ${contactId} from ${startTime} to ${endTime}.`,
      appointment: result.appointment,
    };
  } catch (err) {
    return handleGhlError(err, 'create_appointment', { calendarId, contactId, startTime, endTime });
  }
}

async function handleGetAppointment(input: GhlSubAgentInput): Promise<GhlSubAgentOutput> {
  const eventId = input.eventId?.trim();
  if (!eventId) {
    return {
      success: false,
      action: 'get_appointment',
      summary: 'No event/appointment ID provided.',
      error: 'Missing eventId',
    };
  }

  try {
    const result = await getAppointment(eventId);

    ghlActionLogRepository.create({
      actionType: 'custom',
      requestPayload: { action: 'get_appointment', eventId } as any,
      responsePayload: { appointmentId: result.appointment.id } as any,
      success: true,
      latencyMs: result.latencyMs,
    }).catch((logErr) => {
      logger.warn({ err: logErr }, 'Failed to log GHL get_appointment action');
    });

    const a = result.appointment;
    const details = [
      a.title ?? 'Untitled appointment',
      a.status ? `Status: ${a.status}` : null,
      a.startTime ? `Start: ${a.startTime}` : null,
      a.endTime ? `End: ${a.endTime}` : null,
      a.contactId ? `Contact: ${a.contactId}` : null,
    ].filter(Boolean).join(' | ');

    return {
      success: true,
      action: 'get_appointment',
      summary: `Appointment ${eventId}: ${details}`,
      appointment: a,
    };
  } catch (err) {
    return handleGhlError(err, 'get_appointment', { eventId });
  }
}

// ── Calendar Event Management ─────────────────────────────

async function handleUpdateCalendarEvent(input: GhlSubAgentInput): Promise<GhlSubAgentOutput> {
  const eventId = input.eventId?.trim();
  if (!eventId) {
    return {
      success: false,
      action: 'update_calendar_event',
      summary: 'No event ID provided. Please specify the calendar event to update.',
      error: 'Missing eventId',
    };
  }

  const updates: Record<string, unknown> = {};
  if (input.startTime) updates['startTime'] = input.startTime;
  if (input.endTime) updates['endTime'] = input.endTime;
  if (input.title) updates['title'] = input.title;
  if (input.appointmentNotes) updates['notes'] = input.appointmentNotes;

  if (Object.keys(updates).length === 0) {
    return {
      success: false,
      action: 'update_calendar_event',
      summary: 'No fields to update were specified.',
      error: 'Empty updates',
    };
  }

  try {
    const result = await updateAppointment(eventId, updates);

    ghlActionLogRepository.create({
      actionType: 'custom',
      requestPayload: { action: 'update_calendar_event', eventId, updates } as any,
      responsePayload: { appointmentId: result.appointment.id } as any,
      statusCode: result.statusCode,
      success: true,
      latencyMs: result.latencyMs,
    }).catch((logErr) => {
      logger.warn({ err: logErr }, 'Failed to log GHL update_calendar_event action');
    });

    return {
      success: true,
      action: 'update_calendar_event',
      summary: `Calendar event ${eventId} updated successfully.`,
      appointment: result.appointment,
    };
  } catch (err) {
    return handleGhlError(err, 'update_calendar_event', { eventId, updates });
  }
}

async function handleDeleteCalendarEvent(input: GhlSubAgentInput): Promise<GhlSubAgentOutput> {
  const eventId = input.eventId?.trim();
  if (!eventId) {
    return {
      success: false,
      action: 'delete_calendar_event',
      summary: 'No event ID provided. Please specify the calendar event to delete.',
      error: 'Missing eventId',
    };
  }

  try {
    const result = await deleteCalendarEvent(eventId);

    ghlActionLogRepository.create({
      actionType: 'custom',
      requestPayload: { action: 'delete_calendar_event', eventId } as any,
      responsePayload: { deleted: true } as any,
      statusCode: result.statusCode,
      success: true,
      latencyMs: result.latencyMs,
    }).catch((logErr) => {
      logger.warn({ err: logErr }, 'Failed to log GHL delete_calendar_event action');
    });

    return {
      success: true,
      action: 'delete_calendar_event',
      summary: `Calendar event ${eventId} has been deleted.`,
    };
  } catch (err) {
    return handleGhlError(err, 'delete_calendar_event', { eventId });
  }
}

async function handleListContactAppointments(input: GhlSubAgentInput): Promise<GhlSubAgentOutput> {
  // Resolve contact
  let contactId = input.contactId?.trim();
  if (!contactId) {
    const query = input.query?.trim();
    if (!query) {
      return {
        success: false,
        action: 'list_contact_appointments',
        summary: 'No contact ID or search query provided.',
        error: 'Missing contactId and query',
      };
    }

    try {
      const searchResult = await searchContacts(query);
      if (searchResult.total === 0) {
        return { success: false, action: 'list_contact_appointments', summary: `No contacts found matching "${query}".`, error: 'Contact not found' };
      }
      if (searchResult.total > 1) {
        const names = searchResult.contacts
          .slice(0, 5)
          .map((c, i) => `${i + 1}. ${formatContactName(c)} (${c.email ?? c.phone ?? c.id})`)
          .join('\n');
        return {
          success: false, action: 'list_contact_appointments',
          summary: `Found ${searchResult.total} contacts matching "${query}":\n${names}`,
          candidates: searchResult.contacts.slice(0, 5),
          needsClarification: true,
          clarificationQuestion: `Multiple contacts match "${query}". Which one's appointments do you want to see?`,
          error: 'Ambiguous contact match',
        };
      }
      contactId = searchResult.contacts[0]?.id?.trim();
    } catch (err) {
      return handleGhlError(err, 'list_contact_appointments', { query });
    }
  }

  if (!contactId) {
    return { success: false, action: 'list_contact_appointments', summary: 'Could not resolve a valid contact ID.', error: 'Invalid contact ID' };
  }

  try {
    const result = await listContactAppointments(contactId);

    ghlActionLogRepository.create({
      actionType: 'custom',
      contactId,
      requestPayload: { action: 'list_contact_appointments', contactId } as any,
      responsePayload: { count: result.appointments.length } as any,
      success: true,
      latencyMs: result.latencyMs,
    }).catch((logErr) => {
      logger.warn({ err: logErr }, 'Failed to log GHL list_contact_appointments action');
    });

    if (result.appointments.length === 0) {
      return { success: true, action: 'list_contact_appointments', summary: `No appointments found for contact ${contactId}.`, appointments: [] };
    }

    const apptList = result.appointments
      .slice(0, 10)
      .map((a) => `- ${a.title ?? 'Untitled'} (${a.startTime} → ${a.endTime}) [${a.status}]`)
      .join('\n');
    const moreText = result.appointments.length > 10 ? `\n...and ${result.appointments.length - 10} more` : '';

    return {
      success: true,
      action: 'list_contact_appointments',
      summary: `Found ${result.appointments.length} appointment(s) for contact ${contactId}:\n${apptList}${moreText}`,
      appointments: result.appointments,
    };
  } catch (err) {
    return handleGhlError(err, 'list_contact_appointments', { contactId });
  }
}

// ── Users ─────────────────────────────────────────────────

async function handleListUsers(): Promise<GhlSubAgentOutput> {
  try {
    const result = await listUsers();

    ghlActionLogRepository.create({
      actionType: 'custom',
      requestPayload: { action: 'list_users' },
      responsePayload: { count: result.users.length },
      success: true,
      latencyMs: result.latencyMs,
    }).catch((logErr) => {
      logger.warn({ err: logErr }, 'Failed to log GHL list_users action');
    });

    if (result.users.length === 0) {
      return { success: true, action: 'list_users', summary: 'No users found for this location.', users: [] };
    }

    const userList = result.users
      .map((u) => `- ${u.name ?? u.firstName ?? u.email ?? u.id} (${u.role ?? 'unknown role'}, ${u.email ?? 'no email'})`)
      .join('\n');

    return {
      success: true,
      action: 'list_users',
      summary: `Found ${result.users.length} user(s):\n${userList}`,
      users: result.users,
    };
  } catch (err) {
    return handleGhlError(err, 'list_users', {});
  }
}

// ── Locations ─────────────────────────────────────────────

async function handleGetLocation(): Promise<GhlSubAgentOutput> {
  try {
    const result = await getLocation();

    ghlActionLogRepository.create({
      actionType: 'custom',
      requestPayload: { action: 'get_location' },
      responsePayload: { locationId: result.location.id },
      success: true,
      latencyMs: result.latencyMs,
    }).catch((logErr) => {
      logger.warn({ err: logErr }, 'Failed to log GHL get_location action');
    });

    const loc = result.location;
    const details = [
      loc.name ? `Name: ${loc.name}` : null,
      loc.address ? `Address: ${loc.address}` : null,
      loc.city ? `City: ${loc.city}` : null,
      loc.state ? `State: ${loc.state}` : null,
      loc.phone ? `Phone: ${loc.phone}` : null,
      loc.email ? `Email: ${loc.email}` : null,
      loc.website ? `Website: ${loc.website}` : null,
      loc.timezone ? `Timezone: ${loc.timezone}` : null,
    ].filter(Boolean).join(', ');

    return {
      success: true,
      action: 'get_location',
      summary: `Location info: ${details || 'No details available.'}`,
      location: loc,
    };
  } catch (err) {
    return handleGhlError(err, 'get_location', {});
  }
}

async function handleUpdateLocation(input: GhlSubAgentInput): Promise<GhlSubAgentOutput> {
  const updates = input.locationUpdates ?? input.updates;
  if (!updates || Object.keys(updates).length === 0) {
    return {
      success: false,
      action: 'update_location',
      summary: 'No location fields to update were specified.',
      error: 'Empty updates',
    };
  }

  try {
    const result = await updateLocation(updates);

    ghlActionLogRepository.create({
      actionType: 'custom',
      requestPayload: { action: 'update_location', updates } as any,
      responsePayload: { locationId: result.location.id } as any,
      statusCode: result.statusCode,
      success: true,
      latencyMs: result.latencyMs,
    }).catch((logErr) => {
      logger.warn({ err: logErr }, 'Failed to log GHL update_location action');
    });

    const changeLines = Object.entries(updates)
      .map(([field, value]) => `- ${field}: "${value}"`)
      .join('\n');

    return {
      success: true,
      action: 'update_location',
      summary: `Location updated:\n${changeLines}`,
      location: result.location,
    };
  } catch (err) {
    return handleGhlError(err, 'update_location', { updates });
  }
}

// ── Reviews ───────────────────────────────────────────────

async function handleListReviews(): Promise<GhlSubAgentOutput> {
  try {
    const result = await listReviews({ limit: 20 });

    ghlActionLogRepository.create({
      actionType: 'custom',
      requestPayload: { action: 'list_reviews' },
      responsePayload: { count: result.reviews.length },
      success: true,
      latencyMs: result.latencyMs,
    }).catch((logErr) => {
      logger.warn({ err: logErr }, 'Failed to log GHL list_reviews action');
    });

    if (result.reviews.length === 0) {
      return { success: true, action: 'list_reviews', summary: 'No reviews found for this location.', reviews: [] };
    }

    const reviewList = result.reviews
      .slice(0, 10)
      .map((r) => {
        const clamped = Math.max(0, Math.min(5, r.rating!));
        const stars = r.rating != null ? `${'★'.repeat(clamped)}${'☆'.repeat(5 - clamped)}` : 'unrated';
        const snippet = r.body ? ` — "${r.body.slice(0, 80)}${r.body.length > 80 ? '...' : ''}"` : '';
        return `- ${stars} by ${r.reviewer ?? 'Anonymous'} (${r.source ?? 'unknown'})${snippet}`;
      })
      .join('\n');
    const moreText = result.reviews.length > 10 ? `\n...and ${result.reviews.length - 10} more` : '';

    return {
      success: true,
      action: 'list_reviews',
      summary: `Found ${result.reviews.length} review(s):\n${reviewList}${moreText}`,
      reviews: result.reviews,
    };
  } catch (err) {
    return handleGhlError(err, 'list_reviews', {});
  }
}

// ── Invoices ──────────────────────────────────────────────

async function handleCreateInvoice(input: GhlSubAgentInput): Promise<GhlSubAgentOutput> {
  // Resolve contact
  let contactId = input.contactId?.trim();
  if (!contactId) {
    const query = input.query?.trim();
    if (!query) {
      return {
        success: false,
        action: 'create_invoice',
        summary: 'No contact ID or search query provided. An invoice must be linked to a contact.',
        error: 'Missing contactId and query',
      };
    }

    try {
      const searchResult = await searchContacts(query);
      if (searchResult.total === 0) {
        return { success: false, action: 'create_invoice', summary: `No contacts found matching "${query}".`, error: 'Contact not found' };
      }
      if (searchResult.total > 1) {
        const names = searchResult.contacts
          .slice(0, 5)
          .map((c, i) => `${i + 1}. ${formatContactName(c)} (${c.email ?? c.phone ?? c.id})`)
          .join('\n');
        return {
          success: false, action: 'create_invoice',
          summary: `Found ${searchResult.total} contacts matching "${query}":\n${names}`,
          candidates: searchResult.contacts.slice(0, 5),
          needsClarification: true,
          clarificationQuestion: `Multiple contacts match "${query}". Which one should the invoice be for?`,
          error: 'Ambiguous contact match',
        };
      }
      contactId = searchResult.contacts[0]?.id?.trim();
    } catch (err) {
      return handleGhlError(err, 'create_invoice', { query });
    }
  }

  if (!contactId) {
    return { success: false, action: 'create_invoice', summary: 'Could not resolve a valid contact ID.', error: 'Invalid contact ID' };
  }

  try {
    const result = await createInvoice({
      contactId,
      name: input.invoiceName?.trim(),
      title: input.title?.trim(),
      dueDate: input.dueDate?.trim(),
      currency: input.currency?.trim(),
      items: input.invoiceItems,
    });

    ghlActionLogRepository.create({
      actionType: 'custom',
      contactId,
      requestPayload: { action: 'create_invoice', contactId, name: input.invoiceName, items: input.invoiceItems } as any,
      responsePayload: { invoiceId: result.invoice.id } as any,
      statusCode: result.statusCode,
      success: true,
      latencyMs: result.latencyMs,
    }).catch((logErr) => {
      logger.warn({ err: logErr }, 'Failed to log GHL create_invoice action');
    });

    const nameStr = input.invoiceName ? ` "${input.invoiceName}"` : '';
    return {
      success: true,
      action: 'create_invoice',
      summary: `Invoice${nameStr} created (ID: ${result.invoice.id}) for contact ${contactId}.`,
      invoice: result.invoice,
    };
  } catch (err) {
    return handleGhlError(err, 'create_invoice', { contactId });
  }
}

async function handleGetInvoice(input: GhlSubAgentInput): Promise<GhlSubAgentOutput> {
  const invoiceId = input.invoiceId?.trim();
  if (!invoiceId) {
    return {
      success: false,
      action: 'get_invoice',
      summary: 'No invoice ID provided.',
      error: 'Missing invoiceId',
    };
  }

  try {
    const result = await getInvoice(invoiceId);

    ghlActionLogRepository.create({
      actionType: 'custom',
      requestPayload: { action: 'get_invoice', invoiceId } as any,
      responsePayload: { invoiceId: result.invoice.id } as any,
      success: true,
      latencyMs: result.latencyMs,
    }).catch((logErr) => {
      logger.warn({ err: logErr }, 'Failed to log GHL get_invoice action');
    });

    const inv = result.invoice;
    const details = [
      inv.name ?? inv.title ?? 'Untitled',
      inv.status ? `Status: ${inv.status}` : null,
      inv.total != null ? `Total: ${inv.currency ?? 'USD'} ${inv.total}` : null,
      inv.amountDue != null ? `Due: ${inv.currency ?? 'USD'} ${inv.amountDue}` : null,
      inv.dueDate ? `Due date: ${inv.dueDate}` : null,
    ].filter(Boolean).join(' | ');

    return {
      success: true,
      action: 'get_invoice',
      summary: `Invoice ${invoiceId}: ${details}`,
      invoice: inv,
    };
  } catch (err) {
    return handleGhlError(err, 'get_invoice', { invoiceId });
  }
}

async function handleListInvoices(input: GhlSubAgentInput): Promise<GhlSubAgentOutput> {
  try {
    const result = await listInvoices({
      contactId: input.contactId?.trim(),
    });

    ghlActionLogRepository.create({
      actionType: 'custom',
      requestPayload: { action: 'list_invoices', contactId: input.contactId } as any,
      responsePayload: { count: result.invoices.length } as any,
      success: true,
      latencyMs: result.latencyMs,
    }).catch((logErr) => {
      logger.warn({ err: logErr }, 'Failed to log GHL list_invoices action');
    });

    if (result.invoices.length === 0) {
      return { success: true, action: 'list_invoices', summary: 'No invoices found.', invoices: [] };
    }

    const invList = result.invoices
      .slice(0, 10)
      .map((inv) => {
        const totalStr = inv.total != null ? ` — ${inv.currency ?? 'USD'} ${inv.total}` : '';
        return `- ${inv.name ?? inv.title ?? 'Untitled'} (ID: ${inv.id}) [${inv.status ?? 'unknown'}]${totalStr}`;
      })
      .join('\n');
    const moreText = result.invoices.length > 10 ? `\n...and ${result.invoices.length - 10} more` : '';

    return {
      success: true,
      action: 'list_invoices',
      summary: `Found ${result.invoices.length} invoice(s):\n${invList}${moreText}`,
      invoices: result.invoices,
    };
  } catch (err) {
    return handleGhlError(err, 'list_invoices', {});
  }
}

async function handleSendInvoice(input: GhlSubAgentInput): Promise<GhlSubAgentOutput> {
  const invoiceId = input.invoiceId?.trim();
  if (!invoiceId) {
    return {
      success: false,
      action: 'send_invoice',
      summary: 'No invoice ID provided. Please specify which invoice to send.',
      error: 'Missing invoiceId',
    };
  }

  try {
    const result = await sendInvoice(invoiceId);

    ghlActionLogRepository.create({
      actionType: 'custom',
      requestPayload: { action: 'send_invoice', invoiceId } as any,
      responsePayload: { invoiceId: result.invoice.id, status: result.invoice.status } as any,
      statusCode: result.statusCode,
      success: true,
      latencyMs: result.latencyMs,
    }).catch((logErr) => {
      logger.warn({ err: logErr }, 'Failed to log GHL send_invoice action');
    });

    return {
      success: true,
      action: 'send_invoice',
      summary: `Invoice ${invoiceId} has been sent to the contact.`,
      invoice: result.invoice,
    };
  } catch (err) {
    return handleGhlError(err, 'send_invoice', { invoiceId });
  }
}

async function handleUpdateInvoice(input: GhlSubAgentInput): Promise<GhlSubAgentOutput> {
  const invoiceId = input.invoiceId?.trim();
  if (!invoiceId) {
    return {
      success: false,
      action: 'update_invoice',
      summary: 'No invoice ID provided.',
      error: 'Missing invoiceId',
    };
  }

  const updates: Record<string, unknown> = {};
  if (input.invoiceName) updates['name'] = input.invoiceName;
  if (input.dueDate) updates['dueDate'] = input.dueDate;
  if (input.currency) updates['currency'] = input.currency;
  if (input.invoiceItems) updates['items'] = input.invoiceItems;

  if (Object.keys(updates).length === 0) {
    return {
      success: false,
      action: 'update_invoice',
      summary: 'No updates provided. Provide invoiceName, dueDate, currency, or invoiceItems.',
      error: 'No updates',
    };
  }

  try {
    const result = await updateInvoice(invoiceId, updates);

    ghlActionLogRepository.create({
      actionType: 'custom',
      requestPayload: { action: 'update_invoice', invoiceId, updates } as any,
      responsePayload: { invoiceId: result.invoice.id } as any,
      statusCode: result.statusCode,
      success: true,
      latencyMs: result.latencyMs,
    }).catch((logErr) => {
      logger.warn({ err: logErr }, 'Failed to log GHL update_invoice action');
    });

    const inv = result.invoice;
    const details = [
      inv.name ?? inv.title ?? 'Untitled',
      inv.status ? `Status: ${inv.status}` : null,
      inv.total != null ? `Total: ${inv.currency ?? 'USD'} ${inv.total}` : null,
    ].filter(Boolean).join(' | ');

    return {
      success: true,
      action: 'update_invoice',
      summary: `Invoice ${invoiceId} updated: ${details}`,
      invoice: inv,
    };
  } catch (err) {
    return handleGhlError(err, 'update_invoice', { invoiceId, updates });
  }
}

// ── Orders ────────────────────────────────────────────────

async function handleListOrders(input: GhlSubAgentInput): Promise<GhlSubAgentOutput> {
  try {
    const result = await listOrders({
      contactId: input.contactId?.trim(),
    });

    ghlActionLogRepository.create({
      actionType: 'custom',
      requestPayload: { action: 'list_orders', contactId: input.contactId } as any,
      responsePayload: { count: result.orders.length } as any,
      success: true,
      latencyMs: result.latencyMs,
    }).catch((logErr) => {
      logger.warn({ err: logErr }, 'Failed to log GHL list_orders action');
    });

    if (result.orders.length === 0) {
      return { success: true, action: 'list_orders', summary: 'No orders found.', orders: [] };
    }

    const orderList = result.orders
      .slice(0, 10)
      .map((o) => {
        const amountStr = o.amount != null ? ` — ${o.currency ?? 'USD'} ${o.amount}` : '';
        return `- Order ${o.id} [${o.status ?? 'unknown'}]${amountStr} (${o.contactName ?? o.contactEmail ?? 'unknown contact'})`;
      })
      .join('\n');
    const moreText = result.orders.length > 10 ? `\n...and ${result.orders.length - 10} more` : '';

    return {
      success: true,
      action: 'list_orders',
      summary: `Found ${result.orders.length} order(s):\n${orderList}${moreText}`,
      orders: result.orders,
    };
  } catch (err) {
    return handleGhlError(err, 'list_orders', {});
  }
}

async function handleGetOrder(input: GhlSubAgentInput): Promise<GhlSubAgentOutput> {
  const orderId = input.orderId?.trim();
  if (!orderId) {
    return {
      success: false,
      action: 'get_order',
      summary: 'No order ID provided.',
      error: 'Missing orderId',
    };
  }

  try {
    const result = await getOrder(orderId);

    ghlActionLogRepository.create({
      actionType: 'custom',
      requestPayload: { action: 'get_order', orderId } as any,
      responsePayload: { orderId: result.order.id } as any,
      success: true,
      latencyMs: result.latencyMs,
    }).catch((logErr) => {
      logger.warn({ err: logErr }, 'Failed to log GHL get_order action');
    });

    const o = result.order;
    const details = [
      o.status ? `Status: ${o.status}` : null,
      o.amount != null ? `Amount: ${o.currency ?? 'USD'} ${o.amount}` : null,
      o.contactName ? `Contact: ${o.contactName}` : null,
      o.paymentMethod ? `Payment: ${o.paymentMethod}` : null,
      o.fulfillmentStatus ? `Fulfillment: ${o.fulfillmentStatus}` : null,
    ].filter(Boolean).join(' | ');

    return {
      success: true,
      action: 'get_order',
      summary: `Order ${orderId}: ${details || 'No details available.'}`,
      order: o,
    };
  } catch (err) {
    return handleGhlError(err, 'get_order', { orderId });
  }
}

// ── Campaigns ─────────────────────────────────────────────

async function handleListCampaigns(): Promise<GhlSubAgentOutput> {
  try {
    const result = await listCampaigns();

    ghlActionLogRepository.create({
      actionType: 'custom',
      requestPayload: { action: 'list_campaigns' },
      responsePayload: { count: result.campaigns.length },
      success: true,
      latencyMs: result.latencyMs,
    }).catch((logErr) => {
      logger.warn({ err: logErr }, 'Failed to log GHL list_campaigns action');
    });

    if (result.campaigns.length === 0) {
      return { success: true, action: 'list_campaigns', summary: 'No campaigns found for this location.', campaigns: [] };
    }

    const campList = result.campaigns
      .slice(0, 15)
      .map((c) => `- ${c.name ?? 'Unnamed'} (ID: ${c.id}) [${c.status ?? 'unknown'}]${c.type ? ` — ${c.type}` : ''}`)
      .join('\n');
    const moreText = result.campaigns.length > 15 ? `\n...and ${result.campaigns.length - 15} more` : '';

    return {
      success: true,
      action: 'list_campaigns',
      summary: `Found ${result.campaigns.length} campaign(s):\n${campList}${moreText}`,
      campaigns: result.campaigns,
    };
  } catch (err) {
    return handleGhlError(err, 'list_campaigns', {});
  }
}

// ── Workflows ─────────────────────────────────────────────

async function handleListWorkflows(): Promise<GhlSubAgentOutput> {
  try {
    const result = await listWorkflows();

    ghlActionLogRepository.create({
      actionType: 'custom',
      requestPayload: { action: 'list_workflows' },
      responsePayload: { count: result.workflows.length },
      success: true,
      latencyMs: result.latencyMs,
    }).catch((logErr) => {
      logger.warn({ err: logErr }, 'Failed to log GHL list_workflows action');
    });

    if (result.workflows.length === 0) {
      return { success: true, action: 'list_workflows', summary: 'No workflows found for this location.', workflows: [] };
    }

    const wfList = result.workflows
      .slice(0, 15)
      .map((w) => `- ${w.name ?? 'Unnamed'} (ID: ${w.id}) [${w.status ?? 'unknown'}]`)
      .join('\n');
    const moreText = result.workflows.length > 15 ? `\n...and ${result.workflows.length - 15} more` : '';

    return {
      success: true,
      action: 'list_workflows',
      summary: `Found ${result.workflows.length} workflow(s):\n${wfList}${moreText}`,
      workflows: result.workflows,
    };
  } catch (err) {
    return handleGhlError(err, 'list_workflows', {});
  }
}

async function handleTriggerWorkflow(input: GhlSubAgentInput): Promise<GhlSubAgentOutput> {
  const workflowId = input.workflowId?.trim();
  if (!workflowId) {
    return {
      success: false,
      action: 'trigger_workflow',
      summary: 'No workflow ID provided. Use list_workflows to find available workflows.',
      error: 'Missing workflowId',
    };
  }

  // Resolve contact
  let contactId = input.contactId?.trim();
  if (!contactId) {
    const query = input.query?.trim();
    if (!query) {
      return {
        success: false,
        action: 'trigger_workflow',
        summary: 'No contact ID or search query provided. Please specify which contact to add to the workflow.',
        error: 'Missing contactId and query',
      };
    }

    try {
      const searchResult = await searchContacts(query);
      if (searchResult.total === 0) {
        return { success: false, action: 'trigger_workflow', summary: `No contacts found matching "${query}".`, error: 'Contact not found' };
      }
      if (searchResult.total > 1) {
        const names = searchResult.contacts
          .slice(0, 5)
          .map((c, i) => `${i + 1}. ${formatContactName(c)} (${c.email ?? c.phone ?? c.id})`)
          .join('\n');
        return {
          success: false, action: 'trigger_workflow',
          summary: `Found ${searchResult.total} contacts matching "${query}":\n${names}`,
          candidates: searchResult.contacts.slice(0, 5),
          needsClarification: true,
          clarificationQuestion: `Multiple contacts match "${query}". Which one should be added to the workflow?`,
          error: 'Ambiguous contact match',
        };
      }
      contactId = searchResult.contacts[0]?.id?.trim();
    } catch (err) {
      return handleGhlError(err, 'trigger_workflow', { query, workflowId });
    }
  }

  if (!contactId) {
    return { success: false, action: 'trigger_workflow', summary: 'Could not resolve a valid contact ID.', error: 'Invalid contact ID' };
  }

  try {
    const result = await triggerWorkflow(contactId, workflowId);

    ghlActionLogRepository.create({
      actionType: 'custom',
      contactId,
      requestPayload: { action: 'trigger_workflow', contactId, workflowId } as any,
      responsePayload: { triggered: true } as any,
      statusCode: result.statusCode,
      success: true,
      latencyMs: result.latencyMs,
    }).catch((logErr) => {
      logger.warn({ err: logErr }, 'Failed to log GHL trigger_workflow action');
    });

    return {
      success: true,
      action: 'trigger_workflow',
      summary: `Contact ${contactId} has been added to workflow ${workflowId}.`,
    };
  } catch (err) {
    return handleGhlError(err, 'trigger_workflow', { contactId, workflowId });
  }
}

// ── Forms ─────────────────────────────────────────────────

async function handleListForms(): Promise<GhlSubAgentOutput> {
  try {
    const result = await listForms();

    ghlActionLogRepository.create({
      actionType: 'custom',
      requestPayload: { action: 'list_forms' },
      responsePayload: { count: result.forms.length },
      success: true,
      latencyMs: result.latencyMs,
    }).catch((logErr) => {
      logger.warn({ err: logErr }, 'Failed to log GHL list_forms action');
    });

    if (result.forms.length === 0) {
      return { success: true, action: 'list_forms', summary: 'No forms found for this location.', forms: [] };
    }

    const formList = result.forms
      .slice(0, 15)
      .map((f) => `- ${f.name ?? 'Unnamed'} (ID: ${f.id})${f.type ? ` [${f.type}]` : ''}`)
      .join('\n');
    const moreText = result.forms.length > 15 ? `\n...and ${result.forms.length - 15} more` : '';

    return {
      success: true,
      action: 'list_forms',
      summary: `Found ${result.forms.length} form(s):\n${formList}${moreText}`,
      forms: result.forms,
    };
  } catch (err) {
    return handleGhlError(err, 'list_forms', {});
  }
}

async function handleGetFormSubmissions(input: GhlSubAgentInput): Promise<GhlSubAgentOutput> {
  try {
    const result = await getFormSubmissions({
      formId: input.formId?.trim(),
      limit: 20,
    });

    ghlActionLogRepository.create({
      actionType: 'custom',
      requestPayload: { action: 'get_form_submissions', formId: input.formId } as any,
      responsePayload: { count: result.submissions.length } as any,
      success: true,
      latencyMs: result.latencyMs,
    }).catch((logErr) => {
      logger.warn({ err: logErr }, 'Failed to log GHL get_form_submissions action');
    });

    if (result.submissions.length === 0) {
      const filterStr = input.formId ? ` for form ${input.formId}` : '';
      return { success: true, action: 'get_form_submissions', summary: `No form submissions found${filterStr}.`, formSubmissions: [] };
    }

    const subList = result.submissions
      .slice(0, 10)
      .map((s) => {
        const who = s.name ?? s.email ?? s.contactId ?? 'Unknown';
        return `- ${who} (ID: ${s.id})${s.createdAt ? ` — ${s.createdAt}` : ''}`;
      })
      .join('\n');
    const moreText = result.submissions.length > 10 ? `\n...and ${result.submissions.length - 10} more` : '';

    return {
      success: true,
      action: 'get_form_submissions',
      summary: `Found ${result.submissions.length} submission(s):\n${subList}${moreText}`,
      formSubmissions: result.submissions,
    };
  } catch (err) {
    return handleGhlError(err, 'get_form_submissions', { formId: input.formId });
  }
}

// ── Surveys ───────────────────────────────────────────────

async function handleListSurveys(): Promise<GhlSubAgentOutput> {
  try {
    const result = await listSurveys();

    ghlActionLogRepository.create({
      actionType: 'custom',
      requestPayload: { action: 'list_surveys' },
      responsePayload: { count: result.surveys.length },
      success: true,
      latencyMs: result.latencyMs,
    }).catch((logErr) => {
      logger.warn({ err: logErr }, 'Failed to log GHL list_surveys action');
    });

    if (result.surveys.length === 0) {
      return { success: true, action: 'list_surveys', summary: 'No surveys found for this location.', surveys: [] };
    }

    const surveyList = result.surveys
      .slice(0, 15)
      .map((s) => `- ${s.name ?? 'Unnamed'} (ID: ${s.id})`)
      .join('\n');
    const moreText = result.surveys.length > 15 ? `\n...and ${result.surveys.length - 15} more` : '';

    return {
      success: true,
      action: 'list_surveys',
      summary: `Found ${result.surveys.length} survey(s):\n${surveyList}${moreText}`,
      surveys: result.surveys,
    };
  } catch (err) {
    return handleGhlError(err, 'list_surveys', {});
  }
}

async function handleGetSurveySubmissions(input: GhlSubAgentInput): Promise<GhlSubAgentOutput> {
  try {
    const result = await getSurveySubmissions({
      surveyId: input.surveyId?.trim(),
      limit: 20,
    });

    ghlActionLogRepository.create({
      actionType: 'custom',
      requestPayload: { action: 'get_survey_submissions', surveyId: input.surveyId } as any,
      responsePayload: { count: result.submissions.length } as any,
      success: true,
      latencyMs: result.latencyMs,
    }).catch((logErr) => {
      logger.warn({ err: logErr }, 'Failed to log GHL get_survey_submissions action');
    });

    if (result.submissions.length === 0) {
      const filterStr = input.surveyId ? ` for survey ${input.surveyId}` : '';
      return { success: true, action: 'get_survey_submissions', summary: `No survey submissions found${filterStr}.`, surveySubmissions: [] };
    }

    const subList = result.submissions
      .slice(0, 10)
      .map((s) => {
        const who = s.name ?? s.email ?? s.contactId ?? 'Unknown';
        return `- ${who} (ID: ${s.id})${s.createdAt ? ` — ${s.createdAt}` : ''}`;
      })
      .join('\n');
    const moreText = result.submissions.length > 10 ? `\n...and ${result.submissions.length - 10} more` : '';

    return {
      success: true,
      action: 'get_survey_submissions',
      summary: `Found ${result.submissions.length} submission(s):\n${subList}${moreText}`,
      surveySubmissions: result.submissions,
    };
  } catch (err) {
    return handleGhlError(err, 'get_survey_submissions', { surveyId: input.surveyId });
  }
}

// ── Email ─────────────────────────────────────────────────

async function handleSendEmail(input: GhlSubAgentInput): Promise<GhlSubAgentOutput> {
  const subject = input.emailSubject?.trim();
  const body = input.emailBody?.trim() ?? input.message?.trim();
  const html = input.emailHtml?.trim();

  if (!subject) {
    return {
      success: false,
      action: 'send_email',
      summary: 'No email subject provided. Please specify a subject line.',
      error: 'Missing emailSubject',
    };
  }

  if (!body && !html) {
    return {
      success: false,
      action: 'send_email',
      summary: 'No email body provided. Please specify the email content.',
      error: 'Missing emailBody',
    };
  }

  // Resolve contact
  let contactId = input.contactId?.trim();
  if (!contactId) {
    const query = input.query?.trim();
    if (!query) {
      return {
        success: false,
        action: 'send_email',
        summary: 'No contact ID or search query provided. Please specify who to send the email to.',
        error: 'Missing contactId and query',
      };
    }

    try {
      const searchResult = await searchContacts(query);
      if (searchResult.total === 0) {
        return { success: false, action: 'send_email', summary: `No contacts found matching "${query}".`, error: 'Contact not found' };
      }
      if (searchResult.total > 1) {
        const names = searchResult.contacts
          .slice(0, 5)
          .map((c, i) => `${i + 1}. ${formatContactName(c)} (${c.email ?? c.phone ?? c.id})`)
          .join('\n');
        return {
          success: false, action: 'send_email',
          summary: `Found ${searchResult.total} contacts matching "${query}":\n${names}`,
          candidates: searchResult.contacts.slice(0, 5),
          needsClarification: true,
          clarificationQuestion: `Multiple contacts match "${query}". Which one should receive the email?`,
          error: 'Ambiguous contact match',
        };
      }
      contactId = searchResult.contacts[0]?.id?.trim();
    } catch (err) {
      return handleGhlError(err, 'send_email', { query, subject });
    }
  }

  if (!contactId) {
    return { success: false, action: 'send_email', summary: 'Could not resolve a valid contact ID.', error: 'Invalid contact ID' };
  }

  try {
    const result = await sendEmail(contactId, subject, body ?? '', html);

    ghlActionLogRepository.create({
      actionType: 'custom',
      contactId,
      requestPayload: { action: 'send_email', contactId, subject } as any,
      responsePayload: { conversationId: result.conversationId, messageId: result.messageId } as any,
      statusCode: result.statusCode,
      success: true,
      latencyMs: result.latencyMs,
    }).catch((logErr) => {
      logger.warn({ err: logErr }, 'Failed to log GHL send_email action');
    });

    return {
      success: true,
      action: 'send_email',
      summary: `Email sent to contact ${contactId} with subject "${subject}".`,
      messageResult: {
        contactId,
        type: 'Email',
        subject,
        message: body,
        conversationId: result.conversationId,
      },
    };
  } catch (err) {
    return handleGhlError(err, 'send_email', { contactId, subject });
  }
}

// ── Conversations ─────────────────────────────────────────

async function handleListConversations(input: GhlSubAgentInput): Promise<GhlSubAgentOutput> {
  try {
    const result = await listConversations({
      query: input.query?.trim(),
      status: input.conversationStatus?.trim(),
      assignedTo: input.assignedTo?.trim(),
      limit: 20,
    });

    ghlActionLogRepository.create({
      actionType: 'custom',
      requestPayload: { action: 'list_conversations', query: input.query, status: input.conversationStatus } as any,
      responsePayload: { count: result.conversations.length } as any,
      success: true,
      latencyMs: result.latencyMs,
    }).catch((logErr) => {
      logger.warn({ err: logErr }, 'Failed to log GHL list_conversations action');
    });

    if (result.conversations.length === 0) {
      const filterStr = input.query ? ` matching "${input.query}"` : '';
      return { success: true, action: 'list_conversations', summary: `No conversations found${filterStr}.`, conversations: [] };
    }

    const convList = result.conversations
      .slice(0, 10)
      .map((c) => {
        const contact = c.contactName ?? c.contactId ?? 'Unknown';
        const lastMsg = c.lastMessageBody ? ` — "${c.lastMessageBody.slice(0, 60)}${c.lastMessageBody.length > 60 ? '...' : ''}"` : '';
        const unread = c.unreadCount ? ` [${c.unreadCount} unread]` : '';
        return `- ${contact} (ID: ${c.id}) [${c.type ?? 'unknown'}]${unread}${lastMsg}`;
      })
      .join('\n');
    const moreText = result.conversations.length > 10 ? `\n...and ${result.conversations.length - 10} more` : '';

    return {
      success: true,
      action: 'list_conversations',
      summary: `Found ${result.conversations.length} conversation(s):\n${convList}${moreText}`,
      conversations: result.conversations,
    };
  } catch (err) {
    return handleGhlError(err, 'list_conversations', { query: input.query });
  }
}

async function handleGetConversation(input: GhlSubAgentInput): Promise<GhlSubAgentOutput> {
  const conversationId = input.conversationId?.trim();
  if (!conversationId) {
    return {
      success: false,
      action: 'get_conversation',
      summary: 'No conversation ID provided. Use list_conversations to find conversations.',
      error: 'Missing conversationId',
    };
  }

  try {
    const result = await getConversation(conversationId);

    ghlActionLogRepository.create({
      actionType: 'custom',
      requestPayload: { action: 'get_conversation', conversationId } as any,
      responsePayload: { conversationId: result.conversation.id } as any,
      success: true,
      latencyMs: result.latencyMs,
    }).catch((logErr) => {
      logger.warn({ err: logErr }, 'Failed to log GHL get_conversation action');
    });

    const conv = result.conversation;
    const details = [
      conv.contactName ?? conv.contactId ?? 'Unknown contact',
      conv.type ? `Type: ${conv.type}` : null,
      conv.status ? `Status: ${conv.status}` : null,
      conv.unreadCount ? `Unread: ${conv.unreadCount}` : null,
      conv.assignedTo ? `Assigned: ${conv.assignedTo}` : null,
      conv.lastMessageBody ? `Last: "${conv.lastMessageBody.slice(0, 80)}"` : null,
    ].filter(Boolean).join(' | ');

    return {
      success: true,
      action: 'get_conversation',
      summary: `Conversation ${conversationId}: ${details}`,
      conversation: conv,
    };
  } catch (err) {
    return handleGhlError(err, 'get_conversation', { conversationId });
  }
}

async function handleUpdateConversation(input: GhlSubAgentInput): Promise<GhlSubAgentOutput> {
  const conversationId = input.conversationId?.trim();
  if (!conversationId) {
    return {
      success: false,
      action: 'update_conversation',
      summary: 'No conversation ID provided.',
      error: 'Missing conversationId',
    };
  }

  const updates: Record<string, unknown> = {};
  if (input.conversationStatus) updates['status'] = input.conversationStatus;
  if (input.assignedTo) updates['assignedTo'] = input.assignedTo;
  if (input.updates) Object.assign(updates, input.updates);

  if (Object.keys(updates).length === 0) {
    return {
      success: false,
      action: 'update_conversation',
      summary: 'No fields to update were specified. Supported fields: status, assignedTo, starred, unreadCount.',
      error: 'Empty updates',
    };
  }

  try {
    const result = await updateConversation(conversationId, updates);

    ghlActionLogRepository.create({
      actionType: 'custom',
      requestPayload: { action: 'update_conversation', conversationId, updates } as any,
      responsePayload: { conversationId: result.conversation.id } as any,
      statusCode: result.statusCode,
      success: true,
      latencyMs: result.latencyMs,
    }).catch((logErr) => {
      logger.warn({ err: logErr }, 'Failed to log GHL update_conversation action');
    });

    const changeLines = Object.entries(updates)
      .map(([field, value]) => `- ${field}: "${value}"`)
      .join('\n');

    return {
      success: true,
      action: 'update_conversation',
      summary: `Conversation ${conversationId} updated:\n${changeLines}`,
      conversation: result.conversation,
    };
  } catch (err) {
    return handleGhlError(err, 'update_conversation', { conversationId, updates });
  }
}

async function handleListConversationMessages(input: GhlSubAgentInput): Promise<GhlSubAgentOutput> {
  const conversationId = input.conversationId?.trim();
  if (!conversationId) {
    return {
      success: false,
      action: 'list_conversation_messages',
      summary: 'No conversation ID provided. Use list_conversations to find conversations first.',
      error: 'Missing conversationId',
    };
  }

  try {
    const result = await listConversationMessages(conversationId, { limit: 20 });

    ghlActionLogRepository.create({
      actionType: 'custom',
      requestPayload: { action: 'list_conversation_messages', conversationId } as any,
      responsePayload: { count: result.messages.length } as any,
      success: true,
      latencyMs: result.latencyMs,
    }).catch((logErr) => {
      logger.warn({ err: logErr }, 'Failed to log GHL list_conversation_messages action');
    });

    if (result.messages.length === 0) {
      return { success: true, action: 'list_conversation_messages', summary: `No messages found in conversation ${conversationId}.`, conversationMessages: [] };
    }

    const msgList = result.messages
      .slice(0, 15)
      .map((m) => {
        const dir = m.direction === 'inbound' ? '←' : '→';
        const body = m.message ? `"${m.message.slice(0, 80)}${m.message.length > 80 ? '...' : ''}"` : (m.type === 'Call' ? `[Call${m.callDuration ? ` ${m.callDuration}s` : ''}${m.callStatus ? ` - ${m.callStatus}` : ''}]` : '[no body]');
        return `- ${dir} [${m.type}] ${body}${m.dateAdded ? ` (${m.dateAdded})` : ''}`;
      })
      .join('\n');
    const moreText = result.messages.length > 15 ? `\n...and ${result.messages.length - 15} more` : '';

    return {
      success: true,
      action: 'list_conversation_messages',
      summary: `Found ${result.messages.length} message(s) in conversation ${conversationId}:\n${msgList}${moreText}`,
      conversationMessages: result.messages,
    };
  } catch (err) {
    return handleGhlError(err, 'list_conversation_messages', { conversationId });
  }
}

// ── Opportunities (Enhanced) ──────────────────────────────

async function handleGetOpportunity(input: GhlSubAgentInput): Promise<GhlSubAgentOutput> {
  const opportunityId = input.opportunityId?.trim();
  if (!opportunityId) {
    return {
      success: false,
      action: 'get_opportunity',
      summary: 'No opportunity ID provided.',
      error: 'Missing opportunityId',
    };
  }

  try {
    const result = await getOpportunity(opportunityId);

    ghlActionLogRepository.create({
      actionType: 'custom',
      opportunityId,
      requestPayload: { action: 'get_opportunity', opportunityId } as any,
      responsePayload: { opportunityId: result.opportunity.id } as any,
      success: true,
      latencyMs: result.latencyMs,
    }).catch((logErr) => {
      logger.warn({ err: logErr }, 'Failed to log GHL get_opportunity action');
    });

    const opp = result.opportunity;
    const details = [
      `Name: ${opp.name}`,
      opp.status ? `Status: ${opp.status}` : null,
      opp.monetaryValue != null ? `Value: $${opp.monetaryValue}` : null,
      opp.pipelineId ? `Pipeline: ${opp.pipelineId}` : null,
      opp.pipelineStageId ? `Stage: ${opp.pipelineStageId}` : null,
      opp.contactId ? `Contact: ${opp.contactId}` : null,
      opp.assignedTo ? `Assigned: ${opp.assignedTo}` : null,
    ].filter(Boolean).join(' | ');

    return {
      success: true,
      action: 'get_opportunity',
      summary: `Opportunity ${opportunityId}: ${details}`,
      opportunity: opp,
    };
  } catch (err) {
    return handleGhlError(err, 'get_opportunity', { opportunityId });
  }
}

async function handleUpdateOpportunity(input: GhlSubAgentInput): Promise<GhlSubAgentOutput> {
  const opportunityId = input.opportunityId?.trim();
  if (!opportunityId) {
    return {
      success: false,
      action: 'update_opportunity',
      summary: 'No opportunity ID provided. Use search_opportunities to find opportunities.',
      error: 'Missing opportunityId',
    };
  }

  const updates: Record<string, unknown> = {};
  if (input.pipelineStageId) updates['pipelineStageId'] = input.pipelineStageId;
  if (input.opportunityStatus) updates['status'] = input.opportunityStatus;
  if (input.opportunityName) updates['name'] = input.opportunityName;
  if (input.monetaryValue != null) updates['monetaryValue'] = input.monetaryValue;
  if (input.assignedTo) updates['assignedTo'] = input.assignedTo;
  if (input.updates) Object.assign(updates, input.updates);

  if (Object.keys(updates).length === 0) {
    return {
      success: false,
      action: 'update_opportunity',
      summary: 'No fields to update were specified. Supported: pipelineStageId, status, name, monetaryValue, assignedTo.',
      error: 'Empty updates',
    };
  }

  try {
    const result = await updateOpportunity(opportunityId, updates);

    ghlActionLogRepository.create({
      actionType: 'custom',
      opportunityId,
      requestPayload: { action: 'update_opportunity', opportunityId, updates } as any,
      responsePayload: { opportunityId: result.opportunity.id } as any,
      statusCode: result.statusCode,
      success: true,
      latencyMs: result.latencyMs,
    }).catch((logErr) => {
      logger.warn({ err: logErr }, 'Failed to log GHL update_opportunity action');
    });

    const changeLines = Object.entries(updates)
      .map(([field, value]) => `- ${field}: "${value}"`)
      .join('\n');

    return {
      success: true,
      action: 'update_opportunity',
      summary: `Opportunity "${result.opportunity.name}" (${opportunityId}) updated:\n${changeLines}`,
      opportunity: result.opportunity,
    };
  } catch (err) {
    return handleGhlError(err, 'update_opportunity', { opportunityId, updates });
  }
}

async function handleSearchOpportunities(input: GhlSubAgentInput): Promise<GhlSubAgentOutput> {
  try {
    const result = await searchOpportunities({
      query: input.query?.trim(),
      pipelineId: input.pipelineId?.trim(),
      pipelineStageId: input.pipelineStageId?.trim(),
      status: input.opportunityStatus?.trim(),
      contactId: input.contactId?.trim(),
      limit: 20,
    });

    ghlActionLogRepository.create({
      actionType: 'custom',
      requestPayload: { action: 'search_opportunities', query: input.query, pipelineId: input.pipelineId } as any,
      responsePayload: { count: result.opportunities.length } as any,
      success: true,
      latencyMs: result.latencyMs,
    }).catch((logErr) => {
      logger.warn({ err: logErr }, 'Failed to log GHL search_opportunities action');
    });

    if (result.opportunities.length === 0) {
      const filterStr = input.query ? ` matching "${input.query}"` : '';
      return { success: true, action: 'search_opportunities', summary: `No opportunities found${filterStr}.`, opportunities: [] };
    }

    const oppList = result.opportunities
      .slice(0, 10)
      .map((o) => {
        const valueStr = o.monetaryValue != null ? ` — $${o.monetaryValue}` : '';
        return `- ${o.name} (ID: ${o.id}) [${o.status}]${valueStr}`;
      })
      .join('\n');
    const moreText = result.opportunities.length > 10 ? `\n...and ${result.opportunities.length - 10} more` : '';

    return {
      success: true,
      action: 'search_opportunities',
      summary: `Found ${result.opportunities.length} opportunity/ies:\n${oppList}${moreText}`,
      opportunities: result.opportunities,
    };
  } catch (err) {
    return handleGhlError(err, 'search_opportunities', { query: input.query });
  }
}

async function handleDeleteOpportunity(input: GhlSubAgentInput): Promise<GhlSubAgentOutput> {
  const opportunityId = input.opportunityId?.trim();
  if (!opportunityId) {
    return {
      success: false,
      action: 'delete_opportunity',
      summary: 'No opportunity ID provided.',
      error: 'Missing opportunityId',
    };
  }

  try {
    const result = await deleteOpportunity(opportunityId);

    ghlActionLogRepository.create({
      actionType: 'custom',
      opportunityId,
      requestPayload: { action: 'delete_opportunity', opportunityId } as any,
      responsePayload: { deleted: true } as any,
      statusCode: result.statusCode,
      success: true,
      latencyMs: result.latencyMs,
    }).catch((logErr) => {
      logger.warn({ err: logErr }, 'Failed to log GHL delete_opportunity action');
    });

    return {
      success: true,
      action: 'delete_opportunity',
      summary: `Opportunity ${opportunityId} has been deleted.`,
    };
  } catch (err) {
    return handleGhlError(err, 'delete_opportunity', { opportunityId });
  }
}

// ── Notes (Enhanced) ──────────────────────────────────────

async function handleListNotes(input: GhlSubAgentInput): Promise<GhlSubAgentOutput> {
  // Resolve contact
  let contactId = input.contactId?.trim();
  if (!contactId) {
    const query = input.query?.trim();
    if (!query) {
      return {
        success: false,
        action: 'list_notes',
        summary: 'No contact ID or search query provided.',
        error: 'Missing contactId and query',
      };
    }

    try {
      const searchResult = await searchContacts(query);
      if (searchResult.total === 0) {
        return { success: false, action: 'list_notes', summary: `No contacts found matching "${query}".`, error: 'Contact not found' };
      }
      if (searchResult.total > 1) {
        const names = searchResult.contacts
          .slice(0, 5)
          .map((c, i) => `${i + 1}. ${formatContactName(c)} (${c.email ?? c.phone ?? c.id})`)
          .join('\n');
        return {
          success: false, action: 'list_notes',
          summary: `Found ${searchResult.total} contacts matching "${query}":\n${names}`,
          candidates: searchResult.contacts.slice(0, 5),
          needsClarification: true,
          clarificationQuestion: `Multiple contacts match "${query}". Which one's notes do you want to see?`,
          error: 'Ambiguous contact match',
        };
      }
      contactId = searchResult.contacts[0]?.id?.trim();
    } catch (err) {
      return handleGhlError(err, 'list_notes', { query });
    }
  }

  if (!contactId) {
    return { success: false, action: 'list_notes', summary: 'Could not resolve a valid contact ID.', error: 'Invalid contact ID' };
  }

  try {
    const result = await listNotes(contactId);

    ghlActionLogRepository.create({
      actionType: 'custom',
      contactId,
      requestPayload: { action: 'list_notes', contactId } as any,
      responsePayload: { count: result.notes.length } as any,
      success: true,
      latencyMs: result.latencyMs,
    }).catch((logErr) => {
      logger.warn({ err: logErr }, 'Failed to log GHL list_notes action');
    });

    if (result.notes.length === 0) {
      return { success: true, action: 'list_notes', summary: `No notes found for contact ${contactId}.`, notes: [] };
    }

    const noteList = result.notes
      .slice(0, 10)
      .map((n) => `- (ID: ${n.id}) "${n.body.slice(0, 80)}${n.body.length > 80 ? '...' : ''}"${n.dateAdded ? ` — ${n.dateAdded}` : ''}`)
      .join('\n');
    const moreText = result.notes.length > 10 ? `\n...and ${result.notes.length - 10} more` : '';

    return {
      success: true,
      action: 'list_notes',
      summary: `Found ${result.notes.length} note(s) for contact ${contactId}:\n${noteList}${moreText}`,
      notes: result.notes,
    };
  } catch (err) {
    return handleGhlError(err, 'list_notes', { contactId });
  }
}

async function handleGetNote(input: GhlSubAgentInput): Promise<GhlSubAgentOutput> {
  const contactId = input.contactId?.trim();
  const noteId = input.noteId?.trim();

  if (!contactId) {
    return { success: false, action: 'get_note', summary: 'No contact ID provided.', error: 'Missing contactId' };
  }
  if (!noteId) {
    return { success: false, action: 'get_note', summary: 'No note ID provided. Use list_notes to find notes.', error: 'Missing noteId' };
  }

  try {
    const result = await getNote(contactId, noteId);

    ghlActionLogRepository.create({
      actionType: 'custom',
      contactId,
      requestPayload: { action: 'get_note', contactId, noteId } as any,
      responsePayload: { noteId: result.note.id } as any,
      success: true,
      latencyMs: result.latencyMs,
    }).catch((logErr) => {
      logger.warn({ err: logErr }, 'Failed to log GHL get_note action');
    });

    return {
      success: true,
      action: 'get_note',
      summary: `Note ${noteId}: "${result.note.body}"${result.note.dateAdded ? ` — Added: ${result.note.dateAdded}` : ''}`,
      note: result.note,
    };
  } catch (err) {
    return handleGhlError(err, 'get_note', { contactId, noteId });
  }
}

async function handleUpdateNote(input: GhlSubAgentInput): Promise<GhlSubAgentOutput> {
  const contactId = input.contactId?.trim();
  const noteId = input.noteId?.trim();
  const noteBody = input.noteBody?.trim();

  if (!contactId) {
    return { success: false, action: 'update_note', summary: 'No contact ID provided.', error: 'Missing contactId' };
  }
  if (!noteId) {
    return { success: false, action: 'update_note', summary: 'No note ID provided.', error: 'Missing noteId' };
  }
  if (!noteBody) {
    return { success: false, action: 'update_note', summary: 'No note body provided.', error: 'Missing noteBody' };
  }

  try {
    const result = await updateNote(contactId, noteId, noteBody);

    ghlActionLogRepository.create({
      actionType: 'custom',
      contactId,
      requestPayload: { action: 'update_note', contactId, noteId, noteBody } as any,
      responsePayload: { noteId: result.note.id } as any,
      statusCode: result.statusCode,
      success: true,
      latencyMs: result.latencyMs,
    }).catch((logErr) => {
      logger.warn({ err: logErr }, 'Failed to log GHL update_note action');
    });

    return {
      success: true,
      action: 'update_note',
      summary: `Note ${noteId} updated: "${noteBody.slice(0, 100)}${noteBody.length > 100 ? '...' : ''}"`,
      note: result.note,
    };
  } catch (err) {
    return handleGhlError(err, 'update_note', { contactId, noteId });
  }
}

async function handleDeleteNote(input: GhlSubAgentInput): Promise<GhlSubAgentOutput> {
  const contactId = input.contactId?.trim();
  const noteId = input.noteId?.trim();

  if (!contactId) {
    return { success: false, action: 'delete_note', summary: 'No contact ID provided.', error: 'Missing contactId' };
  }
  if (!noteId) {
    return { success: false, action: 'delete_note', summary: 'No note ID provided.', error: 'Missing noteId' };
  }

  try {
    const result = await deleteNote(contactId, noteId);

    ghlActionLogRepository.create({
      actionType: 'custom',
      contactId,
      requestPayload: { action: 'delete_note', contactId, noteId } as any,
      responsePayload: { deleted: true } as any,
      statusCode: result.statusCode,
      success: true,
      latencyMs: result.latencyMs,
    }).catch((logErr) => {
      logger.warn({ err: logErr }, 'Failed to log GHL delete_note action');
    });

    return {
      success: true,
      action: 'delete_note',
      summary: `Note ${noteId} has been deleted from contact ${contactId}.`,
    };
  } catch (err) {
    return handleGhlError(err, 'delete_note', { contactId, noteId });
  }
}

// ── Tasks ─────────────────────────────────────────────────

async function handleCreateTask(input: GhlSubAgentInput): Promise<GhlSubAgentOutput> {
  const taskTitle = input.taskTitle?.trim() ?? input.title?.trim();
  if (!taskTitle) {
    return {
      success: false,
      action: 'create_task',
      summary: 'No task title provided. Please specify a title for the task.',
      error: 'Missing taskTitle',
    };
  }

  // Resolve contact
  let contactId = input.contactId?.trim();
  if (!contactId) {
    const query = input.query?.trim();
    if (!query) {
      return {
        success: false,
        action: 'create_task',
        summary: 'No contact ID or search query provided. A task must be linked to a contact.',
        error: 'Missing contactId and query',
      };
    }

    try {
      const searchResult = await searchContacts(query);
      if (searchResult.total === 0) {
        return { success: false, action: 'create_task', summary: `No contacts found matching "${query}".`, error: 'Contact not found' };
      }
      if (searchResult.total > 1) {
        const names = searchResult.contacts
          .slice(0, 5)
          .map((c, i) => `${i + 1}. ${formatContactName(c)} (${c.email ?? c.phone ?? c.id})`)
          .join('\n');
        return {
          success: false, action: 'create_task',
          summary: `Found ${searchResult.total} contacts matching "${query}":\n${names}`,
          candidates: searchResult.contacts.slice(0, 5),
          needsClarification: true,
          clarificationQuestion: `Multiple contacts match "${query}". Which one should the task be linked to?`,
          error: 'Ambiguous contact match',
        };
      }
      contactId = searchResult.contacts[0]?.id?.trim();
    } catch (err) {
      return handleGhlError(err, 'create_task', { query, taskTitle });
    }
  }

  if (!contactId) {
    return { success: false, action: 'create_task', summary: 'Could not resolve a valid contact ID.', error: 'Invalid contact ID' };
  }

  try {
    const result = await createTask(contactId, {
      title: taskTitle,
      body: input.taskBody?.trim() ?? input.noteBody?.trim(),
      dueDate: input.taskDueDate?.trim() ?? input.dueDate?.trim(),
      assignedTo: input.assignedTo?.trim(),
      status: input.taskStatus?.trim(),
      completed: input.taskCompleted,
    });

    ghlActionLogRepository.create({
      actionType: 'custom',
      contactId,
      requestPayload: { action: 'create_task', contactId, title: taskTitle } as any,
      responsePayload: { taskId: result.task.id } as any,
      statusCode: result.statusCode,
      success: true,
      latencyMs: result.latencyMs,
    }).catch((logErr) => {
      logger.warn({ err: logErr }, 'Failed to log GHL create_task action');
    });

    const dueDateStr = (input.taskDueDate ?? input.dueDate) ? ` (due: ${input.taskDueDate ?? input.dueDate})` : '';
    return {
      success: true,
      action: 'create_task',
      summary: `Task "${taskTitle}" created (ID: ${result.task.id}) for contact ${contactId}${dueDateStr}.`,
      task: result.task,
    };
  } catch (err) {
    return handleGhlError(err, 'create_task', { contactId, taskTitle });
  }
}

async function handleListTasks(input: GhlSubAgentInput): Promise<GhlSubAgentOutput> {
  // Resolve contact
  let contactId = input.contactId?.trim();
  if (!contactId) {
    const query = input.query?.trim();
    if (!query) {
      return {
        success: false,
        action: 'list_tasks',
        summary: 'No contact ID or search query provided.',
        error: 'Missing contactId and query',
      };
    }

    try {
      const searchResult = await searchContacts(query);
      if (searchResult.total === 0) {
        return { success: false, action: 'list_tasks', summary: `No contacts found matching "${query}".`, error: 'Contact not found' };
      }
      if (searchResult.total > 1) {
        const names = searchResult.contacts
          .slice(0, 5)
          .map((c, i) => `${i + 1}. ${formatContactName(c)} (${c.email ?? c.phone ?? c.id})`)
          .join('\n');
        return {
          success: false, action: 'list_tasks',
          summary: `Found ${searchResult.total} contacts matching "${query}":\n${names}`,
          candidates: searchResult.contacts.slice(0, 5),
          needsClarification: true,
          clarificationQuestion: `Multiple contacts match "${query}". Which one's tasks do you want to see?`,
          error: 'Ambiguous contact match',
        };
      }
      contactId = searchResult.contacts[0]?.id?.trim();
    } catch (err) {
      return handleGhlError(err, 'list_tasks', { query });
    }
  }

  if (!contactId) {
    return { success: false, action: 'list_tasks', summary: 'Could not resolve a valid contact ID.', error: 'Invalid contact ID' };
  }

  try {
    const result = await listTasks(contactId);

    ghlActionLogRepository.create({
      actionType: 'custom',
      contactId,
      requestPayload: { action: 'list_tasks', contactId } as any,
      responsePayload: { count: result.tasks.length } as any,
      success: true,
      latencyMs: result.latencyMs,
    }).catch((logErr) => {
      logger.warn({ err: logErr }, 'Failed to log GHL list_tasks action');
    });

    if (result.tasks.length === 0) {
      return { success: true, action: 'list_tasks', summary: `No tasks found for contact ${contactId}.`, tasks: [] };
    }

    const taskList = result.tasks
      .slice(0, 10)
      .map((t) => {
        const status = t.completed ? '✓' : (t.status ?? 'pending');
        const due = t.dueDate ? ` (due: ${t.dueDate})` : '';
        return `- [${status}] ${t.title ?? 'Untitled'} (ID: ${t.id})${due}`;
      })
      .join('\n');
    const moreText = result.tasks.length > 10 ? `\n...and ${result.tasks.length - 10} more` : '';

    return {
      success: true,
      action: 'list_tasks',
      summary: `Found ${result.tasks.length} task(s) for contact ${contactId}:\n${taskList}${moreText}`,
      tasks: result.tasks,
    };
  } catch (err) {
    return handleGhlError(err, 'list_tasks', { contactId });
  }
}

async function handleGetTask(input: GhlSubAgentInput): Promise<GhlSubAgentOutput> {
  const contactId = input.contactId?.trim();
  const taskId = input.taskId?.trim();

  if (!contactId) {
    return { success: false, action: 'get_task', summary: 'No contact ID provided.', error: 'Missing contactId' };
  }
  if (!taskId) {
    return { success: false, action: 'get_task', summary: 'No task ID provided. Use list_tasks to find tasks.', error: 'Missing taskId' };
  }

  try {
    const result = await getTask(contactId, taskId);

    ghlActionLogRepository.create({
      actionType: 'custom',
      contactId,
      requestPayload: { action: 'get_task', contactId, taskId } as any,
      responsePayload: { taskId: result.task.id } as any,
      success: true,
      latencyMs: result.latencyMs,
    }).catch((logErr) => {
      logger.warn({ err: logErr }, 'Failed to log GHL get_task action');
    });

    const t = result.task;
    const status = t.completed ? '✓ completed' : (t.status ?? 'pending');
    const due = t.dueDate ? ` | Due: ${t.dueDate}` : '';

    return {
      success: true,
      action: 'get_task',
      summary: `Task ${taskId}: "${t.title ?? 'Untitled'}" [${status}]${due}`,
      task: t,
    };
  } catch (err) {
    return handleGhlError(err, 'get_task', { contactId, taskId });
  }
}

async function handleUpdateTask(input: GhlSubAgentInput): Promise<GhlSubAgentOutput> {
  const contactId = input.contactId?.trim();
  const taskId = input.taskId?.trim();

  if (!contactId) {
    return { success: false, action: 'update_task', summary: 'No contact ID provided.', error: 'Missing contactId' };
  }
  if (!taskId) {
    return { success: false, action: 'update_task', summary: 'No task ID provided. Use list_tasks to find tasks.', error: 'Missing taskId' };
  }

  const updates: Record<string, unknown> = {};
  if (input.taskTitle ?? input.title) updates['title'] = input.taskTitle ?? input.title;
  if (input.taskBody ?? input.noteBody) updates['body'] = input.taskBody ?? input.noteBody;
  if (input.taskDueDate ?? input.dueDate) updates['dueDate'] = input.taskDueDate ?? input.dueDate;
  if (input.taskStatus) updates['status'] = input.taskStatus;
  if (input.taskCompleted != null) updates['completed'] = input.taskCompleted;
  if (input.assignedTo) updates['assignedTo'] = input.assignedTo;
  if (input.updates) Object.assign(updates, input.updates);

  if (Object.keys(updates).length === 0) {
    return {
      success: false,
      action: 'update_task',
      summary: 'No fields to update were specified. Supported: title, body, dueDate, status, completed, assignedTo.',
      error: 'Empty updates',
    };
  }

  try {
    const result = await updateTask(contactId, taskId, updates);

    ghlActionLogRepository.create({
      actionType: 'custom',
      contactId,
      requestPayload: { action: 'update_task', contactId, taskId, updates } as any,
      responsePayload: { taskId: result.task.id } as any,
      statusCode: result.statusCode,
      success: true,
      latencyMs: result.latencyMs,
    }).catch((logErr) => {
      logger.warn({ err: logErr }, 'Failed to log GHL update_task action');
    });

    const changeLines = Object.entries(updates)
      .map(([field, value]) => `- ${field}: "${value}"`)
      .join('\n');

    return {
      success: true,
      action: 'update_task',
      summary: `Task ${taskId} updated:\n${changeLines}`,
      task: result.task,
    };
  } catch (err) {
    return handleGhlError(err, 'update_task', { contactId, taskId, updates });
  }
}

async function handleDeleteTask(input: GhlSubAgentInput): Promise<GhlSubAgentOutput> {
  const contactId = input.contactId?.trim();
  const taskId = input.taskId?.trim();

  if (!contactId) {
    return { success: false, action: 'delete_task', summary: 'No contact ID provided.', error: 'Missing contactId' };
  }
  if (!taskId) {
    return { success: false, action: 'delete_task', summary: 'No task ID provided.', error: 'Missing taskId' };
  }

  try {
    const result = await deleteTask(contactId, taskId);

    ghlActionLogRepository.create({
      actionType: 'custom',
      contactId,
      requestPayload: { action: 'delete_task', contactId, taskId } as any,
      responsePayload: { deleted: true } as any,
      statusCode: result.statusCode,
      success: true,
      latencyMs: result.latencyMs,
    }).catch((logErr) => {
      logger.warn({ err: logErr }, 'Failed to log GHL delete_task action');
    });

    return {
      success: true,
      action: 'delete_task',
      summary: `Task ${taskId} has been deleted from contact ${contactId}.`,
    };
  } catch (err) {
    return handleGhlError(err, 'delete_task', { contactId, taskId });
  }
}

// ── Helpers ────────────────────────────────────────────────

function formatContactName(contact: GhlContact): string {
  // GHL search returns lowercase firstName/lastName but proper case in
  // firstNameRaw/lastNameRaw. Prefer the raw variants when available.
  const first = contact.firstNameRaw ?? contact.firstName;
  const last = contact.lastNameRaw ?? contact.lastName;
  if (first && last) return `${first} ${last}`;
  if (contact.name) return contact.name;
  if (first) return first;
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

  const VALID_ACTION_TYPES: Set<string> = new Set([
    'search_contact', 'get_contact', 'create_contact', 'update_contact',
    'create_opportunity', 'add_note', 'send_sms', 'custom',
  ]);
  const actionType = (VALID_ACTION_TYPES.has(action) ? action : 'custom') as GhlActionType;

  await ghlActionLogRepository.create({
    actionType,
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
