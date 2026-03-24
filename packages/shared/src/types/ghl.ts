/**
 * GoHighLevel CRM type definitions.
 * Used by the GHL sub-agent for contact, opportunity, note, SMS, and appointment operations.
 */

// ── GHL Contact Types ─────────────────────────────────────

export interface GhlContact {
  id: string;
  firstName?: string;
  lastName?: string;
  /** Proper-case first name (GHL search returns lowercase firstName). */
  firstNameRaw?: string;
  /** Proper-case last name (GHL search returns lowercase lastName). */
  lastNameRaw?: string;
  name?: string;
  email?: string;
  phone?: string;
  companyName?: string;
  address1?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  website?: string;
  tags?: string[];
  source?: string;
  customField?: Record<string, unknown>;
  dateAdded?: string;
  dateUpdated?: string;
}

export interface GhlContactSearchResult {
  contacts: GhlContact[];
  total: number;
}

// ── GHL Opportunity Types ─────────────────────────────────

export interface GhlOpportunity {
  id: string;
  name: string;
  monetaryValue?: number;
  pipelineId: string;
  pipelineStageId: string;
  status: string;
  contactId?: string;
  assignedTo?: string;
  source?: string;
  dateAdded?: string;
  dateUpdated?: string;
  contact?: GhlContact;
}

export interface GhlPipeline {
  id: string;
  name: string;
  stages: GhlPipelineStage[];
  locationId: string;
}

export interface GhlPipelineStage {
  id: string;
  name: string;
  position?: number;
}

// ── GHL Note Types ────────────────────────────────────────

export interface GhlNote {
  id: string;
  body: string;
  contactId?: string;
  userId?: string;
  dateAdded?: string;
}

// ── GHL Conversation / SMS Types ──────────────────────────

export interface GhlConversation {
  id: string;
  contactId?: string;
  contactName?: string;
  locationId?: string;
  assignedTo?: string;
  status?: string;
  type?: string;
  lastMessageBody?: string;
  lastMessageDate?: string;
  lastMessageType?: string;
  lastMessageDirection?: string;
  unreadCount?: number;
  starred?: boolean;
  inbox?: boolean;
  dateAdded?: string;
  dateUpdated?: string;
}

export interface GhlConversationMessage {
  id?: string;
  contactId: string;
  type: 'SMS' | 'Email' | 'WhatsApp' | 'Call' | 'Live_Chat';
  message?: string;
  html?: string;
  subject?: string;
  conversationId?: string;
  dateAdded?: string;
  status?: string;
  direction?: string;
  callDuration?: number;
  callStatus?: string;
}

// ── GHL Task Types ────────────────────────────────────────

export interface GhlTask {
  id: string;
  contactId?: string;
  title?: string;
  body?: string;
  description?: string;
  assignedTo?: string;
  dueDate?: string;
  status?: string;
  completed?: boolean;
  dateAdded?: string;
  dateUpdated?: string;
}

// ── GHL Calendar / Appointment Types ──────────────────────

export interface GhlCalendar {
  id: string;
  name: string;
  locationId: string;
  description?: string;
  isActive?: boolean;
}

export interface GhlCalendarSlot {
  start: string;
  end: string;
}

export interface GhlAppointment {
  id: string;
  calendarId: string;
  contactId?: string;
  title?: string;
  status: string;
  startTime: string;
  endTime: string;
  assignedUserId?: string;
  notes?: string;
  address?: string;
  dateAdded?: string;
  dateUpdated?: string;
}

// ── GHL User Types ───────────────────────────────────────

export interface GhlUser {
  id: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  extension?: string;
  role?: string;
  type?: string;
  permissions?: Record<string, unknown>;
  locationIds?: string[];
}

// ── GHL Location Types ───────────────────────────────────

export interface GhlLocation {
  id: string;
  name?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  website?: string;
  email?: string;
  phone?: string;
  timezone?: string;
  logoUrl?: string;
  business?: Record<string, unknown>;
  social?: Record<string, unknown>;
  settings?: Record<string, unknown>;
}

// ── GHL Review Types ─────────────────────────────────────

export interface GhlReview {
  id: string;
  rating?: number;
  reviewer?: string;
  reviewerEmail?: string;
  body?: string;
  source?: string;
  locationId?: string;
  contactId?: string;
  dateAdded?: string;
  dateUpdated?: string;
}

// ── GHL Invoice Types ────────────────────────────────────

export interface GhlInvoiceItem {
  name: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  amount?: number;
  currency?: string;
}

export interface GhlInvoice {
  id: string;
  name?: string;
  title?: string;
  status?: string;
  contactId?: string;
  contactName?: string;
  businessDetails?: Record<string, unknown>;
  currency?: string;
  total?: number;
  amountDue?: number;
  amountPaid?: number;
  items?: GhlInvoiceItem[];
  dueDate?: string;
  issueDate?: string;
  sentTo?: string;
  liveMode?: boolean;
  invoiceNumber?: string;
  createdAt?: string;
  updatedAt?: string;
}

// ── GHL Order / Payment Types ────────────────────────────

export interface GhlOrderItem {
  name?: string;
  quantity?: number;
  unitPrice?: number;
  amount?: number;
}

export interface GhlOrder {
  id: string;
  contactId?: string;
  contactName?: string;
  contactEmail?: string;
  status?: string;
  amount?: number;
  currency?: string;
  source?: string;
  sourceType?: string;
  sourceName?: string;
  items?: GhlOrderItem[];
  createdAt?: string;
  updatedAt?: string;
  paymentMethod?: string;
  fulfillmentStatus?: string;
}

// ── GHL Campaign Types ──────────────────────────────────

export interface GhlCampaign {
  id: string;
  name?: string;
  status?: string;
  type?: string;
  locationId?: string;
  createdAt?: string;
  updatedAt?: string;
}

// ── GHL Workflow Types ──────────────────────────────────

export interface GhlWorkflow {
  id: string;
  name?: string;
  status?: string;
  version?: number;
  locationId?: string;
  createdAt?: string;
  updatedAt?: string;
}

// ── GHL Form Types ──────────────────────────────────────

export interface GhlForm {
  id: string;
  name?: string;
  locationId?: string;
  type?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface GhlFormSubmission {
  id: string;
  formId?: string;
  contactId?: string;
  name?: string;
  email?: string;
  phone?: string;
  others?: Record<string, unknown>;
  createdAt?: string;
}

// ── GHL Survey Types ────────────────────────────────────

export interface GhlSurvey {
  id: string;
  name?: string;
  locationId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface GhlSurveySubmission {
  id: string;
  surveyId?: string;
  contactId?: string;
  name?: string;
  email?: string;
  others?: Record<string, unknown>;
  createdAt?: string;
}

// ── Editable Fields ───────────────────────────────────────

/** Fields that the sub-agent is allowed to update in the first implementation. */
export const GHL_EDITABLE_FIELDS = [
  'firstName',
  'lastName',
  'email',
  'phone',
  'address1',
  'city',
  'state',
  'postalCode',
  'website',
  'tags',
] as const;

export type GhlEditableField = (typeof GHL_EDITABLE_FIELDS)[number];

// ── Sub-Agent Input/Output ────────────────────────────────

export interface GhlSubAgentInput {
  /** The action to perform */
  action:
    | 'search_contact'
    | 'update_contact'
    | 'get_contact'
    | 'create_contact'
    | 'create_opportunity'
    | 'get_opportunity'
    | 'update_opportunity'
    | 'search_opportunities'
    | 'delete_opportunity'
    | 'add_note'
    | 'list_notes'
    | 'get_note'
    | 'update_note'
    | 'delete_note'
    | 'send_sms'
    | 'list_conversations'
    | 'get_conversation'
    | 'update_conversation'
    | 'list_conversation_messages'
    | 'list_calendars'
    | 'get_free_slots'
    | 'create_appointment'
    | 'get_pipelines'
    | 'list_users'
    | 'get_location'
    | 'update_location'
    | 'list_reviews'
    | 'create_invoice'
    | 'get_invoice'
    | 'list_invoices'
    | 'send_invoice'
    | 'list_orders'
    | 'get_order'
    | 'update_calendar_event'
    | 'delete_calendar_event'
    | 'list_contact_appointments'
    | 'list_campaigns'
    | 'list_workflows'
    | 'trigger_workflow'
    | 'list_forms'
    | 'get_form_submissions'
    | 'list_surveys'
    | 'get_survey_submissions'
    | 'send_email'
    | 'create_task'
    | 'list_tasks'
    | 'get_task'
    | 'update_task'
    | 'delete_task'
    | 'get_appointment'
    | 'update_invoice';
  /** Search query for contact lookup */
  query?: string;
  /** Contact ID for direct operations */
  contactId?: string;
  /** Field updates to apply */
  updates?: Record<string, unknown>;
  /** Note body text — used with add_note */
  noteBody?: string;
  /** SMS message text — used with send_sms */
  message?: string;
  /** Opportunity details — used with create_opportunity */
  opportunityName?: string;
  pipelineId?: string;
  pipelineStageId?: string;
  monetaryValue?: number;
  /** Calendar/Appointment fields */
  calendarId?: string;
  startTime?: string;
  endTime?: string;
  title?: string;
  appointmentNotes?: string;
  /** Event ID — used with update/delete calendar events */
  eventId?: string;
  /** Invoice fields */
  invoiceId?: string;
  invoiceName?: string;
  invoiceItems?: GhlInvoiceItem[];
  dueDate?: string;
  currency?: string;
  /** Order fields */
  orderId?: string;
  /** Location fields */
  locationUpdates?: Record<string, unknown>;
  /** Workflow fields */
  workflowId?: string;
  /** Form fields */
  formId?: string;
  /** Survey fields */
  surveyId?: string;
  /** Email fields */
  emailSubject?: string;
  emailBody?: string;
  emailHtml?: string;
  /** Conversation fields */
  conversationId?: string;
  conversationStatus?: string;
  assignedTo?: string;
  /** Opportunity fields — used with get/update/delete/search */
  opportunityId?: string;
  opportunityStatus?: string;
  /** Note fields — used with get/update/delete */
  noteId?: string;
  /** Task fields */
  taskId?: string;
  taskTitle?: string;
  taskBody?: string;
  taskDueDate?: string;
  taskStatus?: string;
  taskCompleted?: boolean;
}

export interface GhlSubAgentOutput {
  /** Whether the operation succeeded */
  success: boolean;
  /** Action that was performed */
  action: string;
  /** Human-readable summary for the LLM to relay to the user */
  summary: string;
  /** Contact data if applicable */
  contact?: GhlContact | null;
  /** Multiple contacts for disambiguation */
  candidates?: GhlContact[];
  /** Fields that were changed */
  changedFields?: Record<string, { from: unknown; to: unknown }>;
  /** Error message if failed */
  error?: string;
  /** Whether clarification is needed from the user */
  needsClarification?: boolean;
  /** Suggested clarification question */
  clarificationQuestion?: string;
  /** Opportunity data if applicable */
  opportunity?: GhlOpportunity | null;
  /** Note data if applicable */
  note?: GhlNote | null;
  /** SMS/message data if applicable */
  messageResult?: GhlConversationMessage | null;
  /** Calendar list */
  calendars?: GhlCalendar[];
  /** Available slots */
  slots?: GhlCalendarSlot[];
  /** Appointment data */
  appointment?: GhlAppointment | null;
  /** Pipeline list */
  pipelines?: GhlPipeline[];
  /** Users list */
  users?: GhlUser[];
  /** Location data */
  location?: GhlLocation | null;
  /** Reviews list */
  reviews?: GhlReview[];
  /** Invoice data */
  invoice?: GhlInvoice | null;
  /** Invoices list */
  invoices?: GhlInvoice[];
  /** Order data */
  order?: GhlOrder | null;
  /** Orders list */
  orders?: GhlOrder[];
  /** Appointments list (for contact) */
  appointments?: GhlAppointment[];
  /** Campaigns list */
  campaigns?: GhlCampaign[];
  /** Workflows list */
  workflows?: GhlWorkflow[];
  /** Forms list */
  forms?: GhlForm[];
  /** Form submissions */
  formSubmissions?: GhlFormSubmission[];
  /** Surveys list */
  surveys?: GhlSurvey[];
  /** Survey submissions */
  surveySubmissions?: GhlSurveySubmission[];
  /** Conversation data */
  conversation?: GhlConversation | null;
  /** Conversations list */
  conversations?: GhlConversation[];
  /** Conversation messages */
  conversationMessages?: GhlConversationMessage[];
  /** Opportunities list */
  opportunities?: GhlOpportunity[];
  /** Notes list */
  notes?: GhlNote[];
  /** Task data */
  task?: GhlTask | null;
  /** Tasks list */
  tasks?: GhlTask[];
}

// ── GHL API Response Shapes ───────────────────────────────

export interface GhlApiContactResponse {
  contact: GhlContact;
}

export interface GhlApiSearchResponse {
  contacts: GhlContact[];
  /** v1 returns total at top level */
  total?: number;
  /** v2 returns total inside meta */
  meta?: {
    total: number;
    currentPage?: number;
    nextPage?: number;
    previousPage?: number;
  };
}

export interface GhlApiOpportunityResponse {
  opportunity: GhlOpportunity;
}

export interface GhlApiPipelinesResponse {
  pipelines: GhlPipeline[];
}

export interface GhlApiNoteResponse {
  note: GhlNote;
}

export interface GhlApiNotesListResponse {
  notes: GhlNote[];
}

export interface GhlApiSendMessageResponse {
  conversationId?: string;
  messageId?: string;
  message?: GhlConversationMessage;
  msg?: string;
}

export interface GhlApiCalendarsResponse {
  calendars: GhlCalendar[];
}

export interface GhlApiFreeSlotsResponse {
  [date: string]: GhlCalendarSlot[];
}

export interface GhlApiAppointmentResponse {
  event?: GhlAppointment;
  appointment?: GhlAppointment;
}

export interface GhlApiUsersResponse {
  users: GhlUser[];
}

export interface GhlApiLocationResponse {
  location: GhlLocation;
}

export interface GhlApiReviewsResponse {
  reviews: GhlReview[];
  meta?: {
    total: number;
    currentPage?: number;
    nextPage?: number;
  };
}

export interface GhlApiInvoiceResponse {
  invoice: GhlInvoice;
}

export interface GhlApiInvoicesListResponse {
  invoices: GhlInvoice[];
  total?: number;
}

export interface GhlApiOrderResponse {
  order: GhlOrder;
  data?: GhlOrder;
}

export interface GhlApiOrdersListResponse {
  orders: GhlOrder[];
  data?: GhlOrder[];
  meta?: {
    total: number;
    currentPage?: number;
    nextPage?: number;
  };
}

export interface GhlApiContactAppointmentsResponse {
  events?: GhlAppointment[];
  appointments?: GhlAppointment[];
}

export interface GhlApiConversationsResponse {
  conversations: GhlConversation[];
  total?: number;
}

export interface GhlApiConversationResponse {
  conversation: GhlConversation;
}

export interface GhlApiConversationMessagesResponse {
  messages: GhlConversationMessage[];
  lastMessageId?: string;
}

export interface GhlApiOpportunitiesSearchResponse {
  opportunities: GhlOpportunity[];
  meta?: {
    total: number;
    currentPage?: number;
    nextPage?: number;
  };
}

export interface GhlApiTaskResponse {
  task: GhlTask;
}

export interface GhlApiTasksListResponse {
  tasks: GhlTask[];
}

export interface GhlApiCampaignsResponse {
  campaigns: GhlCampaign[];
}

export interface GhlApiWorkflowsResponse {
  workflows: GhlWorkflow[];
}

export interface GhlApiFormsResponse {
  forms: GhlForm[];
}

export interface GhlApiFormSubmissionsResponse {
  submissions: GhlFormSubmission[];
  meta?: {
    total: number;
    currentPage?: number;
    nextPage?: number;
  };
}

export interface GhlApiSurveysResponse {
  surveys: GhlSurvey[];
}

export interface GhlApiSurveySubmissionsResponse {
  submissions: GhlSurveySubmission[];
  meta?: {
    total: number;
    currentPage?: number;
    nextPage?: number;
  };
}

// ── GHL Tool Definitions ──────────────────────────────────

/** Tool definition for the LLM to invoke CRM operations */
export const GHL_CRM_TOOL_NAME = 'ghl_crm' as const;
