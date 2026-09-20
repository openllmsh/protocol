/**
 * Binary mux payload vocabulary.
 *
 * Binary mux frames are deliberately outside `RelayFrame`: the relay routes on
 * the 9-byte header (defined by `@openllmsh/tunnel/codec`) and never imports
 * these payload schemas. The 16-byte channel-id envelope (`mux2`) tags each
 * binary message, so one WebSocket can carry several channels concurrently.
 */
import { Either, Schema as S } from "effect";
import {
  DeviceSessionCli,
  SessionTitleField,
  supportsDangerousSession,
} from "./daemon";
import {
  OPENLLM_CHAIN_HEADER,
  OPENLLM_RESOLVED_MODEL_HEADER,
} from "./inference-headers";
import { RealtimeStreamOpenPayload } from "./realtime";

/**
 * Capability advertising support for the binary mux wire format: the 16-byte
 * channel-UUID envelope (`@openllmsh/tunnel` `channel-envelope.ts`) wrapping
 * each binary WebSocket message, so one relay socket can carry several channels
 * (one per (consumer, serving) pair). The wire string stays `"mux2"` — the
 * legacy `"mux1"` single-channel framing has been removed entirely.
 */
export const MUX_CAP = "mux2";

/** Returns whether an open-vocabulary capability list advertises mux support. */
export const hasMuxCap = (caps: readonly string[] | undefined): boolean =>
  caps?.includes(MUX_CAP) ?? false;

/**
 * Capability advertising WebRTC data-channel mux hosting (browser ↔ daemon).
 * Layered on by the daemon when RTC responder support is compiled in.
 */
export const RTC_CAP = "rtc1";

/** Returns whether an open-vocabulary capability list advertises RTC support. */
export const hasRtcCap = (caps: readonly string[] | undefined): boolean =>
  caps?.includes(RTC_CAP) ?? false;

/**
 * Capability advertising seed-gated device-grant enforcement on channel /
 * tunnel / RTC open. Layered on by the daemon when a device-access pubkey is
 * pinned from bootstrap.
 */
export const SEEDGATE_CAP = "seedgate1";

/** Returns whether an open-vocabulary capability list advertises seedgate. */
export const hasSeedgateCap = (caps: readonly string[] | undefined): boolean =>
  caps?.includes(SEEDGATE_CAP) ?? false;

/**
 * HTTP media over the existing mux `kind:"tunnel"` stream (STT / TTS / image
 * generations / image edits). Old peers omit this; consumers MUST fail closed
 * before OPEN rather than send unknown surfaces.
 *
 * Advertisement is owned by the daemon hello/status list and MUST stay off
 * until the listener/walker actually serves these surfaces.
 */
export const MEDIA_HTTP_CAP = "media1";

export const hasMediaHttpCap = (caps: readonly string[] | undefined): boolean =>
  caps?.includes(MEDIA_HTTP_CAP) ?? false;

/**
 * POST `/v1/videos` (create job) over mux `kind:"tunnel"`. Distinct from
 * `media1` so a media1-only daemon never receives `video_create` OPEN.
 * Consumers MUST check {@link hasMediaHttpVideoCap} before OPEN.
 * GET poll/content stay off the mux (POST-only).
 */
export const MEDIA_HTTP_VIDEO_CAP = "media2";

export const hasMediaHttpVideoCap = (
  caps: readonly string[] | undefined,
): boolean => caps?.includes(MEDIA_HTTP_VIDEO_CAP) ?? false;

/**
 * The dedicated duplex realtime mux kind (`kind:"realtime"` in
 * {@link StreamOpenPayload}, vocabulary in `./realtime`). A distinct kind
 * from `kind:"tunnel"` (request/response HTTP) and PTY `kind:"session"` —
 * never overload either for a long-lived bidirectional voice session.
 *
 * NOT YET ADVERTISED: a daemon must add this to its capability list only
 * once (a) a provider delegate actually exposes `credentialForRealtime` and
 * (b) the local runtime path (dial → translate → bound) is wired end to
 * end. An old/unadvertising peer's `kind:"realtime"` OPEN still gets a
 * typed `realtime_unsupported` RESET before any session work starts — "old
 * peer fails before OPEN" is a CONSUMER-side responsibility (check
 * `hasRealtimeDuplexCap` on the peer's caps before calling
 * `@openllmsh/tunnel/streams`'s `realtimeStream`), not something the wire
 * format itself can enforce.
 */
export const REALTIME_DUPLEX_CAP = "realtime1";

export const hasRealtimeDuplexCap = (
  caps: readonly string[] | undefined,
): boolean => caps?.includes(REALTIME_DUPLEX_CAP) ?? false;

/**
 * Bounded capture for tunneled media HTTP bodies (multipart/binary). Distinct
 * from media-persistence limits. Daemon/cloud request readers should import
 * this rather than duplicating the literal.
 */
export const TUNNEL_MEDIA_MAX_BODY_BYTES = 20 * 1024 * 1024;

/**
 * Normalizes an optional relay version for observability only. Feature gating is
 * capability-based, never version-based.
 */
export const relayProtocolVersionOf = (frame: {
  readonly protocol_version?: number;
}): number => frame.protocol_version ?? 1;

/** The `/v1` surface a tunneled request targets. A closed vocabulary — the
 * serving daemon maps it to its OWN local endpoint path, so no free URL path
 * ever crosses the relay (mirrors the listener's surface discriminator).
 *
 * Validated by the SERVING DAEMON at stream open (mux); the relay never
 * decodes it.
 */
export const TunnelSurface = S.Literal(
  "chat_completions",
  "messages",
  "responses",
  "responses_compact",
  "audio_transcriptions",
  "audio_speech",
  "images_generations",
  "images_edits",
  "video_create",
  "video_retrieve",
  "video_content",
);
export type TTunnelSurface = S.Schema.Type<typeof TunnelSurface>;

export const MEDIA_HTTP_TUNNEL_SURFACES = [
  "audio_transcriptions",
  "audio_speech",
  "images_generations",
  "images_edits",
  "video_create",
] as const satisfies readonly TTunnelSurface[];

export const isMediaHttpTunnelSurface = (surface: TTunnelSurface): boolean =>
  (MEDIA_HTTP_TUNNEL_SURFACES as readonly string[]).includes(surface);

export const requiredMediaHttpCap = (
  surface: TTunnelSurface,
): typeof MEDIA_HTTP_CAP | typeof MEDIA_HTTP_VIDEO_CAP | null => {
  if (
    surface === "video_create" ||
    surface === "video_retrieve" ||
    surface === "video_content"
  ) {
    return MEDIA_HTTP_VIDEO_CAP;
  }
  if (isMediaHttpTunnelSurface(surface)) return MEDIA_HTTP_CAP;
  return null;
};

/** Fail closed: never OPEN a media surface the peer has not advertised. */
export const peerSupportsTunnelSurface = (
  caps: readonly string[] | undefined,
  surface: TTunnelSurface,
): boolean => {
  const required = requiredMediaHttpCap(surface);
  if (required === null) return true;
  return caps?.includes(required) ?? false;
};

const TUNNEL_CONTENT_TYPE_MAX = 256;

const ALLOWED_TUNNEL_ACCEPT = [
  "application/json",
  "text/event-stream",
  "audio/mpeg",
  "audio/wav",
  "audio/l16",
  "application/octet-stream",
  "image/png",
  "image/jpeg",
  "image/webp",
  "video/mp4",
] as const;

export type TTunnelAccept = (typeof ALLOWED_TUNNEL_ACCEPT)[number];

/**
 * Parse `name=value` / `name="quoted"` Content-Type parameters. Rejects CRLF,
 * NUL, empty names, and duplicate keys (including duplicate `boundary`).
 */
const contentTypeParams = (rest: string): Map<string, string> | null => {
  const params = new Map<string, string>();
  let i = 0;
  while (i < rest.length) {
    while (rest[i] === " " || rest[i] === "\t") i += 1;
    if (i >= rest.length) break;
    const eq = rest.indexOf("=", i);
    if (eq < 0) return null;
    const name = rest.slice(i, eq).trim().toLowerCase();
    if (name === "" || name.includes("\r") || name.includes("\n")) return null;
    if (params.has(name)) return null;
    i = eq + 1;
    if (rest[i] === '"') {
      i += 1;
      let value = "";
      while (i < rest.length) {
        const ch = rest[i];
        if (ch === "\\") {
          i += 1;
          if (i >= rest.length) return null;
          value += rest[i];
          i += 1;
          continue;
        }
        if (ch === '"') {
          i += 1;
          break;
        }
        if (ch === "\r" || ch === "\n" || ch === "\0") return null;
        value += ch;
        i += 1;
      }
      params.set(name, value);
    } else {
      const semi = rest.indexOf(";", i);
      const end = semi < 0 ? rest.length : semi;
      const value = rest.slice(i, end).trim();
      if (
        value === "" ||
        value.includes("\r") ||
        value.includes("\n") ||
        value.includes("\0")
      ) {
        return null;
      }
      params.set(name, value);
      i = end;
    }
    if (rest[i] === ";") i += 1;
    else if (i < rest.length && rest[i] !== " " && rest[i] !== "\t") {
      return null;
    }
  }
  return params;
};

/**
 * Allowlisted request Content-Type. Multipart MUST carry exactly one
 * `boundary` (quoted or token). Original spelling is preserved on success
 * so the FormData delimiter in the body still matches the header.
 */
export const isAllowedTunnelRequestContentType = (raw: string): boolean => {
  if (raw.length === 0 || raw.length > TUNNEL_CONTENT_TYPE_MAX) return false;
  if (raw.includes("\r") || raw.includes("\n") || raw.includes("\0")) {
    return false;
  }
  const slash = raw.indexOf("/");
  if (slash < 0) return false;
  const semi = raw.indexOf(";");
  const type = (semi < 0 ? raw : raw.slice(0, semi)).trim().toLowerCase();
  const params =
    semi < 0
      ? new Map<string, string>()
      : contentTypeParams(raw.slice(semi + 1));
  if (params === null) return false;
  if (type === "application/json") {
    const charset = params.get("charset");
    if (charset !== undefined && charset.toLowerCase() !== "utf-8")
      return false;
    for (const key of params.keys()) {
      if (key !== "charset") return false;
    }
    return true;
  }
  if (type === "application/octet-stream") {
    return params.size === 0;
  }
  if (type === "multipart/form-data") {
    const boundary = params.get("boundary");
    if (boundary === undefined || boundary === "") return false;
    for (const key of params.keys()) {
      if (key !== "boundary") return false;
    }
    return true;
  }
  return false;
};

export const TunnelAccept = S.Literal(...ALLOWED_TUNNEL_ACCEPT);
export const TunnelRequestContentType = S.String.pipe(
  S.maxLength(TUNNEL_CONTENT_TYPE_MAX),
  S.filter(isAllowedTunnelRequestContentType, {
    message: () => "unsupported tunnel content-type",
  }),
);

/** Speech persistence is daemon-owned unless the browser opts in and receives
 * this acknowledgement. Internal HTTP names bridge the closed mux metadata;
 * the request header is never forwarded to the cloud or provider. */
export const MEDIA_PERSISTENCE_REQUEST_HEADER = "x-openllm-media-persistence";
export const MEDIA_PERSISTENCE_RESPONSE_HEADER =
  "x-openllm-media-persistence-ack";
export const MEDIA_PERSISTENCE_BROWSER = "browser";
export const MEDIA_URL_RESPONSE_HEADER = "x-openllm-media-url";
export const TUNNEL_MEDIA_URL_MAX_LENGTH = 2048;

/**
 * Why a durable media URL is ABSENT from an otherwise successful media
 * response. Presence of {@link MEDIA_URL_RESPONSE_HEADER} is the ONLY proof
 * that the cloud library row exists; this header is what separates a serving
 * daemon that tried to persist and failed from one that never advertises
 * durability at all (an older daemon, or a surface that hands persistence to
 * the browser). Without it a consumer cannot tell a dead promise apart from
 * an unsupported one.
 *
 * Deliberately a CLOSED set of coarse categories: no URLs, no credentials,
 * no provider payloads, no byte counts — the value crosses the relay and is
 * shown to a model, so it carries a reason and nothing else.
 */
export const MEDIA_ERROR_RESPONSE_HEADER = "x-openllm-media-error";
export const MEDIA_PERSIST_ERRORS = [
  /** The cloud ingest answered, but not with success. */
  "ingest_rejected",
  /** Transport never reached a usable ingest response. */
  "ingest_unreachable",
  /** Ingest exceeded the daemon's upload budget. */
  "ingest_timeout",
  /** Ingest answered 2xx with a body the daemon could not trust. */
  "ingest_invalid_response",
  /** Persistence failed for an uncategorized reason. */
  "ingest_failed",
] as const;
export type TMediaPersistError = (typeof MEDIA_PERSIST_ERRORS)[number];
export const MediaPersistError = S.Literal(...MEDIA_PERSIST_ERRORS);

const isMediaPersistError = (value: string): value is TMediaPersistError =>
  (MEDIA_PERSIST_ERRORS as ReadonlyArray<string>).includes(value);

/** The ONLY request headers a consumer may forward — a closed struct, not a
 * free map, per the relay's reviewable-vocabulary posture. Everything else
 * (auth, plan params) is the serving daemon's own business.
 *
 * Validated by the SERVING DAEMON at stream open (mux); the relay never
 * decodes it.
 */
export const TunnelForwardHeaders = S.Struct({
  media_persistence: S.optional(S.Literal(MEDIA_PERSISTENCE_BROWSER)),
  content_type: S.optional(TunnelRequestContentType),
  accept: S.optional(TunnelAccept),
  anthropic_version: S.optional(S.String.pipe(S.maxLength(32))),
  anthropic_beta: S.optional(S.String.pipe(S.maxLength(256))),
  user_agent: S.optional(S.String.pipe(S.maxLength(512))),
  /** Opaque video job id for GET retrieve/content mux follow-up. */
  video_id: S.optional(
    S.String.pipe(S.maxLength(256), S.pattern(/^[A-Za-z0-9._-]+$/)),
  ),
});
export type TTunnelForwardHeaders = S.Schema.Type<typeof TunnelForwardHeaders>;

/** Response metadata carried by the mux `res_head` CTRL payload.
 *
 * Validated by the SERVING DAEMON at stream open (mux); the relay never
 * decodes it.
 */
export const TUNNEL_RESOLVED_MODEL_MAX = 256;
export const TUNNEL_CHAIN_MAX = 4096;

export const TunnelResponseHeaders = S.Struct({
  media_url: S.optional(
    S.String.pipe(S.maxLength(TUNNEL_MEDIA_URL_MAX_LENGTH)),
  ),
  media_persistence: S.optional(S.Literal(MEDIA_PERSISTENCE_BROWSER)),
  /** Why `media_url` is absent — see {@link MEDIA_ERROR_RESPONSE_HEADER}. */
  media_error: S.optional(MediaPersistError),
  content_type: S.optional(S.String.pipe(S.maxLength(128))),
  is_sse: S.optional(S.Boolean),
  /** Winning hop id — maps to {@link OPENLLM_RESOLVED_MODEL_HEADER}. */
  resolved_model: S.optional(
    S.String.pipe(S.maxLength(TUNNEL_RESOLVED_MODEL_MAX)),
  ),
  /** Comma-separated attempted hops — maps to {@link OPENLLM_CHAIN_HEADER}. */
  chain: S.optional(S.String.pipe(S.maxLength(TUNNEL_CHAIN_MAX))),
});
export type TTunnelResponseHeaders = S.Schema.Type<
  typeof TunnelResponseHeaders
>;

const boundedOptional = (
  value: string | null,
  max: number,
): string | undefined => {
  if (value === null || value.length === 0 || value.length > max)
    return undefined;
  return value;
};

/** Copy closed mux res_head fields onto an HTTP Headers object. */
export const applyTunnelResponseHeadersToHttp = (
  headers: Headers,
  res: TTunnelResponseHeaders,
): void => {
  if (res.media_url !== undefined) {
    headers.set(MEDIA_URL_RESPONSE_HEADER, res.media_url);
  }
  if (res.media_persistence === MEDIA_PERSISTENCE_BROWSER) {
    headers.set(MEDIA_PERSISTENCE_RESPONSE_HEADER, MEDIA_PERSISTENCE_BROWSER);
  }
  if (res.media_error !== undefined) {
    headers.set(MEDIA_ERROR_RESPONSE_HEADER, res.media_error);
  }
  if (res.content_type !== undefined) {
    headers.set("content-type", res.content_type);
  }
  if (res.resolved_model !== undefined) {
    headers.set(OPENLLM_RESOLVED_MODEL_HEADER, res.resolved_model);
  }
  if (res.chain !== undefined) {
    headers.set(OPENLLM_CHAIN_HEADER, res.chain);
  }
};

/** Project HTTP response headers onto the closed mux res_head struct. */
export const tunnelResponseHeadersFromHttp = (
  headers: Headers,
): TTunnelResponseHeaders => {
  const contentType = headers.get("content-type") ?? undefined;
  const mediaUrl = boundedOptional(
    headers.get(MEDIA_URL_RESPONSE_HEADER),
    TUNNEL_MEDIA_URL_MAX_LENGTH,
  );
  const resolved = boundedOptional(
    headers.get(OPENLLM_RESOLVED_MODEL_HEADER),
    TUNNEL_RESOLVED_MODEL_MAX,
  );
  const chain = boundedOptional(
    headers.get(OPENLLM_CHAIN_HEADER),
    TUNNEL_CHAIN_MAX,
  );
  const mediaError = headers.get(MEDIA_ERROR_RESPONSE_HEADER);
  return {
    ...(mediaUrl === undefined ? {} : { media_url: mediaUrl }),
    ...(mediaError !== null && isMediaPersistError(mediaError)
      ? { media_error: mediaError }
      : {}),
    ...(headers.get(MEDIA_PERSISTENCE_RESPONSE_HEADER) ===
    MEDIA_PERSISTENCE_BROWSER
      ? { media_persistence: MEDIA_PERSISTENCE_BROWSER }
      : {}),
    ...(contentType === undefined
      ? {}
      : { content_type: contentType.slice(0, 128) }),
    is_sse: contentType?.includes("text/event-stream") === true,
    ...(resolved === undefined ? {} : { resolved_model: resolved }),
    ...(chain === undefined ? {} : { chain }),
  };
};

/** Session ids are client-minted url-safe tokens. The url-safe pattern is
 * still required because the id is embedded in the session-host pidfile name
 * (`<id>.pid`); there is no longer a `~/.openllm/sessions/<id>/` workspace.
 *
 * Validated by the SERVING DAEMON at stream open (mux); the relay never
 * decodes it.
 */
export const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
export const SessionId = S.String.pipe(S.pattern(SESSION_ID_PATTERN));
export type TSessionId = S.Schema.Type<typeof SessionId>;

/** Terminal cols/rows on session open + resize (mux). */
export const TerminalDimension = S.Number.pipe(S.int(), S.between(1, 1024));
export type TTerminalDimension = S.Schema.Type<typeof TerminalDimension>;

/** A channel-level admission failure. */
export const ChannelOpenError = S.Literal(
  "daemon_offline",
  "not_capable",
  "unauthorized",
  "channel_exists",
  "overloaded",
);
export type TChannelOpenError = S.Schema.Type<typeof ChannelOpenError>;

/** A channel-level teardown reason. */
export const ChannelCloseReason = S.Literal(
  "done",
  "channel_exists",
  "consumer_gone",
  "daemon_gone",
  "relay_restart",
  "protocol_error",
  "overloaded",
);
export type TChannelCloseReason = S.Schema.Type<typeof ChannelCloseReason>;

/** Consumer-initiated inference stream OPEN payload. */
export const TunnelStreamOpenPayload = S.Struct({
  kind: S.Literal("tunnel"),
  method: S.Literal("POST"),
  surface: TunnelSurface,
  headers: S.optional(TunnelForwardHeaders),
  consumer: S.optional(S.Literal("browser", "daemon")),
});
export type TTunnelStreamOpenPayload = S.Schema.Type<
  typeof TunnelStreamOpenPayload
>;

/** Consumer-initiated PTY stream OPEN payload. */
export const SessionStreamOpenPayload = S.Struct({
  kind: S.Literal("session"),
  session_id: SessionId,
  cli: DeviceSessionCli,
  cols: TerminalDimension,
  rows: TerminalDimension,
  mode: S.Literal("spawn", "attach", "continue"),
  title: S.optional(SessionTitleField),
  /** When true, launch via `openllm -d <client>` for CLIs that support it. */
  dangerous: S.optional(S.Boolean),
  /**
   * Cold-resume a vendor session by id (`spawn` only). The daemon launches
   * the CLI with its native resume flag in the session's recorded cwd.
   * Live OpenLLM PTYs rebind via `mode:"attach"` instead.
   */
  resume_session_id: S.optional(
    S.String.pipe(S.minLength(1), S.maxLength(128)),
  ),
  /**
   * Absolute cwd for spawn/continue. Validated on the daemon (must exist
   * as a directory). Omitted → `$HOME` for new sessions.
   */
  cwd: S.optional(S.String.pipe(S.minLength(1), S.maxLength(1024))),
});
export type TSessionStreamOpenPayload = S.Schema.Type<
  typeof SessionStreamOpenPayload
>;

/** JSON payload of a mux OPEN frame. */
export const StreamOpenPayload = S.Union(
  TunnelStreamOpenPayload,
  SessionStreamOpenPayload,
  RealtimeStreamOpenPayload,
);
export type TStreamOpenPayload = S.Schema.Type<typeof StreamOpenPayload>;

/** JSON payload of a mux CTRL frame. Unknown control tags are intentionally
 * not accepted here so callers can drop them for forward compatibility. */
export const StreamCtrlPayload = S.Union(
  S.Struct({
    t: S.Literal("open_ack"),
    ok: S.Boolean,
    live: S.optional(S.Boolean),
    /** Daemon-minted, monotonically increasing session-open generation. */
    generation: S.optional(S.Number.pipe(S.int(), S.nonNegative())),
    initial_credit: S.optional(S.Number.pipe(S.int(), S.nonNegative())),
    /** Present on nacks (`ok:false`) — same vocabulary as `StreamResetCode`
     * session-open failures (`cli_not_installed`, `session_busy`, …). */
    error: S.optional(S.String.pipe(S.maxLength(64))),
    message: S.optional(S.String.pipe(S.maxLength(256))),
  }),
  S.Struct({
    t: S.Literal("res_head"),
    status: S.Number.pipe(S.int(), S.between(200, 599)),
    res_headers: S.optional(TunnelResponseHeaders),
  }),
  S.Struct({
    t: S.Literal("resize"),
    cols: TerminalDimension,
    rows: TerminalDimension,
  }),
  /** Viewer became the active (focused) consumer — bumps primary election
   * without requiring typed input. Additive + skew-safe: unknown tags are
   * dropped by the parser on older peers. */
  S.Struct({ t: S.Literal("focus") }),
  S.Struct({ t: S.Literal("replay_done") }),
  S.Struct({ t: S.Literal("close"), intent: S.Literal("detach", "kill") }),
  /** Realtime (`kind:"realtime"`) liveness — either peer may send this while
   * NDJSON event traffic is naturally quiet (e.g. waiting on the user).
   * Carries no data; its arrival IS the signal. */
  S.Struct({ t: S.Literal("heartbeat") }),
);
export type TStreamCtrlPayload = S.Schema.Type<typeof StreamCtrlPayload>;

/** Per-stream failure codes. Channel admission errors deliberately do not live
 * here; those use `ChannelOpenError`. */
export const StreamResetCode = S.Literal(
  "tunnel_refused",
  "tunnel_busy",
  "invalid_tunnel",
  "overloaded",
  "pty_unsupported",
  "cli_not_installed",
  "session_not_found",
  "session_busy",
  "spawn_failed",
  "dispatch_failed",
  "timeout",
  "protocol_error",
  "peer_gone",
  /** The consumer fell behind the daemon's bounded session-output queue. */
  "lagging",
  /** Remote PTY sessions are opt-in (default off) and this daemon has them
   * disabled. Terminal — not retryable until the user enables them on the
   * device (`openllmd sessions on`, or reinstall with the toggle on). */
  "sessions_disabled",
  /** This daemon does not (yet) serve `kind:"realtime"` — no provider
   * delegate exposes `credentialForRealtime`, or the runtime path isn't
   * wired. Mirrors `pty_unsupported`. */
  "realtime_unsupported",
  /** Max concurrent realtime sessions reached on this daemon. Mirrors
   * `tunnel_busy` / `session_busy`. */
  "realtime_busy",
  /** Admission refused for a reason OTHER than capacity — no credential
   * available (stale refresh, not logged in), or the vendor connection
   * itself failed before any event was exchanged. Retryable after the
   * underlying cause (e.g. re-login) clears. */
  "realtime_refused",
  /** The cloud's signed plan for this OPEN's `provider`/`model` was missing,
   * unsigned/tampered, unreachable, or did not resolve to exactly that hop —
   * the same account/entitlement gate every other subscription surface
   * (`planSignatureOk`) enforces before a vendor dial. Distinct from
   * `realtime_refused` (a credential-layer failure): this is a POLICY
   * refusal, and it fires before the daemon ever asks its delegate for a
   * credential. Never retryable by simply reconnecting — the caller needs a
   * plan the cloud actually signed for this provider/model. */
  "realtime_policy_refused",
);
export type TStreamResetCode = S.Schema.Type<typeof StreamResetCode>;

/** JSON payload of a mux RESET frame. */
export const StreamResetPayload = S.Struct({
  code: StreamResetCode,
  message: S.optional(S.String.pipe(S.maxLength(256))),
});
export type TStreamResetPayload = S.Schema.Type<typeof StreamResetPayload>;

const parse = <T>(schema: S.Schema<T, T, never>, value: unknown): T | null => {
  const result = S.decodeUnknownEither(schema)(value);
  return Either.isRight(result) ? result.right : null;
};

const hasOnlyKeys = (
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  Object.keys(value).every((key) => keys.includes(key));

/** Decodes an already-parsed mux OPEN JSON value, returning null on failure. */
export const parseStreamOpenPayload = (
  value: unknown,
): TStreamOpenPayload | null => {
  // Allowlist matches StreamOpenPayload union keys (tunnel + session) exactly
  // so the filter and Schema cannot disagree.
  if (
    !hasOnlyKeys(value, [
      "kind",
      "method",
      "surface",
      "headers",
      "consumer",
      "session_id",
      "cli",
      "cols",
      "rows",
      "mode",
      "title",
      "dangerous",
      "resume_session_id",
      "cwd",
      "provider",
      "model",
      "voice",
    ])
  ) {
    return null;
  }
  if (
    "headers" in value &&
    !hasOnlyKeys(value.headers, [
      "content_type",
      "accept",
      "anthropic_version",
      "anthropic_beta",
      "user_agent",
      "media_persistence",
      "video_id",
    ])
  ) {
    return null;
  }
  const open = parse(StreamOpenPayload, value);
  if (open === null || open.kind !== "session") return open;
  if (open.dangerous === true && !supportsDangerousSession(open.cli))
    return null;
  if (open.cli === "shell" && open.resume_session_id !== undefined) return null;
  if (open.resume_session_id !== undefined && open.mode !== "spawn")
    return null;
  if (open.cwd !== undefined && open.mode === "attach") return null;
  return open;
};

/** Decodes an already-parsed mux CTRL JSON value, returning null on failure. */
export const parseStreamCtrlPayload = (
  value: unknown,
): TStreamCtrlPayload | null => parse(StreamCtrlPayload, value);

/** Decodes an already-parsed mux RESET JSON value, returning null on failure. */
export const parseStreamResetPayload = (
  value: unknown,
): TStreamResetPayload | null => parse(StreamResetPayload, value);
