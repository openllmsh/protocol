/**
 * Binary mux payload vocabulary.
 *
 * Binary mux frames are deliberately outside `RelayFrame`: the relay routes on
 * the 9-byte header (defined by `@openllmsh/tunnel/codec`) and never imports
 * these payload schemas. D2 permits one active mux channel per underlying
 * WebSocket, so socket identity selects the channel.
 */
import { Either, Schema as S } from "effect";

/** Capability advertising support for the binary mux wire format. */
export const MUX_CAP = "mux1";

/** Returns whether an open-vocabulary capability list advertises mux support. */
export const hasMuxCap = (caps: readonly string[] | undefined): boolean =>
  caps?.includes(MUX_CAP) ?? false;

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
 * Validated by the SERVING DAEMON at stream open (mux) and referenced by the
 * legacy frames (splice); the relay never decodes either.
 */
export const TunnelSurface = S.Literal(
  "chat_completions",
  "messages",
  "responses",
  "responses_compact",
);
export type TTunnelSurface = S.Schema.Type<typeof TunnelSurface>;

/** The ONLY request headers a consumer may forward — a closed struct, not a
 * free map, per the relay's reviewable-vocabulary posture. Everything else
 * (auth, plan params) is the serving daemon's own business.
 *
 * Validated by the SERVING DAEMON at stream open (mux) and referenced by the
 * legacy frames (splice); the relay never decodes either.
 */
export const TunnelForwardHeaders = S.Struct({
  content_type: S.optional(S.Literal("application/json")),
  accept: S.optional(S.Literal("application/json", "text/event-stream")),
  anthropic_version: S.optional(S.String.pipe(S.maxLength(32))),
  anthropic_beta: S.optional(S.String.pipe(S.maxLength(256))),
});
export type TTunnelForwardHeaders = S.Schema.Type<typeof TunnelForwardHeaders>;

/** Response metadata carried by the mux `res_head` CTRL payload.
 *
 * Validated by the SERVING DAEMON at stream open (mux) and referenced by the
 * legacy frames (splice); the relay never decodes either.
 */
export const TunnelResponseHeaders = S.Struct({
  content_type: S.optional(S.String.pipe(S.maxLength(128))),
  is_sse: S.optional(S.Boolean),
});
export type TTunnelResponseHeaders = S.Schema.Type<
  typeof TunnelResponseHeaders
>;

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

/** JSON payload of a mux OPEN frame. */
export const StreamOpenPayload = TunnelStreamOpenPayload;
export type TStreamOpenPayload = S.Schema.Type<typeof StreamOpenPayload>;

/** JSON payload of a mux CTRL frame. Unknown control tags are intentionally
 * not accepted here so callers can drop them for forward compatibility. */
export const StreamCtrlPayload = S.Union(
  S.Struct({
    t: S.Literal("open_ack"),
    ok: S.Boolean,
    initial_credit: S.optional(S.Number),
  }),
  S.Struct({
    t: S.Literal("res_head"),
    status: S.Number,
    res_headers: S.optional(TunnelResponseHeaders),
  }),
);
export type TStreamCtrlPayload = S.Schema.Type<typeof StreamCtrlPayload>;

/** Per-stream failure codes. Channel admission errors deliberately do not live
 * here; those use `ChannelOpenError`. */
export const StreamResetCode = S.Literal(
  "tunnel_refused",
  "tunnel_busy",
  "invalid_tunnel",
  "overloaded",
  "dispatch_failed",
  "timeout",
  "protocol_error",
  "peer_gone",
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
    ])
  ) {
    return null;
  }
  return parse(StreamOpenPayload, value);
};

/** Decodes an already-parsed mux CTRL JSON value, returning null on failure. */
export const parseStreamCtrlPayload = (
  value: unknown,
): TStreamCtrlPayload | null => parse(StreamCtrlPayload, value);

/** Decodes an already-parsed mux RESET JSON value, returning null on failure. */
export const parseStreamResetPayload = (
  value: unknown,
): TStreamResetPayload | null => parse(StreamResetPayload, value);
