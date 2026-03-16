/**
 * GoHighLevel CRM type definitions.
 * Used by the GHL sub-agent for contact operations.
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
  action: 'search_contact' | 'update_contact' | 'get_contact';
  /** Search query for contact lookup */
  query?: string;
  /** Contact ID for direct operations */
  contactId?: string;
  /** Field updates to apply */
  updates?: Record<string, unknown>;
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

// ── GHL Tool Definitions ──────────────────────────────────

/** Tool definition for the LLM to invoke CRM operations */
export const GHL_CRM_TOOL_NAME = 'ghl_crm' as const;
