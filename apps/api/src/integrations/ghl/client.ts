import { env, logger } from '@nexclaw/config';
import type {
  GhlContact,
  GhlContactSearchResult,
  GhlApiContactResponse,
  GhlApiSearchResponse,
  GhlOpportunity,
  GhlApiOpportunityResponse,
  GhlApiPipelinesResponse,
  GhlApiOpportunitiesSearchResponse,
  GhlPipeline,
  GhlNote,
  GhlApiNoteResponse,
  GhlApiNotesListResponse,
  GhlApiSendMessageResponse,
  GhlConversation,
  GhlConversationMessage,
  GhlApiConversationsResponse,
  GhlApiConversationResponse,
  GhlApiConversationMessagesResponse,
  GhlCalendar,
  GhlCalendarSlot,
  GhlAppointment,
  GhlApiCalendarsResponse,
  GhlApiFreeSlotsResponse,
  GhlApiAppointmentResponse,
  GhlTask,
  GhlApiTaskResponse,
  GhlApiTasksListResponse,
  GhlUser,
  GhlApiUsersResponse,
  GhlLocation,
  GhlApiLocationResponse,
  GhlReview,
  GhlApiReviewsResponse,
  GhlInvoice,
  GhlInvoiceItem,
  GhlApiInvoiceResponse,
  GhlApiInvoicesListResponse,
  GhlOrder,
  GhlApiOrderResponse,
  GhlApiOrdersListResponse,
  GhlApiContactAppointmentsResponse,
  GhlCampaign,
  GhlApiCampaignsResponse,
  GhlWorkflow,
  GhlApiWorkflowsResponse,
  GhlForm,
  GhlFormSubmission,
  GhlApiFormsResponse,
  GhlApiFormSubmissionsResponse,
  GhlSurvey,
  GhlSurveySubmission,
  GhlApiSurveysResponse,
  GhlApiSurveySubmissionsResponse,
} from '@nexclaw/shared';

const TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;

/**
 * Low-level GoHighLevel CRM API client.
 * Handles HTTP calls, retries on transient errors, and timeout management.
 *
 * GHL v2 API (services.leadconnectorhq.com):
 * - GET  /contacts/?locationId=...&query=...
 * - GET  /contacts/{id}
 * - PUT  /contacts/{id}
 * - POST /contacts/
 * - GET  /contacts/lookup?locationId=...&email=...&phone=...
 */

async function callApi<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: Record<string, unknown>,
): Promise<{ data: T; statusCode: number; latencyMs: number }> {
  const token = env.GHL_API_TOKEN?.trim();
  if (!token || token.toLowerCase().startsWith('change-me')) {
    throw new GhlApiError('GHL API token is not configured', 503, 0);
  }

  let lastError: Error | null = null;
  const startTime = Date.now();

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const url = `${env.GHL_API_BASE_URL}${path}`;
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Version': env.GHL_API_VERSION ?? '2021-07-28',
      };

      const res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeout);
      const latencyMs = Date.now() - startTime;

      if (res.ok) {
        const data = (await res.json()) as T;
        return { data, statusCode: res.status, latencyMs };
      }

      const errorBody = await res.text();

      // Don't retry client errors (4xx) except 429
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        throw new GhlApiError(
          `GHL API ${method} ${path}: ${res.status} ${errorBody}`,
          res.status,
          latencyMs,
        );
      }

      // Retryable: 429 or 5xx
      lastError = new GhlApiError(
        `GHL API ${method} ${path}: ${res.status} ${errorBody}`,
        res.status,
        latencyMs,
      );

      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get('retry-after') ?? '3', 10);
        await delay(retryAfter * 1000);
      } else {
        await delay(1000 * (attempt + 1));
      }
    } catch (err) {
      if (err instanceof GhlApiError) throw err;

      if (err instanceof Error && err.name === 'AbortError') {
        lastError = new GhlApiError(
          `GHL API ${method} ${path} timed out after ${TIMEOUT_MS}ms`,
          0,
          Date.now() - startTime,
        );
      } else {
        lastError = err instanceof Error ? err : new Error(String(err));
      }

      if (attempt < MAX_RETRIES) {
        await delay(1000 * (attempt + 1));
      }
    }
  }

  throw lastError ?? new Error(`GHL API ${method} ${path} failed after retries`);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class GhlApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly latencyMs: number,
  ) {
    super(message);
    this.name = 'GhlApiError';
  }
}

// ── Public API ──────────────────────────────────────────────

/**
 * Search contacts by name, email, or phone.
 * Uses the GHL v2 contacts query parameter with locationId.
 */
export async function searchContacts(query: string): Promise<GhlContactSearchResult & { latencyMs: number }> {
  const locationId = env.GHL_LOCATION_ID?.trim();
  if (!locationId) {
    throw new GhlApiError('GHL_LOCATION_ID is not configured', 503, 0);
  }

  const encodedQuery = encodeURIComponent(query);
  const { data, latencyMs } = await callApi<GhlApiSearchResponse>(
    'GET',
    `/contacts/?locationId=${locationId}&query=${encodedQuery}&limit=10`,
  );

  return {
    contacts: data.contacts ?? [],
    total: data.meta?.total ?? data.total ?? 0,
    latencyMs,
  };
}

/**
 * Get a single contact by ID.
 */
export async function getContact(contactId: string): Promise<GhlContact & { _latencyMs: number }> {
  const { data, latencyMs } = await callApi<GhlApiContactResponse>(
    'GET',
    `/contacts/${contactId}`,
  );

  return { ...data.contact, _latencyMs: latencyMs };
}

/**
 * Update a contact's fields.
 * Only sends the fields being changed.
 */
export async function updateContact(
  contactId: string,
  updates: Record<string, unknown>,
): Promise<{ contact: GhlContact; latencyMs: number; statusCode: number }> {
  const { data, latencyMs, statusCode } = await callApi<GhlApiContactResponse>(
    'PUT',
    `/contacts/${contactId}`,
    updates,
  );

  return { contact: data.contact, latencyMs, statusCode };
}

/**
 * Lookup a contact by email or phone (exact match).
 * GHL v2 lookup endpoint requires locationId.
 */
export async function lookupContact(params: {
  email?: string;
  phone?: string;
}): Promise<GhlContactSearchResult & { latencyMs: number }> {
  const locationId = env.GHL_LOCATION_ID?.trim();
  if (!locationId) {
    throw new GhlApiError('GHL_LOCATION_ID is not configured', 503, 0);
  }

  const queryParts: string[] = [`locationId=${locationId}`];
  if (params.email) queryParts.push(`email=${encodeURIComponent(params.email)}`);
  if (params.phone) queryParts.push(`phone=${encodeURIComponent(params.phone)}`);

  if (queryParts.length <= 1) {
    return { contacts: [], total: 0, latencyMs: 0 };
  }

  try {
    const { data, latencyMs } = await callApi<GhlApiSearchResponse>(
      'GET',
      `/contacts/lookup?${queryParts.join('&')}`,
    );

    return {
      contacts: data.contacts ?? [],
      total: data.meta?.total ?? data.total ?? 0,
      latencyMs,
    };
  } catch (err) {
    // Lookup endpoint may not exist in GHL v2 — fall back to search.
    // v2 returns 400 ("Contact with id lookup not found") treating "lookup"
    // as a contact ID, so we catch both 400 and 404.
    if (err instanceof GhlApiError && (err.statusCode === 404 || err.statusCode === 400)) {
      logger.debug('GHL lookup endpoint not available, falling back to search');
      const query = params.email ?? params.phone ?? '';
      return searchContacts(query);
    }
    throw err;
  }
}

/**
 * Create a new contact.
 */
export async function createContact(
  fields: Record<string, unknown>,
): Promise<{ contact: GhlContact; latencyMs: number; statusCode: number }> {
  const locationId = env.GHL_LOCATION_ID?.trim();
  if (!locationId) {
    throw new GhlApiError('GHL_LOCATION_ID is not configured', 503, 0);
  }

  const { data, latencyMs, statusCode } = await callApi<GhlApiContactResponse>(
    'POST',
    '/contacts/',
    { ...fields, locationId },
  );

  return { contact: data.contact, latencyMs, statusCode };
}

// ── Opportunities / Pipelines ──────────────────────────────

/**
 * List pipelines for the location.
 */
export async function getPipelines(): Promise<{ pipelines: GhlPipeline[]; latencyMs: number }> {
  const locationId = env.GHL_LOCATION_ID?.trim();
  if (!locationId) {
    throw new GhlApiError('GHL_LOCATION_ID is not configured', 503, 0);
  }

  const { data, latencyMs } = await callApi<GhlApiPipelinesResponse>(
    'GET',
    `/opportunities/pipelines?locationId=${locationId}`,
  );

  return { pipelines: data.pipelines ?? [], latencyMs };
}

/**
 * Create a new opportunity (deal) in a pipeline.
 */
export async function createOpportunity(params: {
  pipelineId: string;
  pipelineStageId: string;
  contactId: string;
  name: string;
  monetaryValue?: number;
  status?: string;
}): Promise<{ opportunity: GhlOpportunity; latencyMs: number; statusCode: number }> {
  const locationId = env.GHL_LOCATION_ID?.trim();
  if (!locationId) {
    throw new GhlApiError('GHL_LOCATION_ID is not configured', 503, 0);
  }

  const { data, latencyMs, statusCode } = await callApi<GhlApiOpportunityResponse>(
    'POST',
    '/opportunities/',
    {
      locationId,
      pipelineId: params.pipelineId,
      pipelineStageId: params.pipelineStageId,
      contactId: params.contactId,
      name: params.name,
      monetaryValue: params.monetaryValue,
      status: params.status ?? 'open',
    },
  );

  return { opportunity: data.opportunity, latencyMs, statusCode };
}

/**
 * Get a single opportunity by ID.
 */
export async function getOpportunity(
  opportunityId: string,
): Promise<{ opportunity: GhlOpportunity; latencyMs: number }> {
  const { data, latencyMs } = await callApi<GhlApiOpportunityResponse>(
    'GET',
    `/opportunities/${opportunityId}`,
  );

  return { opportunity: data.opportunity, latencyMs };
}

/**
 * Update an opportunity's fields.
 */
export async function updateOpportunity(
  opportunityId: string,
  updates: Record<string, unknown>,
): Promise<{ opportunity: GhlOpportunity; latencyMs: number; statusCode: number }> {
  const { data, latencyMs, statusCode } = await callApi<GhlApiOpportunityResponse>(
    'PUT',
    `/opportunities/${opportunityId}`,
    updates,
  );

  return { opportunity: data.opportunity, latencyMs, statusCode };
}

// ── Notes ──────────────────────────────────────────────────

/**
 * Add a note to a contact.
 */
export async function addNote(
  contactId: string,
  body: string,
): Promise<{ note: GhlNote; latencyMs: number; statusCode: number }> {
  const { data, latencyMs, statusCode } = await callApi<GhlApiNoteResponse>(
    'POST',
    `/contacts/${contactId}/notes`,
    { body },
  );

  return { note: data.note, latencyMs, statusCode };
}

/**
 * List notes for a contact.
 */
export async function listNotes(
  contactId: string,
): Promise<{ notes: GhlNote[]; latencyMs: number }> {
  const { data, latencyMs } = await callApi<GhlApiNotesListResponse>(
    'GET',
    `/contacts/${contactId}/notes`,
  );

  return { notes: data.notes ?? [], latencyMs };
}

// ── SMS / Conversations ────────────────────────────────────

/**
 * Send an SMS message to a contact.
 */
export async function sendSms(
  contactId: string,
  message: string,
): Promise<{ conversationId?: string; messageId?: string; latencyMs: number; statusCode: number }> {
  const { data, latencyMs, statusCode } = await callApi<GhlApiSendMessageResponse>(
    'POST',
    '/conversations/messages',
    {
      type: 'SMS',
      contactId,
      message,
    },
  );

  return {
    conversationId: data.conversationId,
    messageId: data.messageId,
    latencyMs,
    statusCode,
  };
}

// ── Calendars / Appointments ───────────────────────────────

/**
 * List all calendars for the location.
 */
export async function listCalendars(): Promise<{ calendars: GhlCalendar[]; latencyMs: number }> {
  const locationId = env.GHL_LOCATION_ID?.trim();
  if (!locationId) {
    throw new GhlApiError('GHL_LOCATION_ID is not configured', 503, 0);
  }

  const { data, latencyMs } = await callApi<GhlApiCalendarsResponse>(
    'GET',
    `/calendars/?locationId=${locationId}`,
  );

  return { calendars: data.calendars ?? [], latencyMs };
}

/**
 * Get available free slots for a calendar within a date range.
 */
export async function getFreeSlots(
  calendarId: string,
  startDate: string,
  endDate: string,
): Promise<{ slots: GhlCalendarSlot[]; latencyMs: number }> {
  const { data, latencyMs } = await callApi<GhlApiFreeSlotsResponse>(
    'GET',
    `/calendars/${calendarId}/free-slots?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`,
  );

  // The API returns { "YYYY-MM-DD": [{ start, end }] } — flatten into a single array
  const slots: GhlCalendarSlot[] = [];
  for (const dateSlots of Object.values(data)) {
    if (Array.isArray(dateSlots)) {
      slots.push(...dateSlots);
    }
  }

  return { slots, latencyMs };
}

/**
 * Create an appointment on a calendar.
 */
export async function createAppointment(params: {
  calendarId: string;
  contactId: string;
  startTime: string;
  endTime: string;
  title?: string;
  notes?: string;
  assignedUserId?: string;
}): Promise<{ appointment: GhlAppointment; latencyMs: number; statusCode: number }> {
  const locationId = env.GHL_LOCATION_ID?.trim();
  if (!locationId) {
    throw new GhlApiError('GHL_LOCATION_ID is not configured', 503, 0);
  }

  const { data, latencyMs, statusCode } = await callApi<GhlApiAppointmentResponse>(
    'POST',
    '/calendars/events/appointments',
    {
      calendarId: params.calendarId,
      locationId,
      contactId: params.contactId,
      startTime: params.startTime,
      endTime: params.endTime,
      title: params.title,
      notes: params.notes,
      assignedUserId: params.assignedUserId,
    },
  );

  const appointment = data.event ?? data.appointment;
  if (!appointment) {
    throw new GhlApiError('GHL API returned no appointment data', 0, latencyMs);
  }

  return { appointment, latencyMs, statusCode };
}

/**
 * Get an appointment by ID.
 */
export async function getAppointment(
  eventId: string,
): Promise<{ appointment: GhlAppointment; latencyMs: number }> {
  const { data, latencyMs } = await callApi<GhlApiAppointmentResponse>(
    'GET',
    `/calendars/events/appointments/${eventId}`,
  );

  const appointment = data.event ?? data.appointment;
  if (!appointment) {
    throw new GhlApiError('GHL API returned no appointment data', 0, latencyMs);
  }

  return { appointment, latencyMs };
}

/**
 * Update an appointment.
 */
export async function updateAppointment(
  eventId: string,
  updates: Record<string, unknown>,
): Promise<{ appointment: GhlAppointment; latencyMs: number; statusCode: number }> {
  const { data, latencyMs, statusCode } = await callApi<GhlApiAppointmentResponse>(
    'PUT',
    `/calendars/events/appointments/${eventId}`,
    updates,
  );

  const appointment = data.event ?? data.appointment;
  if (!appointment) {
    throw new GhlApiError('GHL API returned no appointment data', 0, latencyMs);
  }

  return { appointment, latencyMs, statusCode };
}

// ── Users ─────────────────────────────────────────────────

/**
 * List users for the location.
 */
export async function listUsers(): Promise<{ users: GhlUser[]; latencyMs: number }> {
  const locationId = env.GHL_LOCATION_ID?.trim();
  if (!locationId) {
    throw new GhlApiError('GHL_LOCATION_ID is not configured', 503, 0);
  }

  const { data, latencyMs } = await callApi<GhlApiUsersResponse>(
    'GET',
    `/users/?locationId=${locationId}`,
  );

  return { users: data.users ?? [], latencyMs };
}

// ── Locations ─────────────────────────────────────────────

/**
 * Get business location info.
 */
export async function getLocation(): Promise<{ location: GhlLocation; latencyMs: number }> {
  const locationId = env.GHL_LOCATION_ID?.trim();
  if (!locationId) {
    throw new GhlApiError('GHL_LOCATION_ID is not configured', 503, 0);
  }

  const { data, latencyMs } = await callApi<GhlApiLocationResponse>(
    'GET',
    `/locations/${locationId}`,
  );

  return { location: data.location, latencyMs };
}

/**
 * Update business location fields.
 */
export async function updateLocation(
  updates: Record<string, unknown>,
): Promise<{ location: GhlLocation; latencyMs: number; statusCode: number }> {
  const locationId = env.GHL_LOCATION_ID?.trim();
  if (!locationId) {
    throw new GhlApiError('GHL_LOCATION_ID is not configured', 503, 0);
  }

  const { data, latencyMs, statusCode } = await callApi<GhlApiLocationResponse>(
    'PUT',
    `/locations/${locationId}`,
    updates,
  );

  return { location: data.location, latencyMs, statusCode };
}

// ── Reviews ───────────────────────────────────────────────

/**
 * List reviews for the location.
 */
export async function listReviews(params?: {
  limit?: number;
  offset?: number;
}): Promise<{ reviews: GhlReview[]; latencyMs: number }> {
  const locationId = env.GHL_LOCATION_ID?.trim();
  if (!locationId) {
    throw new GhlApiError('GHL_LOCATION_ID is not configured', 503, 0);
  }

  const queryParts = [`locationId=${locationId}`];
  if (params?.limit) queryParts.push(`limit=${params.limit}`);
  if (params?.offset) queryParts.push(`offset=${params.offset}`);

  const { data, latencyMs } = await callApi<GhlApiReviewsResponse>(
    'GET',
    `/locations/${locationId}/reviews/?${queryParts.join('&')}`,
  );

  return { reviews: data.reviews ?? [], latencyMs };
}

// ── Invoices ──────────────────────────────────────────────

/**
 * Create a new invoice.
 */
export async function createInvoice(params: {
  contactId: string;
  name?: string;
  title?: string;
  dueDate?: string;
  currency?: string;
  items?: GhlInvoiceItem[];
}): Promise<{ invoice: GhlInvoice; latencyMs: number; statusCode: number }> {
  const locationId = env.GHL_LOCATION_ID?.trim();
  if (!locationId) {
    throw new GhlApiError('GHL_LOCATION_ID is not configured', 503, 0);
  }

  const { data, latencyMs, statusCode } = await callApi<GhlApiInvoiceResponse>(
    'POST',
    '/invoices/',
    {
      locationId,
      contactId: params.contactId,
      name: params.name,
      title: params.title,
      dueDate: params.dueDate,
      currency: params.currency ?? 'USD',
      items: params.items,
    },
  );

  return { invoice: data.invoice, latencyMs, statusCode };
}

/**
 * Get an invoice by ID.
 */
export async function getInvoice(
  invoiceId: string,
): Promise<{ invoice: GhlInvoice; latencyMs: number }> {
  const { data, latencyMs } = await callApi<GhlApiInvoiceResponse>(
    'GET',
    `/invoices/${invoiceId}`,
  );

  return { invoice: data.invoice, latencyMs };
}

/**
 * List invoices for the location.
 */
export async function listInvoices(params?: {
  contactId?: string;
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<{ invoices: GhlInvoice[]; latencyMs: number }> {
  const locationId = env.GHL_LOCATION_ID?.trim();
  if (!locationId) {
    throw new GhlApiError('GHL_LOCATION_ID is not configured', 503, 0);
  }

  const queryParts = [`locationId=${locationId}`];
  if (params?.contactId) queryParts.push(`contactId=${encodeURIComponent(params.contactId)}`);
  if (params?.status) queryParts.push(`status=${encodeURIComponent(params.status)}`);
  if (params?.limit) queryParts.push(`limit=${params.limit}`);
  if (params?.offset) queryParts.push(`offset=${params.offset}`);

  const { data, latencyMs } = await callApi<GhlApiInvoicesListResponse>(
    'GET',
    `/invoices/?${queryParts.join('&')}`,
  );

  return { invoices: data.invoices ?? [], latencyMs };
}

/**
 * Update an invoice.
 */
export async function updateInvoice(
  invoiceId: string,
  updates: Record<string, unknown>,
): Promise<{ invoice: GhlInvoice; latencyMs: number; statusCode: number }> {
  const { data, latencyMs, statusCode } = await callApi<GhlApiInvoiceResponse>(
    'PUT',
    `/invoices/${invoiceId}`,
    updates,
  );

  return { invoice: data.invoice, latencyMs, statusCode };
}

/**
 * Send an invoice to the contact.
 */
export async function sendInvoice(
  invoiceId: string,
): Promise<{ invoice: GhlInvoice; latencyMs: number; statusCode: number }> {
  const { data, latencyMs, statusCode } = await callApi<GhlApiInvoiceResponse>(
    'POST',
    `/invoices/${invoiceId}/send`,
  );

  return { invoice: data.invoice, latencyMs, statusCode };
}

// ── Orders / Payments ─────────────────────────────────────

/**
 * List orders for the location.
 */
export async function listOrders(params?: {
  contactId?: string;
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<{ orders: GhlOrder[]; latencyMs: number }> {
  const locationId = env.GHL_LOCATION_ID?.trim();
  if (!locationId) {
    throw new GhlApiError('GHL_LOCATION_ID is not configured', 503, 0);
  }

  const queryParts = [`locationId=${locationId}`];
  if (params?.contactId) queryParts.push(`contactId=${encodeURIComponent(params.contactId)}`);
  if (params?.status) queryParts.push(`status=${encodeURIComponent(params.status)}`);
  if (params?.limit) queryParts.push(`limit=${params.limit}`);
  if (params?.offset) queryParts.push(`offset=${params.offset}`);

  const { data, latencyMs } = await callApi<GhlApiOrdersListResponse>(
    'GET',
    `/payments/orders/?${queryParts.join('&')}`,
  );

  return { orders: data.orders ?? data.data ?? [], latencyMs };
}

/**
 * Get a single order by ID.
 */
export async function getOrder(
  orderId: string,
): Promise<{ order: GhlOrder; latencyMs: number }> {
  const { data, latencyMs } = await callApi<GhlApiOrderResponse>(
    'GET',
    `/payments/orders/${orderId}`,
  );

  const order = data.order ?? data.data;
  if (!order) {
    throw new GhlApiError('GHL API returned no order data', 0, latencyMs);
  }

  return { order, latencyMs };
}

// ── Calendar Event Management ─────────────────────────────

/**
 * Delete a calendar event/appointment.
 */
export async function deleteCalendarEvent(
  eventId: string,
): Promise<{ latencyMs: number; statusCode: number }> {
  const { latencyMs, statusCode } = await callApi<Record<string, unknown>>(
    'DELETE',
    `/calendars/events/appointments/${eventId}`,
  );

  return { latencyMs, statusCode };
}

// ── Contact Appointments ──────────────────────────────────

/**
 * List appointments for a specific contact.
 */
export async function listContactAppointments(
  contactId: string,
): Promise<{ appointments: GhlAppointment[]; latencyMs: number }> {
  const { data, latencyMs } = await callApi<GhlApiContactAppointmentsResponse>(
    'GET',
    `/contacts/${contactId}/appointments`,
  );

  return { appointments: data.events ?? data.appointments ?? [], latencyMs };
}

// ── Campaigns ─────────────────────────────────────────────

/**
 * List campaigns for the location.
 */
export async function listCampaigns(): Promise<{ campaigns: GhlCampaign[]; latencyMs: number }> {
  const locationId = env.GHL_LOCATION_ID?.trim();
  if (!locationId) {
    throw new GhlApiError('GHL_LOCATION_ID is not configured', 503, 0);
  }

  const { data, latencyMs } = await callApi<GhlApiCampaignsResponse>(
    'GET',
    `/campaigns/?locationId=${locationId}`,
  );

  return { campaigns: data.campaigns ?? [], latencyMs };
}

// ── Workflows ─────────────────────────────────────────────

/**
 * List workflows for the location.
 */
export async function listWorkflows(): Promise<{ workflows: GhlWorkflow[]; latencyMs: number }> {
  const locationId = env.GHL_LOCATION_ID?.trim();
  if (!locationId) {
    throw new GhlApiError('GHL_LOCATION_ID is not configured', 503, 0);
  }

  const { data, latencyMs } = await callApi<GhlApiWorkflowsResponse>(
    'GET',
    `/workflows/?locationId=${locationId}`,
  );

  return { workflows: data.workflows ?? [], latencyMs };
}

/**
 * Add a contact to a workflow (trigger).
 */
export async function triggerWorkflow(
  contactId: string,
  workflowId: string,
): Promise<{ latencyMs: number; statusCode: number }> {
  const { latencyMs, statusCode } = await callApi<Record<string, unknown>>(
    'POST',
    `/contacts/${contactId}/workflow/${workflowId}`,
  );

  return { latencyMs, statusCode };
}

// ── Forms ─────────────────────────────────────────────────

/**
 * List forms for the location.
 */
export async function listForms(): Promise<{ forms: GhlForm[]; latencyMs: number }> {
  const locationId = env.GHL_LOCATION_ID?.trim();
  if (!locationId) {
    throw new GhlApiError('GHL_LOCATION_ID is not configured', 503, 0);
  }

  const { data, latencyMs } = await callApi<GhlApiFormsResponse>(
    'GET',
    `/forms/?locationId=${locationId}`,
  );

  return { forms: data.forms ?? [], latencyMs };
}

/**
 * Get form submissions, optionally filtered by formId.
 */
export async function getFormSubmissions(params?: {
  formId?: string;
  limit?: number;
  page?: number;
}): Promise<{ submissions: GhlFormSubmission[]; latencyMs: number }> {
  const locationId = env.GHL_LOCATION_ID?.trim();
  if (!locationId) {
    throw new GhlApiError('GHL_LOCATION_ID is not configured', 503, 0);
  }

  const queryParts = [`locationId=${locationId}`];
  if (params?.formId) queryParts.push(`formId=${encodeURIComponent(params.formId)}`);
  if (params?.limit) queryParts.push(`limit=${params.limit}`);
  if (params?.page) queryParts.push(`page=${params.page}`);

  const { data, latencyMs } = await callApi<GhlApiFormSubmissionsResponse>(
    'GET',
    `/forms/submissions?${queryParts.join('&')}`,
  );

  return { submissions: data.submissions ?? [], latencyMs };
}

// ── Surveys ───────────────────────────────────────────────

/**
 * List surveys for the location.
 */
export async function listSurveys(): Promise<{ surveys: GhlSurvey[]; latencyMs: number }> {
  const locationId = env.GHL_LOCATION_ID?.trim();
  if (!locationId) {
    throw new GhlApiError('GHL_LOCATION_ID is not configured', 503, 0);
  }

  const { data, latencyMs } = await callApi<GhlApiSurveysResponse>(
    'GET',
    `/surveys/?locationId=${locationId}`,
  );

  return { surveys: data.surveys ?? [], latencyMs };
}

/**
 * Get survey submissions, optionally filtered by surveyId.
 */
export async function getSurveySubmissions(params?: {
  surveyId?: string;
  limit?: number;
  page?: number;
}): Promise<{ submissions: GhlSurveySubmission[]; latencyMs: number }> {
  const locationId = env.GHL_LOCATION_ID?.trim();
  if (!locationId) {
    throw new GhlApiError('GHL_LOCATION_ID is not configured', 503, 0);
  }

  const queryParts = [`locationId=${locationId}`];
  if (params?.surveyId) queryParts.push(`surveyId=${encodeURIComponent(params.surveyId)}`);
  if (params?.limit) queryParts.push(`limit=${params.limit}`);
  if (params?.page) queryParts.push(`page=${params.page}`);

  const { data, latencyMs } = await callApi<GhlApiSurveySubmissionsResponse>(
    'GET',
    `/surveys/submissions?${queryParts.join('&')}`,
  );

  return { submissions: data.submissions ?? [], latencyMs };
}

// ── Email ─────────────────────────────────────────────────

/**
 * Send an email to a contact via the conversations API.
 */
export async function sendEmail(
  contactId: string,
  subject: string,
  body: string,
  html?: string,
): Promise<{ conversationId?: string; messageId?: string; latencyMs: number; statusCode: number }> {
  const payload: Record<string, unknown> = {
    type: 'Email',
    contactId,
    subject,
  };
  if (html) {
    payload['html'] = html;
  } else {
    payload['html'] = `<p>${body.replace(/\n/g, '<br>')}</p>`;
    payload['message'] = body;
  }

  const { data, latencyMs, statusCode } = await callApi<GhlApiSendMessageResponse>(
    'POST',
    '/conversations/messages',
    payload,
  );

  return {
    conversationId: data.conversationId,
    messageId: data.messageId,
    latencyMs,
    statusCode,
  };
}

// ── Conversations (Unified Inbox) ─────────────────────────

/**
 * List conversations for the location.
 */
export async function listConversations(params?: {
  query?: string;
  status?: string;
  assignedTo?: string;
  limit?: number;
  sort?: string;
  sortDirection?: string;
}): Promise<{ conversations: GhlConversation[]; latencyMs: number }> {
  const locationId = env.GHL_LOCATION_ID?.trim();
  if (!locationId) {
    throw new GhlApiError('GHL_LOCATION_ID is not configured', 503, 0);
  }

  const queryParts = [`locationId=${locationId}`];
  if (params?.query) queryParts.push(`query=${encodeURIComponent(params.query)}`);
  if (params?.status) queryParts.push(`status=${encodeURIComponent(params.status)}`);
  if (params?.assignedTo) queryParts.push(`assignedTo=${encodeURIComponent(params.assignedTo)}`);
  if (params?.limit) queryParts.push(`limit=${params.limit}`);
  if (params?.sort) queryParts.push(`sort=${encodeURIComponent(params.sort)}`);
  if (params?.sortDirection) queryParts.push(`sortDirection=${encodeURIComponent(params.sortDirection)}`);

  const { data, latencyMs } = await callApi<GhlApiConversationsResponse>(
    'GET',
    `/conversations/?${queryParts.join('&')}`,
  );

  return { conversations: data.conversations ?? [], latencyMs };
}

/**
 * Get a single conversation by ID.
 */
export async function getConversation(
  conversationId: string,
): Promise<{ conversation: GhlConversation; latencyMs: number }> {
  const { data, latencyMs } = await callApi<GhlApiConversationResponse>(
    'GET',
    `/conversations/${conversationId}`,
  );

  return { conversation: data.conversation, latencyMs };
}

/**
 * Update a conversation (mark read, assign, change status).
 */
export async function updateConversation(
  conversationId: string,
  updates: Record<string, unknown>,
): Promise<{ conversation: GhlConversation; latencyMs: number; statusCode: number }> {
  const { data, latencyMs, statusCode } = await callApi<GhlApiConversationResponse>(
    'PUT',
    `/conversations/${conversationId}`,
    updates,
  );

  return { conversation: data.conversation, latencyMs, statusCode };
}

/**
 * Get messages for a conversation.
 */
export async function listConversationMessages(
  conversationId: string,
  params?: { limit?: number; lastMessageId?: string },
): Promise<{ messages: GhlConversationMessage[]; latencyMs: number }> {
  const queryParts: string[] = [];
  if (params?.limit) queryParts.push(`limit=${params.limit}`);
  if (params?.lastMessageId) queryParts.push(`lastMessageId=${encodeURIComponent(params.lastMessageId)}`);

  const qs = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
  const { data, latencyMs } = await callApi<GhlApiConversationMessagesResponse>(
    'GET',
    `/conversations/${conversationId}/messages${qs}`,
  );

  return { messages: data.messages ?? [], latencyMs };
}

// ── Opportunities (Enhanced) ──────────────────────────────

/**
 * Search/list opportunities for the location.
 */
export async function searchOpportunities(params?: {
  query?: string;
  pipelineId?: string;
  pipelineStageId?: string;
  status?: string;
  contactId?: string;
  assignedTo?: string;
  limit?: number;
}): Promise<{ opportunities: GhlOpportunity[]; latencyMs: number }> {
  const locationId = env.GHL_LOCATION_ID?.trim();
  if (!locationId) {
    throw new GhlApiError('GHL_LOCATION_ID is not configured', 503, 0);
  }

  const queryParts = [`locationId=${locationId}`];
  if (params?.query) queryParts.push(`query=${encodeURIComponent(params.query)}`);
  if (params?.pipelineId) queryParts.push(`pipelineId=${encodeURIComponent(params.pipelineId)}`);
  if (params?.pipelineStageId) queryParts.push(`pipelineStageId=${encodeURIComponent(params.pipelineStageId)}`);
  if (params?.status) queryParts.push(`status=${encodeURIComponent(params.status)}`);
  if (params?.contactId) queryParts.push(`contactId=${encodeURIComponent(params.contactId)}`);
  if (params?.assignedTo) queryParts.push(`assignedTo=${encodeURIComponent(params.assignedTo)}`);
  if (params?.limit) queryParts.push(`limit=${params.limit}`);

  const { data, latencyMs } = await callApi<GhlApiOpportunitiesSearchResponse>(
    'GET',
    `/opportunities/search?${queryParts.join('&')}`,
  );

  return { opportunities: data.opportunities ?? [], latencyMs };
}

/**
 * Delete an opportunity.
 */
export async function deleteOpportunity(
  opportunityId: string,
): Promise<{ latencyMs: number; statusCode: number }> {
  const { latencyMs, statusCode } = await callApi<Record<string, unknown>>(
    'DELETE',
    `/opportunities/${opportunityId}`,
  );

  return { latencyMs, statusCode };
}

// ── Notes (Enhanced) ──────────────────────────────────────

/**
 * Get a single note by ID.
 */
export async function getNote(
  contactId: string,
  noteId: string,
): Promise<{ note: GhlNote; latencyMs: number }> {
  const { data, latencyMs } = await callApi<GhlApiNoteResponse>(
    'GET',
    `/contacts/${contactId}/notes/${noteId}`,
  );

  return { note: data.note, latencyMs };
}

/**
 * Update a note on a contact.
 */
export async function updateNote(
  contactId: string,
  noteId: string,
  body: string,
): Promise<{ note: GhlNote; latencyMs: number; statusCode: number }> {
  const { data, latencyMs, statusCode } = await callApi<GhlApiNoteResponse>(
    'PUT',
    `/contacts/${contactId}/notes/${noteId}`,
    { body },
  );

  return { note: data.note, latencyMs, statusCode };
}

/**
 * Delete a note from a contact.
 */
export async function deleteNote(
  contactId: string,
  noteId: string,
): Promise<{ latencyMs: number; statusCode: number }> {
  const { latencyMs, statusCode } = await callApi<Record<string, unknown>>(
    'DELETE',
    `/contacts/${contactId}/notes/${noteId}`,
  );

  return { latencyMs, statusCode };
}

// ── Tasks ─────────────────────────────────────────────────

/**
 * Create a task linked to a contact.
 */
export async function createTask(
  contactId: string,
  params: {
    title: string;
    body?: string;
    dueDate?: string;
    assignedTo?: string;
    status?: string;
    completed?: boolean;
  },
): Promise<{ task: GhlTask; latencyMs: number; statusCode: number }> {
  const { data, latencyMs, statusCode } = await callApi<GhlApiTaskResponse>(
    'POST',
    `/contacts/${contactId}/tasks`,
    {
      title: params.title,
      body: params.body,
      dueDate: params.dueDate,
      assignedTo: params.assignedTo,
      status: params.status,
      completed: params.completed ?? false,
    },
  );

  return { task: data.task, latencyMs, statusCode };
}

/**
 * List tasks for a contact.
 */
export async function listTasks(
  contactId: string,
): Promise<{ tasks: GhlTask[]; latencyMs: number }> {
  const { data, latencyMs } = await callApi<GhlApiTasksListResponse>(
    'GET',
    `/contacts/${contactId}/tasks`,
  );

  return { tasks: data.tasks ?? [], latencyMs };
}

/**
 * Get a single task by ID.
 */
export async function getTask(
  contactId: string,
  taskId: string,
): Promise<{ task: GhlTask; latencyMs: number }> {
  const { data, latencyMs } = await callApi<GhlApiTaskResponse>(
    'GET',
    `/contacts/${contactId}/tasks/${taskId}`,
  );

  return { task: data.task, latencyMs };
}

/**
 * Update a task.
 */
export async function updateTask(
  contactId: string,
  taskId: string,
  updates: Record<string, unknown>,
): Promise<{ task: GhlTask; latencyMs: number; statusCode: number }> {
  const { data, latencyMs, statusCode } = await callApi<GhlApiTaskResponse>(
    'PUT',
    `/contacts/${contactId}/tasks/${taskId}`,
    updates,
  );

  return { task: data.task, latencyMs, statusCode };
}

/**
 * Delete a task.
 */
export async function deleteTask(
  contactId: string,
  taskId: string,
): Promise<{ latencyMs: number; statusCode: number }> {
  const { latencyMs, statusCode } = await callApi<Record<string, unknown>>(
    'DELETE',
    `/contacts/${contactId}/tasks/${taskId}`,
  );

  return { latencyMs, statusCode };
}

/**
 * Verify GHL API connection health.
 */
export async function verifyGhlConnection(): Promise<boolean> {
  try {
    const locationId = env.GHL_LOCATION_ID?.trim();
    if (!locationId) {
      logger.warn('GHL_LOCATION_ID is not configured — cannot verify connection');
      return false;
    }
    await callApi('GET', `/contacts/?locationId=${locationId}&limit=1`);
    return true;
  } catch (err) {
    logger.warn({ err }, 'GHL API connection verification failed');
    return false;
  }
}
