import type { ParsedEmailThread, ThreadSegment } from '@nexclaw/shared';

/**
 * Parse email body to separate current message from quoted/forwarded history.
 *
 * Handles:
 * - Standard "On <date>, <name> wrote:" quoted replies
 * - Outlook-style "From: ... Sent: ... Subject: ..." blocks
 * - Forwarded messages ("---------- Forwarded message ----------")
 * - Gmail-style "---------- Forwarded message ----------"
 * - Multiple nested forwarded chains
 * - Messy quoted formatting with > prefix lines
 * - HTML-only emails (stripped to text first)
 */
export function parseEmailThread(
  textBody: string | null | undefined,
  htmlBody: string | null | undefined,
): ParsedEmailThread {
  const body = textBody?.trim() || stripHtml(htmlBody ?? '') || '';

  if (!body) {
    return {
      currentMessage: '',
      threadHistory: [],
      isForwarded: false,
      isQuotedReply: false,
    };
  }

  const segments: ThreadSegment[] = [];
  let isForwarded = false;
  let isQuotedReply = false;

  // Try to split on forwarded message markers first
  const forwardResult = splitForwardedChain(body);
  if (forwardResult.segments.length > 0) {
    isForwarded = true;
    const currentMessage = forwardResult.currentMessage.trim();

    // The forwarded segments may themselves contain quoted replies
    for (const seg of forwardResult.segments) {
      const quoteResult = splitQuotedReply(seg.content);
      if (quoteResult.segments.length > 0) {
        isQuotedReply = true;
        segments.push({
          from: seg.from,
          date: seg.date,
          content: quoteResult.currentMessage,
          type: 'forwarded',
        });
        segments.push(...quoteResult.segments);
      } else {
        segments.push(seg);
      }
    }

    return { currentMessage, threadHistory: segments, isForwarded, isQuotedReply };
  }

  // Try to split on quoted reply markers
  const quoteResult = splitQuotedReply(body);
  if (quoteResult.segments.length > 0) {
    isQuotedReply = true;
    return {
      currentMessage: quoteResult.currentMessage.trim(),
      threadHistory: quoteResult.segments,
      isForwarded,
      isQuotedReply,
    };
  }

  // No thread markers found — entire body is the current message
  return {
    currentMessage: body,
    threadHistory: [],
    isForwarded: false,
    isQuotedReply: false,
  };
}

// ── Forward Splitting ──────────────────────────────────────

const FORWARD_MARKERS = [
  /^-{3,}\s*Forwarded message\s*-{3,}/im,
  /^Begin forwarded message:/im,
  /^-{3,}\s*Original Message\s*-{3,}/im,
];

const OUTLOOK_FORWARD_HEADER = /^From:\s+.+\nSent:\s+.+\n(?:To:\s+.+\n)?Subject:\s+.+/im;

interface ForwardSplitResult {
  currentMessage: string;
  segments: ThreadSegment[];
}

function splitForwardedChain(body: string): ForwardSplitResult {
  // Try each forward marker pattern
  for (const marker of FORWARD_MARKERS) {
    const match = marker.exec(body);
    if (match) {
      const currentMessage = body.slice(0, match.index).trim();
      const forwardedContent = body.slice(match.index + match[0].length).trim();

      const segments = parseForwardedSegments(forwardedContent);
      if (segments.length > 0) {
        return { currentMessage, segments };
      }

      // If we couldn't parse headers, treat whole forwarded block as one segment
      return {
        currentMessage,
        segments: [{ from: null, date: null, content: forwardedContent, type: 'forwarded' }],
      };
    }
  }

  // Check for Outlook-style forward headers inline
  const outlookMatch = OUTLOOK_FORWARD_HEADER.exec(body);
  if (outlookMatch && outlookMatch.index > 20) {
    const currentMessage = body.slice(0, outlookMatch.index).trim();
    const forwardedContent = body.slice(outlookMatch.index).trim();

    return {
      currentMessage,
      segments: parseForwardedSegments(forwardedContent),
    };
  }

  return { currentMessage: body, segments: [] };
}

function parseForwardedSegments(content: string): ThreadSegment[] {
  const segments: ThreadSegment[] = [];
  const headerPattern = /^From:\s*(.+?)$/im;
  const datePattern = /^(?:Sent|Date):\s*(.+?)$/im;

  const fromMatch = headerPattern.exec(content);
  const dateMatch = datePattern.exec(content);

  // Find where the actual body starts (after the header block)
  const headerLines = content.split('\n');
  let bodyStartIdx = 0;
  for (let i = 0; i < headerLines.length; i++) {
    const line = headerLines[i]!.trim();
    if (
      line.startsWith('From:') ||
      line.startsWith('Sent:') ||
      line.startsWith('Date:') ||
      line.startsWith('To:') ||
      line.startsWith('Cc:') ||
      line.startsWith('Subject:') ||
      line === ''
    ) {
      bodyStartIdx = i + 1;
    } else {
      break;
    }
  }

  const bodyContent = headerLines.slice(bodyStartIdx).join('\n').trim();

  if (bodyContent) {
    segments.push({
      from: fromMatch?.[1]?.trim() ?? null,
      date: dateMatch?.[1]?.trim() ?? null,
      content: bodyContent,
      type: 'forwarded',
    });
  }

  return segments;
}

// ── Quoted Reply Splitting ─────────────────────────────────

const QUOTE_MARKERS = [
  // "On Mon, Jan 1, 2024 at 12:00 PM, John Doe <john@example.com> wrote:"
  /^On\s+.+\s+wrote:\s*$/im,
  // Outlook: "From: ... Sent: ... To: ... Subject: ..."
  /^From:\s+.+\nSent:\s+.+\n/im,
  // Simple date + author
  /^\d{1,2}\/\d{1,2}\/\d{2,4}.*(?:wrote|said):/im,
];

interface QuoteSplitResult {
  currentMessage: string;
  segments: ThreadSegment[];
}

function splitQuotedReply(body: string): QuoteSplitResult {
  // Check for ">" prefix lines (common quoted reply format)
  const lines = body.split('\n');
  const firstQuotedLineIdx = lines.findIndex((l) => /^>\s/.test(l));

  if (firstQuotedLineIdx > 0) {
    // Check if there's a quote marker just above the quoted lines
    const markerLineIdx = firstQuotedLineIdx - 1;
    const markerLine = lines[markerLineIdx]?.trim() ?? '';
    const isMarker = /wrote:\s*$/.test(markerLine) || markerLine === '';

    const cutIdx = isMarker ? markerLineIdx : firstQuotedLineIdx;
    const currentMessage = lines.slice(0, cutIdx).join('\n').trim();
    const quotedLines = lines.slice(firstQuotedLineIdx);

    // Strip ">" prefixes and parse quoted content
    const quotedContent = quotedLines
      .map((l) => l.replace(/^>\s?/, ''))
      .join('\n')
      .trim();

    // Try to extract author from the marker line
    const authorMatch = /^On\s+(.+?),\s*(.+?)\s+wrote:/i.exec(markerLine);
    const from = authorMatch?.[2]?.trim() ?? null;
    const date = authorMatch?.[1]?.trim() ?? null;

    if (quotedContent) {
      return {
        currentMessage,
        segments: [{ from, date, content: quotedContent, type: 'quoted' }],
      };
    }
  }

  // Try structured quote markers
  for (const marker of QUOTE_MARKERS) {
    const match = marker.exec(body);
    if (match && match.index > 10) {
      const currentMessage = body.slice(0, match.index).trim();
      const quotedContent = body.slice(match.index + match[0].length).trim();

      // Strip ">" prefix lines in the quoted section
      const cleanQuoted = quotedContent
        .split('\n')
        .map((l) => l.replace(/^>\s?/, ''))
        .join('\n')
        .trim();

      const authorMatch = /^On\s+(.+?),\s*(.+?)\s+wrote:/i.exec(match[0]);
      const from = authorMatch?.[2]?.trim() ?? null;
      const date = authorMatch?.[1]?.trim() ?? null;

      if (cleanQuoted) {
        return {
          currentMessage,
          segments: [{ from, date, content: cleanQuoted, type: 'quoted' }],
        };
      }
    }
  }

  return { currentMessage: body, segments: [] };
}

// ── HTML Stripping ─────────────────────────────────────────

/**
 * Simple HTML to text conversion.
 * Handles common email HTML patterns without requiring a full DOM parser.
 */
export function stripHtml(html: string): string {
  if (!html) return '';

  let text = html;

  // Remove style and script blocks
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');

  // Convert block elements to line breaks
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/(?:p|div|tr|li|h[1-6])>/gi, '\n');
  text = text.replace(/<(?:p|div|tr|li|h[1-6])[^>]*>/gi, '');

  // Remove all remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // Decode common HTML entities
  text = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));

  // Normalize whitespace
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/\n{3,}/g, '\n\n');
  text = text.trim();

  return text;
}

/**
 * Truncate text to a maximum byte size for safe storage.
 * Avoids storing excessively large email bodies.
 */
export function truncateToBytes(text: string, maxBytes: number): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);
  if (bytes.length <= maxBytes) return text;

  // Binary search for the right character boundary
  let low = 0;
  let high = text.length;
  while (low < high) {
    const mid = Math.floor((low + high + 1) / 2);
    if (encoder.encode(text.slice(0, mid)).length <= maxBytes - 3) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  return text.slice(0, low) + '...';
}
