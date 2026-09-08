import { type Either, Schema as S } from "effect";
import type { ParseError } from "effect/ParseResult";
import { sha256Hex } from "./sha256-hex";
import { SubscriptionProviderSlug } from "./subscription-provider";

/**
 * Incremental daemon doctor-report wire contract.
 *
 * Closed allowlists only — never a free-form `properties`/`meta` map, never
 * raw log text, stacks, argv, credentials, account hashes, hostnames, or
 * prompt/completion content. Unknown keys and unknown schema versions fail
 * decode. Per-event `daemon_version` is stamped at observation time and is
 * immutable on the wire.
 */

export const DOCTOR_REPORT_SCHEMA_VERSION = 1 as const;

export const DoctorReportSchemaVersion = S.Literal(
  DOCTOR_REPORT_SCHEMA_VERSION,
);
export type TDoctorReportSchemaVersion = S.Schema.Type<
  typeof DoctorReportSchemaVersion
>;

export const STRICT_DOCTOR_PARSE = {
  errors: "all",
  onExcessProperty: "error",
} as const;

/** UUID or 16–64 lowercase hex. Rejects `sk-llm-`, URLs, and prefixed labels. */
export const DOCTOR_OPAQUE_ID_PATTERN =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{16,64})$/;

export const OpaqueId = S.String.pipe(S.pattern(DOCTOR_OPAQUE_ID_PATTERN));
export type TOpaqueId = S.Schema.Type<typeof OpaqueId>;

export const DOCTOR_SCOPE_HASH_PREFIX = "openllm-doctor-scope-v1" as const;
export const DoctorScopeLabel = S.Literal("origin", "account");
export type TDoctorScopeLabel = S.Schema.Type<typeof DoctorScopeLabel>;

/** Opaque origin/account scope: sha256 hex truncated to 32 chars. */
export const doctorReportingScopeId = (
  label: TDoctorScopeLabel,
  value: string,
): TOpaqueId => {
  const digest = sha256Hex(
    `${DOCTOR_SCOPE_HASH_PREFIX}:${label}:${value}`,
  ).slice(0, 32);
  return S.decodeUnknownSync(OpaqueId)(digest, STRICT_DOCTOR_PARSE);
};

export const opaqueDoctorScope = doctorReportingScopeId;

/** Bare semver, optional prerelease (`2.6.25`, `2.6.25-dev`). No leading `v`. */
export const DOCTOR_VERSION_STAMP_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]{1,32})?$/;

export const VersionStamp = S.String.pipe(
  S.maxLength(64),
  S.pattern(DOCTOR_VERSION_STAMP_PATTERN),
);
export type TVersionStamp = S.Schema.Type<typeof VersionStamp>;

const EpochMs = S.Number.pipe(
  S.finite(),
  S.int(),
  S.greaterThanOrEqualTo(0),
  S.lessThanOrEqualTo(4_102_444_800_000),
);
const FiniteMs = S.Number.pipe(
  S.finite(),
  S.greaterThanOrEqualTo(0),
  S.lessThanOrEqualTo(86_400_000),
);
const FiniteCount = S.Number.pipe(
  S.finite(),
  S.int(),
  S.greaterThanOrEqualTo(0),
  S.lessThanOrEqualTo(1_000_000),
);
const BoundedExitCode = S.Number.pipe(
  S.finite(),
  S.int(),
  S.greaterThanOrEqualTo(-1),
  S.lessThanOrEqualTo(255),
);

export const DoctorDiagnosticCode = S.Literal(
  "native_auth_timeout",
  "refresh_failure",
  "unknown_status_sustained",
  "late_result_discarded",
  "login_watchdog_expiry",
  "login_terminal_failure",
  "cli_install_repeated_failure",
  "session_lost",
  "liveness_degraded",
  "control_channel_unexpected_disconnect",
  "control_channel_protocol_failure",
  "stream_unexpected_failure",
  "stream_hang_watchdog",
  "fatal_process",
);
export type TDoctorDiagnosticCode = S.Schema.Type<typeof DoctorDiagnosticCode>;

export const DoctorProducer = S.Literal(
  "spawn",
  "refresh",
  "status",
  "login_flow",
  "cli_install",
  "cli_version_stamp",
  "auth_session_lost",
  "control_channel",
  "walker",
  "process",
);
export type TDoctorProducer = S.Schema.Type<typeof DoctorProducer>;

export const DoctorTrigger = S.Literal(
  "native_login",
  "capture",
  "refresh",
  "status_poll",
  "login",
  "logout",
  "install",
  "version_probe",
  "session_lost",
  "reconnect",
  "stream",
  "fatal",
  "doctor_manual",
  "proactive_flush",
);
export type TDoctorTrigger = S.Schema.Type<typeof DoctorTrigger>;

export const DoctorOutcome = S.Literal(
  "timeout",
  "failure",
  "cancelled",
  "expired",
  "discarded",
  "degraded",
  "unknown",
  "disconnect",
  "protocol_error",
  "hang",
  "success_context",
);
export type TDoctorOutcome = S.Schema.Type<typeof DoctorOutcome>;

export const DoctorOperation = S.Literal(
  "native_auth",
  "capture",
  "refresh",
  "probe",
  "login",
  "logout",
  "install",
  "stamp",
  "stream",
  "reconnect",
);
export type TDoctorOperation = S.Schema.Type<typeof DoctorOperation>;

export const DoctorErrorClass = S.Literal(
  "timeout",
  "spawn_denied",
  "cli_crash",
  "parse_failure",
  "protocol_failure",
  "transport_dns",
  "transport_connect",
  "transport_tls",
  "upstream_http",
  "watchdog",
  "cancelled",
  "unclassified",
);
export type TDoctorErrorClass = S.Schema.Type<typeof DoctorErrorClass>;

export const DoctorPlatform = S.Literal("darwin", "linux", "win32");
export type TDoctorPlatform = S.Schema.Type<typeof DoctorPlatform>;

export const DoctorArchitecture = S.Literal("arm64", "x64");
export type TDoctorArchitecture = S.Schema.Type<typeof DoctorArchitecture>;

export const DoctorProvider = SubscriptionProviderSlug;
export type TDoctorProvider = S.Schema.Type<typeof DoctorProvider>;

/** Allowlisted finite timings/counts/booleans. All optional; absent ≠ zero. */
export const DoctorEventTimings = S.Struct({
  configured_timeout_ms: S.optional(FiniteMs),
  spawn_elapsed_ms: S.optional(FiniteMs),
  budget_remaining_ms_at_spawn: S.optional(FiniteMs),
  timeout_callback_lateness_ms: S.optional(FiniteMs),
  cleanup_ms: S.optional(FiniteMs),
  elapsed_ms: S.optional(FiniteMs),
  reconnect_episode_ms: S.optional(FiniteMs),
  reconnect_count: S.optional(FiniteCount),
  unknown_probe_streak: S.optional(FiniteCount),
  repeat_count: S.optional(FiniteCount),
  root_exit_code: S.optional(BoundedExitCode),
  stdout_closed: S.optional(S.Boolean),
  stderr_closed: S.optional(S.Boolean),
  root_exited: S.optional(S.Boolean),
});
export type TDoctorEventTimings = S.Schema.Type<typeof DoctorEventTimings>;

export const DoctorCachedHealth = S.Struct({
  connected_providers: FiniteCount,
  degraded_providers: FiniteCount,
  unknown_providers: FiniteCount,
});
export type TDoctorCachedHealth = S.Schema.Type<typeof DoctorCachedHealth>;

export const DoctorReportEvent = S.Struct({
  event_id: OpaqueId,
  observed_at_ms: EpochMs,
  daemon_version: VersionStamp,
  daemon_build_revision: S.optional(
    S.String.pipe(S.pattern(/^[0-9a-f]{7,64}$/)),
  ),
  platform: DoctorPlatform,
  architecture: DoctorArchitecture,
  code: DoctorDiagnosticCode,
  provider: S.optional(DoctorProvider),
  producer: DoctorProducer,
  operation: S.optional(DoctorOperation),
  trigger: DoctorTrigger,
  outcome: DoctorOutcome,
  error_class: S.optional(DoctorErrorClass),
  correlation_id: S.optional(OpaqueId),
  timings: S.optional(DoctorEventTimings),
});
export type TDoctorReportEvent = S.Schema.Type<typeof DoctorReportEvent>;

export const DOCTOR_REPORT_MAX_EVENTS = 32;

export const DoctorReport = S.Struct({
  schema_version: DoctorReportSchemaVersion,
  report_id: OpaqueId,
  emitted_at_ms: EpochMs,
  reporter_cli_version: S.optional(VersionStamp),
  cursor_gap_count: FiniteCount,
  suppressed_event_count: FiniteCount,
  events: S.Array(DoctorReportEvent).pipe(
    S.minItems(1),
    S.maxItems(DOCTOR_REPORT_MAX_EVENTS),
  ),
  health: S.optional(DoctorCachedHealth),
});
export type TDoctorReport = S.Schema.Type<typeof DoctorReport>;

export const DoctorReportAck = S.Struct({
  report_id: OpaqueId,
  accepted_event_ids: S.Array(OpaqueId).pipe(
    S.minItems(1),
    S.maxItems(DOCTOR_REPORT_MAX_EVENTS),
  ),
});
export type TDoctorReportAck = S.Schema.Type<typeof DoctorReportAck>;

export const DoctorReportRejectCode = S.Literal(
  "diagnostics_disabled",
  "unauthorized",
  "invalid",
  "oversize",
  "rate_limited",
  "unavailable",
);
export type TDoctorReportRejectCode = S.Schema.Type<
  typeof DoctorReportRejectCode
>;

export const DoctorReportReject = S.Struct({
  code: DoctorReportRejectCode,
  report_id: S.optional(OpaqueId),
});
export type TDoctorReportReject = S.Schema.Type<typeof DoctorReportReject>;

export const parseDoctorReport = (input: unknown): TDoctorReport =>
  S.decodeUnknownSync(DoctorReport)(input, STRICT_DOCTOR_PARSE);

export const parseDoctorReportEvent = (input: unknown): TDoctorReportEvent =>
  S.decodeUnknownSync(DoctorReportEvent)(input, STRICT_DOCTOR_PARSE);

export const parseDoctorReportAck = (input: unknown): TDoctorReportAck =>
  S.decodeUnknownSync(DoctorReportAck)(input, STRICT_DOCTOR_PARSE);

export const parseDoctorReportReject = (input: unknown): TDoctorReportReject =>
  S.decodeUnknownSync(DoctorReportReject)(input, STRICT_DOCTOR_PARSE);

/** Effect Either success-first: `Either<A, E>` = Right<A> | Left<E>. */
export type TDoctorReportDecode = Either.Either<TDoctorReport, ParseError>;
export type TDoctorReportEventDecode = Either.Either<
  TDoctorReportEvent,
  ParseError
>;

export const decodeDoctorReportEither = (input: unknown): TDoctorReportDecode =>
  S.decodeUnknownEither(DoctorReport)(input, STRICT_DOCTOR_PARSE);

export const decodeDoctorReportEventEither = (
  input: unknown,
): TDoctorReportEventDecode =>
  S.decodeUnknownEither(DoctorReportEvent)(input, STRICT_DOCTOR_PARSE);
