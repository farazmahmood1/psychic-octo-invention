export interface ParsedMailbox {
  address: string | null;
  displayName: string | null;
}

export function parseMailbox(value: string | null | undefined): ParsedMailbox {
  if (!value) {
    return { address: null, displayName: null };
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return { address: null, displayName: null };
  }

  const bracketMatch = /^(.*)<([^>]+)>$/.exec(trimmed);
  if (bracketMatch) {
    const displayName = cleanDisplayName(bracketMatch[1] ?? '');
    const address = normalizeMailboxAddress(bracketMatch[2] ?? '');
    return { address, displayName };
  }

  return {
    address: normalizeMailboxAddress(trimmed),
    displayName: null,
  };
}

export function normalizeMailboxAddress(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  const bracketMatch = /<([^>]+)>/.exec(trimmed);
  const candidate = bracketMatch ? (bracketMatch[1] ?? '') : trimmed;
  const normalizedCandidate = candidate.trim().replace(/^<|>$/g, '');
  if (!normalizedCandidate || !normalizedCandidate.includes('@') || normalizedCandidate.length > 254) {
    return null;
  }

  return normalizedCandidate.toLowerCase();
}

export function normalizeMailboxList(values: string | string[] | null | undefined): string[] {
  // Coerce to array — some providers send a single string instead of string[]
  const list = Array.isArray(values) ? values : values ? [values] : [];
  return list
    .map((value) => parseMailbox(value).address)
    .filter((value): value is string => Boolean(value));
}

function cleanDisplayName(value: string): string | null {
  const trimmed = value.trim().replace(/^"+|"+$/g, '');
  return trimmed ? trimmed : null;
}
