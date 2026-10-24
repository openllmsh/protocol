/**
 * Agent session protocol — the structured replacement for remote PTY
 * mirroring (docs/plan/2026-10-23-agent-sessions-replace-remote-pty.md).
 *
 * A consumer opens a mux stream with {@link AgentStreamOpenPayload}
 * (`kind:"agent"`, seed-gated on the daemon) or reaches the daemon's loopback
 * agent endpoint, then exchanges NDJSON lines over the flow-controlled DATA
 * channel:
 *
 *   consumer → daemon : {@link AgentCommand} (start / attach / send /
 *                        interrupt / respond / close)
 *   daemon → consumer : {@link AgentEvent} (session / turn / item / content /
 *                        request / user-input / token-usage / runtime)
 *
 * The event families are a trimmed subset of t3code's `ProviderRuntimeEvent`:
 * no multi-CLI orchestration, no event-sourcing / checkpoint / git tooling, no
 * terminal drawer, no realtime-audio, account or MCP-OAuth events. Every
 * engine adapter on the daemon emits this one stream, so the UI renders one
 * vocabulary whichever engine runs the session.
 *
 * Forward compatibility: an event whose `type` this build does not know
 * decodes to `null` and is dropped by consumers. Commands are validated
 * strictly by the serving daemon.
 */
import { Either, Schema as S } from "effect";

/**
 * Capability advertising `kind:"agent"` stream support. Consumers MUST check
 * {@link hasAgentCap} before OPEN; a peer without it gets "update your device".
 */
export const AGENT_CAP = "agent1";

/** Returns whether an open-vocabulary capability list advertises agent sessions. */
export const hasAgentCap = (caps: readonly string[] | undefined): boolean =>
  caps?.includes(AGENT_CAP) ?? false;

/**
 * Bound on ONE NDJSON agent line (JSON-encoded UTF-8 bytes, including the
 * trailing `\n`). Larger than the realtime bound because a `send` command may
 * carry inline attachments; a line (or unterminated remainder) over the bound
 * is an overflow, never a growing buffer.
 */
export const AGENT_MAX_LINE_BYTES = 8 * 1024 * 1024;

/** Max characters of one prompt. */
export const AGENT_MAX_PROMPT_LENGTH = 1024 * 1024;

/**
 * Daemon loopback route Claude's hooks post to (`openllm exec agent hook`):
 * busy/idle and PermissionRequest for agent sessions. Admitted like the other
 * `/local/*` routes (loopback peer + Host, local control capability).
 * Body: `{session_id, event, payload}`; reply: `{output}` (the hook's stdout
 * JSON) or `{}` for no output.
 */
export const AGENT_HOOK_LOCAL_PATH = "/local/agent-hook";
/** Claude hook events `openllm exec agent hook` forwards. */
export const AGENT_HOOK_EVENTS = ["PermissionRequest", "Stop"] as const;

/** Max inline attachments on one `send`. */
export const AGENT_MAX_ATTACHMENTS = 8;

/** Max base64 characters of one inline attachment. */
export const AGENT_MAX_ATTACHMENT_BASE64_LENGTH = 6 * 1024 * 1024;

/**
 * Engines an agent session can run. Each id is the `openllm <client>` the
 * daemon launches the engine through (same overlay, gateway URL, key, model
 * mapping), so a session's inference is routed through openllm whatever
 * model the user picked.
 */
export const AgentEngine = S.Literal("claude", "codex");
export type TAgentEngine = S.Schema.Type<typeof AgentEngine>;

/** Agent session id: daemon-minted or a vendor session id for attach/resume. */
export const AGENT_SESSION_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
export const AgentSessionId = S.String.pipe(
  S.pattern(AGENT_SESSION_ID_PATTERN),
);
export type TAgentSessionId = S.Schema.Type<typeof AgentSessionId>;

/** Opaque daemon-minted id for turns, items, and requests. */
const AgentRefId = S.String.pipe(S.minLength(1), S.maxLength(128));

/** Optional consumer-minted command id, echoed on correlated events. */
const AgentCommandId = S.String.pipe(S.minLength(1), S.maxLength(64));

const AgentModel = S.String.pipe(S.minLength(1), S.maxLength(256));

/** Absolute directory; the daemon validates it exists before starting. */
const AgentCwd = S.String.pipe(S.minLength(1), S.maxLength(1024));

const ShortText = S.String.pipe(S.maxLength(256));
const DetailText = S.String.pipe(S.maxLength(16 * 1024));

// ---------------------------------------------------------------------------
// Stream OPEN
// ---------------------------------------------------------------------------

/**
 * Mux `kind:"agent"` OPEN payload — folded into `StreamOpenPayload` in
 * `./mux`. Carries nothing but the kind: the session itself is driven by
 * {@link AgentCommand} lines on the stream, so one OPEN shape serves start,
 * attach and resume.
 */
export const AgentStreamOpenPayload = S.Struct({
  kind: S.Literal("agent"),
});
export type TAgentStreamOpenPayload = S.Schema.Type<
  typeof AgentStreamOpenPayload
>;

// ---------------------------------------------------------------------------
// Commands (consumer → daemon)
// ---------------------------------------------------------------------------

export const AgentAttachment = S.Struct({
  kind: S.Literal("image", "file"),
  name: S.optional(S.String.pipe(S.minLength(1), S.maxLength(256))),
  media_type: S.String.pipe(S.minLength(1), S.maxLength(128)),
  /** Base64 bytes. */
  data: S.String.pipe(S.maxLength(AGENT_MAX_ATTACHMENT_BASE64_LENGTH)),
});
export type TAgentAttachment = S.Schema.Type<typeof AgentAttachment>;

/** Decision on an approval request (`request.opened`). */
export const AgentRequestDecision = S.Literal(
  "accept",
  "accept_for_session",
  "decline",
  "cancel",
);
export type TAgentRequestDecision = S.Schema.Type<typeof AgentRequestDecision>;

/** Answers to a `user-input.requested`, keyed by question id. */
export const AgentUserInputAnswers = S.Record({
  key: S.String.pipe(S.minLength(1), S.maxLength(128)),
  value: S.Union(
    S.String.pipe(S.maxLength(16 * 1024)),
    S.Array(S.String.pipe(S.maxLength(1024))).pipe(S.maxItems(64)),
  ),
});
export type TAgentUserInputAnswers = S.Schema.Type<
  typeof AgentUserInputAnswers
>;

export const AgentStartCommand = S.Struct({
  type: S.Literal("start"),
  id: S.optional(AgentCommandId),
  engine: AgentEngine,
  /** Gateway model id; omitted → the engine's openllm default. */
  model: S.optional(AgentModel),
  /** Omitted → the daemon user's home directory. */
  cwd: S.optional(AgentCwd),
  /**
   * Per-session opt-in to the engine's skip-permissions mode
   * (`--dangerously-skip-permissions` or the vendor equivalent). Default off:
   * approvals surface as `request.opened` events.
   */
  skip_permissions: S.optional(S.Boolean),
  title: S.optional(S.String.pipe(S.maxLength(80))),
});
export type TAgentStartCommand = S.Schema.Type<typeof AgentStartCommand>;

export const AgentAttachCommand = S.Struct({
  type: S.Literal("attach"),
  id: S.optional(AgentCommandId),
  session_id: AgentSessionId,
  /** Engine of the target session when the consumer knows it (local index). */
  engine: S.optional(AgentEngine),
});
export type TAgentAttachCommand = S.Schema.Type<typeof AgentAttachCommand>;

export const AgentSendCommand = S.Struct({
  type: S.Literal("send"),
  id: S.optional(AgentCommandId),
  prompt: S.String.pipe(S.maxLength(AGENT_MAX_PROMPT_LENGTH)),
  attachments: S.optional(
    S.Array(AgentAttachment).pipe(S.maxItems(AGENT_MAX_ATTACHMENTS)),
  ),
});
export type TAgentSendCommand = S.Schema.Type<typeof AgentSendCommand>;

export const AgentInterruptCommand = S.Struct({
  type: S.Literal("interrupt"),
  id: S.optional(AgentCommandId),
  /** Omitted → the active turn. */
  turn_id: S.optional(AgentRefId),
});
export type TAgentInterruptCommand = S.Schema.Type<
  typeof AgentInterruptCommand
>;

/**
 * Answer a pending approval (`decision`) or user-input request (`answers`).
 * Exactly one of the two is present.
 */
export const AgentRespondCommand = S.Struct({
  type: S.Literal("respond"),
  id: S.optional(AgentCommandId),
  request_id: AgentRefId,
  decision: S.optional(AgentRequestDecision),
  answers: S.optional(AgentUserInputAnswers),
}).pipe(
  S.filter(
    (command) =>
      (command.decision === undefined) !== (command.answers === undefined),
    {
      message: () => "respond carries exactly one of decision / answers",
    },
  ),
);
export type TAgentRespondCommand = S.Schema.Type<typeof AgentRespondCommand>;

export const AgentCloseCommand = S.Struct({
  type: S.Literal("close"),
  id: S.optional(AgentCommandId),
});
export type TAgentCloseCommand = S.Schema.Type<typeof AgentCloseCommand>;

/** One consumer → daemon command line. */
export const AgentCommand = S.Union(
  AgentStartCommand,
  AgentAttachCommand,
  AgentSendCommand,
  AgentInterruptCommand,
  AgentRespondCommand,
  AgentCloseCommand,
);
export type TAgentCommand = S.Schema.Type<typeof AgentCommand>;
export type TAgentCommandType = TAgentCommand["type"];

// ---------------------------------------------------------------------------
// Events (daemon → consumer)
// ---------------------------------------------------------------------------

/** Fields every event may carry. */
const eventBase = {
  /** The session this event belongs to (absent only before one exists). */
  session_id: S.optional(AgentSessionId),
  /** Daemon-assigned ordinal, monotonically increasing per session. */
  seq: S.optional(S.Number.pipe(S.int(), S.nonNegative())),
  /** Epoch milliseconds on the daemon. */
  at: S.optional(S.Number.pipe(S.nonNegative())),
  /** Echo of the {@link AgentCommand} `id` this event answers, if any. */
  command_id: S.optional(AgentCommandId),
} as const;

export const AgentSessionExitReason = S.Literal(
  "closed",
  "completed",
  "killed",
  "error",
);
export type TAgentSessionExitReason = S.Schema.Type<
  typeof AgentSessionExitReason
>;

export const AgentSessionStartedEvent = S.Struct({
  ...eventBase,
  type: S.Literal("session.started"),
  session_id: AgentSessionId,
  engine: AgentEngine,
  model: S.optional(AgentModel),
  cwd: S.optional(AgentCwd),
  /** True when this is an attach/resume of an existing engine session. */
  resumed: S.optional(S.Boolean),
  skip_permissions: S.optional(S.Boolean),
});

export const AgentSessionExitedEvent = S.Struct({
  ...eventBase,
  type: S.Literal("session.exited"),
  session_id: AgentSessionId,
  reason: AgentSessionExitReason,
  message: S.optional(ShortText),
});

export const AgentTurnStartedEvent = S.Struct({
  ...eventBase,
  type: S.Literal("turn.started"),
  turn_id: AgentRefId,
  model: S.optional(AgentModel),
  /**
   * The prompt text that opened the turn. Lets a consumer that attaches later
   * (replay) render the user's side of the transcript. Optional: older daemons
   * omit it and older consumers ignore it.
   */
  prompt: S.optional(S.String.pipe(S.maxLength(AGENT_MAX_PROMPT_LENGTH))),
});

export const AgentTurnCompletedEvent = S.Struct({
  ...eventBase,
  type: S.Literal("turn.completed"),
  turn_id: AgentRefId,
  stop_reason: S.optional(S.String.pipe(S.maxLength(64))),
});

export const AgentTurnAbortedEvent = S.Struct({
  ...eventBase,
  type: S.Literal("turn.aborted"),
  turn_id: AgentRefId,
  reason: S.Literal("interrupted", "failed", "cancelled"),
  message: S.optional(ShortText),
});

export const AgentToolStatus = S.Literal("in_progress", "completed", "failed");
export type TAgentToolStatus = S.Schema.Type<typeof AgentToolStatus>;

/** The renderable unit of a turn. */
export const AgentItem = S.Union(
  S.Struct({
    kind: S.Literal("assistant_message"),
    text: S.String,
  }),
  S.Struct({
    kind: S.Literal("reasoning"),
    text: S.String,
  }),
  S.Struct({
    kind: S.Literal("tool_call"),
    tool_name: S.String.pipe(S.minLength(1), S.maxLength(128)),
    title: S.optional(ShortText),
    /** The tool's input as the engine reported it (JSON). */
    input: S.optional(S.Unknown),
    status: AgentToolStatus,
    /** Result text, truncated by the daemon to fit one line. */
    output: S.optional(S.String),
    is_error: S.optional(S.Boolean),
  }),
);
export type TAgentItem = S.Schema.Type<typeof AgentItem>;

/** `item.updated` carries the item's full current state, not a diff. */
const itemEventFields = {
  ...eventBase,
  turn_id: S.optional(AgentRefId),
  item_id: AgentRefId,
  item: AgentItem,
} as const;

export const AgentItemStartedEvent = S.Struct({
  ...itemEventFields,
  type: S.Literal("item.started"),
});
export const AgentItemUpdatedEvent = S.Struct({
  ...itemEventFields,
  type: S.Literal("item.updated"),
});
export const AgentItemCompletedEvent = S.Struct({
  ...itemEventFields,
  type: S.Literal("item.completed"),
});

export const AgentContentStream = S.Literal(
  "assistant_text",
  "reasoning_text",
  "tool_output",
);
export type TAgentContentStream = S.Schema.Type<typeof AgentContentStream>;

export const AgentContentDeltaEvent = S.Struct({
  ...eventBase,
  type: S.Literal("content.delta"),
  turn_id: S.optional(AgentRefId),
  item_id: AgentRefId,
  stream: AgentContentStream,
  delta: S.String,
});

/** What an approval request asks permission for. */
export const AgentRequestKind = S.Literal(
  "command",
  "file_change",
  "tool",
  "other",
);
export type TAgentRequestKind = S.Schema.Type<typeof AgentRequestKind>;

export const AgentRequestOpenedEvent = S.Struct({
  ...eventBase,
  type: S.Literal("request.opened"),
  request_id: AgentRefId,
  turn_id: S.optional(AgentRefId),
  item_id: S.optional(AgentRefId),
  request_kind: AgentRequestKind,
  title: S.optional(ShortText),
  detail: S.optional(DetailText),
  input: S.optional(S.Unknown),
});

export const AgentRequestResolvedEvent = S.Struct({
  ...eventBase,
  type: S.Literal("request.resolved"),
  request_id: AgentRefId,
  decision: AgentRequestDecision,
});

export const AgentUserInputQuestion = S.Struct({
  id: S.String.pipe(S.minLength(1), S.maxLength(128)),
  header: S.optional(ShortText),
  question: DetailText,
  options: S.optional(
    S.Array(
      S.Struct({
        label: ShortText,
        description: S.optional(S.String.pipe(S.maxLength(1024))),
      }),
    ).pipe(S.maxItems(64)),
  ),
  multi_select: S.optional(S.Boolean),
});
export type TAgentUserInputQuestion = S.Schema.Type<
  typeof AgentUserInputQuestion
>;

export const AgentUserInputRequestedEvent = S.Struct({
  ...eventBase,
  type: S.Literal("user-input.requested"),
  request_id: AgentRefId,
  turn_id: S.optional(AgentRefId),
  questions: S.Array(AgentUserInputQuestion).pipe(
    S.minItems(1),
    S.maxItems(16),
  ),
});

export const AgentUserInputResolvedEvent = S.Struct({
  ...eventBase,
  type: S.Literal("user-input.resolved"),
  request_id: AgentRefId,
  answers: AgentUserInputAnswers,
});

const TokenCount = S.Number.pipe(S.int(), S.nonNegative());

export const AgentTokenUsage = S.Struct({
  input_tokens: TokenCount,
  output_tokens: TokenCount,
  cached_input_tokens: S.optional(TokenCount),
  reasoning_tokens: S.optional(TokenCount),
  total_tokens: S.optional(TokenCount),
  /** The model's context window, when known, for a fill gauge. */
  context_window: S.optional(TokenCount),
});
export type TAgentTokenUsage = S.Schema.Type<typeof AgentTokenUsage>;

export const AgentTokenUsageUpdatedEvent = S.Struct({
  ...eventBase,
  type: S.Literal("thread.token-usage.updated"),
  usage: AgentTokenUsage,
});

export const AgentRuntimeWarningEvent = S.Struct({
  ...eventBase,
  type: S.Literal("runtime.warning"),
  code: S.optional(S.String.pipe(S.maxLength(64))),
  message: DetailText,
});

export const AgentRuntimeErrorEvent = S.Struct({
  ...eventBase,
  type: S.Literal("runtime.error"),
  code: S.optional(S.String.pipe(S.maxLength(64))),
  message: DetailText,
  /** True when the session cannot continue (a `session.exited` follows). */
  fatal: S.optional(S.Boolean),
});

/** One daemon → consumer event line. */
export const AgentEvent = S.Union(
  AgentSessionStartedEvent,
  AgentSessionExitedEvent,
  AgentTurnStartedEvent,
  AgentTurnCompletedEvent,
  AgentTurnAbortedEvent,
  AgentItemStartedEvent,
  AgentItemUpdatedEvent,
  AgentItemCompletedEvent,
  AgentContentDeltaEvent,
  AgentRequestOpenedEvent,
  AgentRequestResolvedEvent,
  AgentUserInputRequestedEvent,
  AgentUserInputResolvedEvent,
  AgentTokenUsageUpdatedEvent,
  AgentRuntimeWarningEvent,
  AgentRuntimeErrorEvent,
);
export type TAgentEvent = S.Schema.Type<typeof AgentEvent>;
export type TAgentEventType = TAgentEvent["type"];
/** Narrow {@link TAgentEvent} to one `type`. */
export type TAgentEventOf<K extends TAgentEventType> = Extract<
  TAgentEvent,
  { readonly type: K }
>;

// ---------------------------------------------------------------------------
// Parsing + NDJSON framing
// ---------------------------------------------------------------------------

const decodeCommand = S.decodeUnknownEither(AgentCommand);
const decodeEvent = S.decodeUnknownEither(AgentEvent);

/** Decode an already-parsed JSON value as a command, or null. */
export const parseAgentCommand = (value: unknown): TAgentCommand | null => {
  const result = decodeCommand(value);
  return Either.isRight(result) ? result.right : null;
};

/** Decode an already-parsed JSON value as an event, or null (unknown types too). */
export const parseAgentEvent = (value: unknown): TAgentEvent | null => {
  const result = decodeEvent(value);
  return Either.isRight(result) ? result.right : null;
};

const lineEncoder = new TextEncoder();
const lineDecoder = new TextDecoder("utf-8", { fatal: true });
const NEWLINE = 0x0a;

/**
 * JSON-encode one value as a newline-terminated line. Null when it does not
 * serialize or exceeds {@link AGENT_MAX_LINE_BYTES} — the caller decides
 * (truncate, or emit a `runtime.warning`); a truncated line would desync the
 * framing.
 */
export const encodeAgentLine = (value: unknown): Uint8Array | null => {
  let text: string | undefined;
  try {
    text = JSON.stringify(value);
  } catch {
    return null;
  }
  if (text === undefined) return null;
  const encoded = lineEncoder.encode(`${text}\n`);
  return encoded.byteLength > AGENT_MAX_LINE_BYTES ? null : encoded;
};

/** Decode one line's bytes (without `\n`) into JSON, or `undefined`. */
export const decodeAgentLine = (line: Uint8Array): unknown => {
  try {
    return JSON.parse(lineDecoder.decode(line));
  } catch {
    return undefined;
  }
};

export type TAgentLineSplitter = {
  /**
   * Feed one chunk; returns the complete lines it finished (without `\n`), or
   * null once a line exceeds `maxLineBytes` (the splitter stays failed).
   */
  readonly push: (chunk: Uint8Array) => readonly Uint8Array[] | null;
};

/**
 * Stateful NDJSON splitter. Partial lines are kept as a chunk list and joined
 * once, when their newline arrives, so a multi-megabyte line costs one copy
 * rather than one per DATA frame.
 */
export const createAgentLineSplitter = (
  maxLineBytes: number = AGENT_MAX_LINE_BYTES,
): TAgentLineSplitter => {
  let pending: Uint8Array[] = [];
  let pendingBytes = 0;
  let failed = false;
  const join = (tail: Uint8Array): Uint8Array => {
    if (pending.length === 0) return tail;
    const out = new Uint8Array(pendingBytes + tail.byteLength);
    let offset = 0;
    for (const part of pending) {
      out.set(part, offset);
      offset += part.byteLength;
    }
    out.set(tail, offset);
    pending = [];
    pendingBytes = 0;
    return out;
  };
  return {
    push: (chunk) => {
      if (failed) return null;
      const lines: Uint8Array[] = [];
      let start = 0;
      for (let i = 0; i < chunk.byteLength; i += 1) {
        if (chunk[i] !== NEWLINE) continue;
        if (pendingBytes + (i - start) > maxLineBytes) {
          failed = true;
          return null;
        }
        lines.push(join(chunk.subarray(start, i)));
        start = i + 1;
      }
      if (start < chunk.byteLength) {
        const rest = chunk.subarray(start);
        if (pendingBytes + rest.byteLength > maxLineBytes) {
          failed = true;
          return null;
        }
        // Copy: the transport may reuse the chunk's buffer.
        pending.push(rest.slice());
        pendingBytes += rest.byteLength;
      }
      return lines;
    },
  };
};
