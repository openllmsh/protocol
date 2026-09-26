/**
 * Persisted-error sanitization for `public.requests.error` — the SINGLE
 * implementation shared by the daemon (`packages/daemon/src/cloud-client.ts`,
 * applied before a row ever reaches the local outbox) and the API
 * (`packages/api/handlers/usage.ts`, re-applied at insert so a caller can
 * never bypass it). There is no second copy to drift from.
 *
 * `requests.error` is caller-supplied text that can carry a verbatim
 * upstream body — prompt echo, signed URLs, tokens, `api_key=…` fields.
 * Pattern-scrubbing cannot enumerate every secret shape, and neither can a
 * bare identifier regex: `sk-llm-…` IS identifier-shaped, so the stored
 * value is reduced to an ALLOWLIST shape assembled only from inert atoms:
 *
 *   `HTTP <status>`          — when the producer prefixed one
 *   `(<type>[/<code>])`      — only atoms in {@link USAGE_ERROR_CLASSIFIERS};
 *                              anything else is stored as `other`
 *   `<daemon-authored head>` — one of {@link USAGE_ERROR_SAFE_HEADS}
 *   `— <category>`           — fixed text derived from status + type
 *
 * The shape is idempotent: a `(type/code)` token re-parses through the same
 * closed allowlist, so a daemon-sanitized row survives the server pass
 * unchanged.
 */

/** Stored in place of any classifier the closed list does not know — an
 *  inert atom that still says "a classifier was present" without keeping
 *  the caller's token. */
export const USAGE_ERROR_OTHER_CLASSIFIER = "other";

/**
 * The closed allowlist of error `type`/`code` atoms that may persist —
 * collected from the upstream error vocabulary this codebase can actually
 * produce: `packages/wire` streaming decoders (`UpstreamStreamError` types
 * from the Anthropic `error` event and the chatgpt error-object
 * type/code), the vendor error-envelope mappers in `packages/wire` and
 * `packages/core`, the documented Anthropic/OpenAI error vocabularies,
 * and this repo's own synthetic types. A token NOT in this set becomes
 * {@link USAGE_ERROR_OTHER_CLASSIFIER} — a secret can never ride the
 * classifier into the ledger.
 */
export const USAGE_ERROR_CLASSIFIERS: ReadonlySet<string> = new Set([
  // Anthropic `error.type` vocabulary (error events + envelopes).
  "invalid_request_error",
  "authentication_error",
  "billing_error",
  "permission_error",
  "not_found_error",
  "rate_limit_error",
  "timeout_error",
  "overloaded_error",
  "api_error",
  // OpenAI / OpenAI-compatible `error.type` + `error.code` vocabulary —
  // chatgpt Codex, kimi, grok, and forwarded cloud envelopes.
  "invalid_api_key",
  "insufficient_quota",
  "model_not_found",
  "rate_limit_exceeded",
  "context_length_exceeded",
  "content_filter",
  "billing_hard_limit_reached",
  "quota_exceeded",
  "slow_down",
  "server_error",
  "engine_overloaded",
  "bad_gateway",
  "service_unavailable",
  "invalid_request",
  "timeout",
  "tokens",
  "requests",
  // This repo's own synthetic error types (vendor-envelope mappers +
  // the stream fallback in `upstream-error.ts`).
  "upstream_error",
  "stream_error",
  "chatgpt_error",
  "openai_error",
  "anthropic_error",
  "kimi_code_error",
  "google_image_error",
  "google_video_error",
  "google_audio_error",
  "bedrock_error",
  // The hop-classifier vocabulary (`CooldownReason`) — inert atoms a
  // vendor or proxy may legitimately echo in an envelope's type/code slot.
  "network",
  "rate_limit",
  "quota_exhausted",
  "auth",
  "payment",
  "not_found",
  "payload_too_large",
  "unprocessable",
  "context_overflow",
  "upstream_rejection",
  // The closed-list fallback atom itself, so `(other)` re-parses as itself.
  USAGE_ERROR_OTHER_CLASSIFIER,
]);

const USAGE_ERROR_TOTAL_MAX = 200;

/** Daemon-authored error heads — OUR fixed strings, safe to keep. The
 *  upstream-wire slot is a closed alternation (`TUpstreamWire`), never a
 *  `\w+` wildcard — a wildcard would preserve caller-controlled text. */
const USAGE_ERROR_SAFE_HEADS: ReadonlyArray<RegExp> = [
  /^upstream stream failed after output began\b/,
  /^upstream stream ended before producing output\b/,
  /^delivered verbatim but not metered\b/,
  /^response body is not JSON\b/,
  /^response did not decode on the (?:anthropic|chatgpt|openai) wire\b/,
  /^network error\b/,
];

/** Well-known upstream `error.type`/`code` atoms → fixed category text. */
const USAGE_ERROR_CATEGORY_BY_TYPE: Readonly<Record<string, string>> = {
  insufficient_quota: "quota exhausted",
  quota_exceeded: "quota exhausted",
  quota_exhausted: "quota exhausted",
  billing_hard_limit_reached: "quota exhausted",
  billing_error: "quota exhausted",
  rate_limit_error: "rate limited",
  rate_limit_exceeded: "rate limited",
  rate_limit: "rate limited",
  slow_down: "rate limited",
  tokens: "rate limited",
  requests: "rate limited",
  overloaded_error: "upstream overloaded",
  engine_overloaded: "upstream overloaded",
  authentication_error: "authentication failed",
  invalid_api_key: "authentication failed",
  auth: "authentication failed",
  permission_error: "access denied",
  not_found_error: "not found",
  not_found: "not found",
  model_not_found: "not found",
  context_length_exceeded: "context length exceeded",
  context_overflow: "context length exceeded",
  invalid_request_error: "invalid request",
  invalid_request: "invalid request",
  timeout_error: "request timed out",
  timeout: "request timed out",
  payment: "payment required",
  content_filter: "content filtered",
  api_error: "upstream server error",
  server_error: "upstream server error",
  bad_gateway: "upstream server error",
  service_unavailable: "upstream server error",
};

/** The message is ALWAYS one of these fixed strings — chosen from the
 *  allowlisted type, then the HTTP status, then the row status. */
const usageErrorCategory = (
  status: number | null,
  type: string | null,
  statusHint: string | undefined,
): string => {
  if (type !== null) {
    const mapped = USAGE_ERROR_CATEGORY_BY_TYPE[type.toLowerCase()];
    if (mapped !== undefined) return mapped;
  }
  if (status !== null) {
    if (status === 429) return "rate limited";
    if (status === 401 || status === 403) return "authentication failed";
    if (status === 402) return "payment required";
    if (status === 404) return "not found";
    if (status === 408 || status === 504) return "request timed out";
    if (status === 413) return "request too large";
    if (status >= 500) return "upstream server error";
    if (status >= 400) return "request rejected";
  }
  if (statusHint === "rate_limited") return "rate limited";
  if (statusHint === "timeout") return "request timed out";
  return "upstream error";
};

/**
 * One classifier atom: a non-empty string keeps its place in the stored
 * shape — the allowlisted value, or `other` when the closed list does not
 * know it. Non-strings and empties are absent classifiers, not atoms.
 */
const usageErrorClassifierAtom = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const token = value.trim().toLowerCase();
  if (token === "") return null;
  return USAGE_ERROR_CLASSIFIERS.has(token)
    ? token
    : USAGE_ERROR_OTHER_CLASSIFIER;
};

/** Extraction shape of an already-sanitized `(type[/code])` token — used
 *  only to RE-PARSE what a previous pass wrote; membership in
 *  {@link USAGE_ERROR_CLASSIFIERS} still decides what survives. */
const USAGE_ERROR_CLASSIFIER_TOKEN_RE =
  /\(([a-z0-9_.-]{1,64})(?:\/([a-z0-9_.-]{1,64}))?\)/i;

/**
 * Reduce a caller-supplied error string to the allowlisted stored shape.
 * No upstream message, no caller free text — only the atoms above.
 */
export const sanitizeUsageError = (
  raw: string | null | undefined,
  statusHint?: string,
): string | null | undefined => {
  if (raw === undefined || raw === null) return raw;
  const flat = raw.replace(/\s+/g, " ").trim();
  if (flat === "") return null;
  const statusMatch = /^HTTP (\d{3})\b/.exec(flat);
  const status = statusMatch !== null ? Number(statusMatch[1]) : null;
  // Allowlisted classifiers: a JSON error envelope's `error.type` /
  // `error.code`, or an already-sanitized `(type/code)` token — each kept
  // as its allowlisted atom (anything else becomes `other`).
  let type: string | null = null;
  let code: string | null = null;
  const brace = flat.indexOf("{");
  if (brace !== -1) {
    try {
      const parsed: unknown = JSON.parse(flat.slice(brace));
      const root =
        parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>)
          : {};
      const envelope =
        root.error !== null &&
        typeof root.error === "object" &&
        !Array.isArray(root.error)
          ? (root.error as Record<string, unknown>)
          : root;
      type = usageErrorClassifierAtom(envelope.type);
      code = usageErrorClassifierAtom(envelope.code);
    } catch {
      // An unparseable body contributes no classifier.
    }
  }
  if (type === null && code === null) {
    const classifier = USAGE_ERROR_CLASSIFIER_TOKEN_RE.exec(flat);
    if (classifier !== null) {
      type = usageErrorClassifierAtom(classifier[1]);
      code = usageErrorClassifierAtom(classifier[2]);
    }
  }
  const parts: string[] = [];
  if (statusMatch !== null) {
    parts.push(`HTTP ${statusMatch[1]}`);
  } else {
    for (const re of USAGE_ERROR_SAFE_HEADS) {
      const head = re.exec(flat)?.[0];
      if (head !== undefined) {
        parts.push(head);
        break;
      }
    }
  }
  const classifierText = [type, code]
    .filter((v): v is string => v !== null && v.length > 0)
    .join("/");
  if (classifierText.length > 0) parts.push(`(${classifierText})`);
  const category = usageErrorCategory(status, type, statusHint);
  parts.push(parts.length === 0 ? category : `— ${category}`);
  return parts.join(" ").slice(0, USAGE_ERROR_TOTAL_MAX);
};
