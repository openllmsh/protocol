import type { Either } from "effect";
import { Schema as S } from "effect";
import type { ParseError } from "effect/ParseResult";
import type {
  TDaemonProviderObservation,
  TDaemonProviderReasonCode,
} from "./provider-status";
import {
  DaemonProviderObservation,
  DaemonProviderReasonCode,
} from "./provider-status";
import { ReplaySessionId } from "./replay-session";
import { sha256Hex } from "./sha256-hex";
import type { TSubscriptionProviderSlug } from "./subscription-provider";
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

export const DOCTOR_REPORT_SCHEMA_VERSION = 3 as const;

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

export const DOCTOR_EPOCH_MS_MAX = 4_102_444_800_000;

export const EpochMs = S.Number.pipe(
  S.finite(),
  S.int(),
  S.greaterThanOrEqualTo(0),
  S.lessThanOrEqualTo(DOCTOR_EPOCH_MS_MAX),
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

export const DoctorPlatform = S.Literal("darwin", "linux", "win32");
export type TDoctorPlatform = S.Schema.Type<typeof DoctorPlatform>;

export const DoctorArchitecture = S.Literal("arm64", "x64");
export type TDoctorArchitecture = S.Schema.Type<typeof DoctorArchitecture>;

export const DoctorSeverity = S.Literal("info", "warn", "error");
export type TDoctorSeverity = S.Schema.Type<typeof DoctorSeverity>;

export const DOCTOR_SCOPE_FALLBACK = "daemon" as const;

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

/**
 * Closed auth-lifecycle ledger. Optional on schema 3 so a report that omits
 * them still parses. A *strict* schema-3 origin that does not yet list these
 * keys still rejects them (`onExcessProperty: error`) — uploaders must strip
 * on 422 rather than treating keep-v3 as fully backward compatible.
 */
export const DoctorAuthOperationKind = S.Literal(
  "login",
  "logout",
  "verify",
  "status_probe",
  "status_publish",
);
export type TDoctorAuthOperationKind = S.Schema.Type<
  typeof DoctorAuthOperationKind
>;

export const DoctorAuthPhase = S.Literal(
  "readiness_wait",
  "readiness",
  "start",
  "child_wait",
  "child",
  "prep_wait",
  "prep",
  "verify_wait",
  "verify",
  "terminal",
);
export type TDoctorAuthPhase = S.Schema.Type<typeof DoctorAuthPhase>;

export const DoctorAuthOutcome = S.Literal(
  "succeeded",
  "failed",
  "cancelled",
  "abandoned",
  "timeout",
  "unknown",
);
export type TDoctorAuthOutcome = S.Schema.Type<typeof DoctorAuthOutcome>;

const DoctorStatusSeq = S.Number.pipe(
  S.finite(),
  S.int(),
  S.greaterThanOrEqualTo(0),
  S.lessThanOrEqualTo(1_000_000_000),
);

export const DOCTOR_OUTCOME_LEDGER_KEYS = [
  "provider",
  "operation_kind",
  "phase",
  "outcome",
  "observation",
  "reason_code",
  "status_seq",
] as const;

export type TDoctorOutcomeLedger = {
  readonly provider?: TSubscriptionProviderSlug;
  readonly operation_kind?: TDoctorAuthOperationKind;
  readonly phase?: TDoctorAuthPhase;
  readonly outcome?: TDoctorAuthOutcome;
  readonly observation?: TDaemonProviderObservation;
  readonly reason_code?: TDaemonProviderReasonCode;
  readonly status_seq?: number;
};

const decodeOptionalLiteral = <A>(
  schema: S.Schema<A, A>,
  value: unknown,
): A | undefined => {
  if (value === undefined) return undefined;
  try {
    return S.decodeUnknownSync(schema)(value, STRICT_DOCTOR_PARSE);
  } catch {
    return undefined;
  }
};

/** Producer-side projection: invalid enums are omitted, the event is kept. */
export const projectDoctorOutcomeLedger = (
  input: unknown,
): TDoctorOutcomeLedger => {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return {};
  }
  const raw = input as Record<string, unknown>;
  const ledger: {
    provider?: TSubscriptionProviderSlug;
    operation_kind?: TDoctorAuthOperationKind;
    phase?: TDoctorAuthPhase;
    outcome?: TDoctorAuthOutcome;
    observation?: TDaemonProviderObservation;
    reason_code?: TDaemonProviderReasonCode;
    status_seq?: number;
  } = {};
  const provider = decodeOptionalLiteral(
    SubscriptionProviderSlug,
    raw.provider,
  );
  if (provider !== undefined) ledger.provider = provider;
  const operation_kind = decodeOptionalLiteral(
    DoctorAuthOperationKind,
    raw.operation_kind,
  );
  if (operation_kind !== undefined) ledger.operation_kind = operation_kind;
  const phase = decodeOptionalLiteral(DoctorAuthPhase, raw.phase);
  if (phase !== undefined) ledger.phase = phase;
  const outcome = decodeOptionalLiteral(DoctorAuthOutcome, raw.outcome);
  if (outcome !== undefined) ledger.outcome = outcome;
  const observation = decodeOptionalLiteral(
    DaemonProviderObservation,
    raw.observation,
  );
  if (observation !== undefined) ledger.observation = observation;
  const reason_code = decodeOptionalLiteral(
    DaemonProviderReasonCode,
    raw.reason_code,
  );
  if (reason_code !== undefined) ledger.reason_code = reason_code;
  if (raw.status_seq !== undefined) {
    try {
      ledger.status_seq = S.decodeUnknownSync(DoctorStatusSeq)(
        raw.status_seq,
        STRICT_DOCTOR_PARSE,
      );
    } catch {
      /* omit */
    }
  }
  return ledger;
};

export const doctorEventHasOutcomeLedger = (
  event: TDoctorOutcomeLedger,
): boolean =>
  DOCTOR_OUTCOME_LEDGER_KEYS.some((key) => event[key] !== undefined);

export const stripDoctorOutcomeLedger = (report: {
  readonly events: ReadonlyArray<TDoctorReportEvent>;
  readonly schema_version: TDoctorReportSchemaVersion;
  readonly report_id: TOpaqueId;
  readonly emitted_at_ms: number;
  readonly reporter_cli_version?: TVersionStamp;
  readonly cursor_gap_count: number;
  readonly suppressed_event_count: number;
  readonly health?: TDoctorCachedHealth;
}): TDoctorReport => {
  const events = report.events.map((event) => {
    const next: Record<string, unknown> = { ...event };
    for (const key of DOCTOR_OUTCOME_LEDGER_KEYS) {
      delete next[key];
    }
    return next as TDoctorReportEvent;
  });
  return {
    schema_version: report.schema_version,
    report_id: report.report_id,
    emitted_at_ms: report.emitted_at_ms,
    ...(report.reporter_cli_version !== undefined
      ? { reporter_cli_version: report.reporter_cli_version }
      : {}),
    cursor_gap_count: report.cursor_gap_count,
    suppressed_event_count: report.suppressed_event_count,
    events,
    ...(report.health !== undefined ? { health: report.health } : {}),
  };
};

const BuildRevision = S.String.pipe(S.pattern(/^[0-9a-f]{7,64}$/));

export const DoctorReportEvent = S.Struct({
  event_id: OpaqueId,
  observed_at_ms: EpochMs,
  daemon_version: VersionStamp,
  daemon_build_revision: S.optional(BuildRevision),
  platform: DoctorPlatform,
  architecture: DoctorArchitecture,
  severity: DoctorSeverity,
  scope: S.String.pipe(S.maxLength(32), S.minLength(1)),
  message: S.String.pipe(S.maxLength(240), S.minLength(1)),
  correlation_id: S.optional(OpaqueId),
  replay_session_id: S.optional(ReplaySessionId),
  timings: S.optional(DoctorEventTimings),
  provider: S.optional(SubscriptionProviderSlug),
  operation_kind: S.optional(DoctorAuthOperationKind),
  phase: S.optional(DoctorAuthPhase),
  outcome: S.optional(DoctorAuthOutcome),
  observation: S.optional(DaemonProviderObservation),
  reason_code: S.optional(DaemonProviderReasonCode),
  status_seq: S.optional(DoctorStatusSeq),
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

const doctorMessageFallback = (severity: TDoctorSeverity): string => {
  if (severity === "error") return "Daemon error.";
  if (severity === "warn") return "Daemon warning.";
  return "Daemon notice.";
};

/** Defense in depth for log scope. No catalog — invalid values fall back. */
export const sanitizeDoctorScope = (scope: unknown): string => {
  if (typeof scope !== "string" || scope.length === 0 || scope.length > 32) {
    return DOCTOR_SCOPE_FALLBACK;
  }
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(scope)) {
    return DOCTOR_SCOPE_FALLBACK;
  }
  if (
    /\b(?:password|secret|token|bearer|cookie|authorization|credential)\b/i.test(
      scope,
    )
  ) {
    return DOCTOR_SCOPE_FALLBACK;
  }
  return scope;
};

/** Defense in depth for wire messages, not a grant of trust to runtime prose. */
export const sanitizeDoctorMessage = (
  message: unknown,
  severity: TDoctorSeverity,
): string => {
  const fallback = doctorMessageFallback(severity);
  if (
    typeof message !== "string" ||
    message.length === 0 ||
    message.length > 240
  )
    return fallback;
  if (!/^[A-Za-z][A-Za-z :;_,.'!?()-]*$/.test(message)) return fallback;
  if (/\b[A-Za-z_-]+\.[A-Za-z]{2,}\b/.test(message)) return fallback;
  if (
    /\b(?:password|secret|token|bearer|cookie|authorization|credential value|login code|device code)\b/i.test(
      message,
    )
  )
    return fallback;
  if (message.split(/[^A-Za-z]+/).some((word) => word.length > 24))
    return fallback;
  return message;
};

export const projectDoctorTimings = (
  input: unknown,
): TDoctorEventTimings | undefined => {
  if (typeof input !== "object" || input === null || Array.isArray(input))
    return undefined;
  const result: Record<string, number | boolean> = {};
  for (const key of Object.keys(DoctorEventTimings.fields)) {
    try {
      const value = (input as Record<string, unknown>)[key];
      if (value === undefined) continue;
      const decoded = S.decodeUnknownSync(DoctorEventTimings)(
        { [key]: value },
        STRICT_DOCTOR_PARSE,
      );
      Object.assign(result, decoded);
    } catch {
      /* Optional measurement failure must not remove an incident. */
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
};

/** Normalize only optional measurements and message text; excess keys still fail. */
const prepareEvent = (input: unknown): unknown => {
  if (typeof input !== "object" || input === null || Array.isArray(input))
    return input;
  const event = input as Record<string, unknown>;
  const next = { ...event };
  if (
    (event.severity === "info" ||
      event.severity === "warn" ||
      event.severity === "error") &&
    typeof event.message === "string"
  ) {
    next.message = sanitizeDoctorMessage(event.message, event.severity);
  }
  if (Object.hasOwn(event, "scope")) {
    next.scope = sanitizeDoctorScope(event.scope);
  }
  if (
    typeof event.timings === "object" &&
    event.timings !== null &&
    !Array.isArray(event.timings)
  ) {
    // Keep excess keys for strict validation, but drop malformed known values individually.
    const extras = Object.fromEntries(
      Object.entries(event.timings).filter(
        ([key]) => !Object.hasOwn(DoctorEventTimings.fields, key),
      ),
    );
    next.timings = { ...extras, ...projectDoctorTimings(event.timings) };
  } else if (event.timings !== undefined) {
    delete next.timings;
  }
  if (
    event.correlation_id !== undefined &&
    !S.is(OpaqueId)(event.correlation_id)
  )
    delete next.correlation_id;
  if (
    event.daemon_build_revision !== undefined &&
    !S.is(BuildRevision)(event.daemon_build_revision)
  )
    delete next.daemon_build_revision;
  return next;
};
const prepareReport = (input: unknown): unknown => {
  if (typeof input !== "object" || input === null || Array.isArray(input))
    return input;
  const report = input as Record<string, unknown>;
  return Array.isArray(report.events)
    ? { ...report, events: report.events.map(prepareEvent) }
    : input;
};
export const parseDoctorReport = (input: unknown): TDoctorReport =>
  S.decodeUnknownSync(DoctorReport)(prepareReport(input), STRICT_DOCTOR_PARSE);
export const parseDoctorReportEvent = (input: unknown): TDoctorReportEvent =>
  S.decodeUnknownSync(DoctorReportEvent)(
    prepareEvent(input),
    STRICT_DOCTOR_PARSE,
  );

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
  S.decodeUnknownEither(DoctorReport)(
    prepareReport(input),
    STRICT_DOCTOR_PARSE,
  );
export const decodeDoctorReportEventEither = (
  input: unknown,
): TDoctorReportEventDecode =>
  S.decodeUnknownEither(DoctorReportEvent)(
    prepareEvent(input),
    STRICT_DOCTOR_PARSE,
  );
