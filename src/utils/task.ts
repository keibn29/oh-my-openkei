/**
 * Parse Task tool output to recover a session/task ID for resumption.
 *
 * Resolution order (authoritative sources first):
 *  1. `metadata.sessionId` — the host-reported ID for the call.
 *  2. The outer host envelope `<task id="ses_..." state="completed">`.
 *  3. A leading legacy `task_id: <id> (...)` header line.
 *
 * The child result body is never scanned, so a quoted example or embedded
 * output inside the body cannot spoof a resumable session ID. A malformed
 * envelope therefore yields `undefined` instead of falling back to a legacy
 * header hidden in the body.
 *
 * Metadata is honored only as a non-array record carrying a usable `sessionId`;
 * a bare string or any other shape is ignored.
 */

/** Current host session ID shape; length is host-defined, not fixed. */
const CURRENT_SESSION_ID = /^ses_[A-Za-z0-9]+$/;

/**
 * Historical IDs (for example `session-abc-123`) stay valid inputs, so the
 * legacy header accepts a wider but still inert character set.
 */
const SAFE_SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

const MAX_SESSION_ID_LENGTH = 128;

/** Anchored host envelope; attribute parsing happens separately. */
const TASK_ENVELOPE =
  /^<task(\s[^>]*)?>\s*<task_result>[\s\S]*<\/task_result>\s*<\/task>$/;

/**
 * One attribute of the host opening tag: whitespace, a name, and a quoted
 * value. Deliberately narrow — a bare name, an unquoted value, or any other
 * leftover text is a parse failure instead of silently ignored filler.
 */
const ENVELOPE_ATTRIBUTE =
  /\s*([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"<>\r\n]*)"|'([^'<>\r\n]*)')/y;

const LEGACY_HEADER =
  /^task_id:[ \t]*([A-Za-z0-9][A-Za-z0-9._-]*)[ \t]*(?:\(.*\))?$/;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function isUsableSessionId(value: string): boolean {
  return value.length <= MAX_SESSION_ID_LENGTH && SAFE_SESSION_ID.test(value);
}

/**
 * Read the host-reported session ID from tool metadata. Metadata is typed
 * `unknown` at the hook boundary, so anything that is not a non-array record
 * with a usable `sessionId` string is ignored and the result text is used.
 */
export function taskSessionIdFromMetadata(
  metadata: unknown,
): string | undefined {
  const record = asRecord(metadata);
  const candidate = record?.sessionId;
  if (typeof candidate !== 'string') return undefined;

  const trimmed = candidate.trim();
  return isUsableSessionId(trimmed) ? trimmed : undefined;
}

/**
 * Parse the attributes of an open tag. The source must be consumed entirely
 * by attribute pairs (trailing whitespace aside), and duplicate attributes make
 * the tag ambiguous, so the whole attribute map is rejected.
 */
function parseAttributes(source: string): Map<string, string> | undefined {
  const attributes = new Map<string, string>();
  let consumed = 0;

  while (consumed < source.length) {
    ENVELOPE_ATTRIBUTE.lastIndex = consumed;
    const match = ENVELOPE_ATTRIBUTE.exec(source);
    if (!match) {
      return source.slice(consumed).trim() === '' ? attributes : undefined;
    }

    const name = match[1];
    if (attributes.has(name)) return undefined;
    attributes.set(name, match[2] ?? match[3]);
    consumed = ENVELOPE_ATTRIBUTE.lastIndex;
  }

  return attributes;
}

function sessionIdFromEnvelope(text: string): string | undefined {
  const envelope = TASK_ENVELOPE.exec(text);
  if (!envelope) return undefined;

  const attributes = parseAttributes(envelope[1] ?? '');
  if (!attributes) return undefined;

  const id = attributes.get('id');
  if (!id || !isUsableSessionId(id) || !CURRENT_SESSION_ID.test(id)) {
    return undefined;
  }
  if (attributes.get('state') !== 'completed') return undefined;

  return id;
}

function sessionIdFromLegacyHeader(text: string): string | undefined {
  const header = text.split(/\r?\n/, 1)[0]?.trim() ?? '';
  const match = LEGACY_HEADER.exec(header);
  if (!match) return undefined;

  return isUsableSessionId(match[1]) ? match[1] : undefined;
}

/**
 * @param output - Task tool result text.
 * @param metadata - Task tool result metadata (opaque; may be absent).
 */
export function parseTaskIdFromTaskOutput(
  output: string,
  metadata?: unknown,
): string | undefined {
  const fromMetadata = taskSessionIdFromMetadata(metadata);
  if (fromMetadata) return fromMetadata;

  // `trim()` also drops a leading byte-order mark, so a BOM-prefixed
  // envelope still anchors here.
  const text = output.trim();
  if (!text) return undefined;

  if (/^<task[\s>]/.test(text)) {
    return sessionIdFromEnvelope(text);
  }

  return sessionIdFromLegacyHeader(text);
}
