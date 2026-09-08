import { Schema as S } from "effect";
import {
  DOCTOR_REPORT_SCHEMA_VERSION,
  OpaqueId,
  STRICT_DOCTOR_PARSE,
} from "./doctor-report";

/**
 * Account + bootstrap reporting policy. Default global off. Missing account
 * extra is treated as `false` (no diagnostics). Bootstrap absence on old
 * clouds also means off. Consent generation/expiry are opaque strings/ms.
 */

/** `users.config.extra` key. Omitted on the wire means not set; readers use
 *  {@link daemonDiagnosticsOptInFromExtra} so missing === false. */
export const DAEMON_DIAGNOSTICS_OPT_IN_EXTRA_KEY =
  "daemon_diagnostics_opt_in" as const;

export const DAEMON_DIAGNOSTICS_POLICY_GENERATION_EXTRA_KEY =
  "daemon_diagnostics_policy_generation" as const;

export const DaemonDiagnosticsOptIn = S.Boolean;
export type TDaemonDiagnosticsOptIn = S.Schema.Type<
  typeof DaemonDiagnosticsOptIn
>;

export const daemonDiagnosticsOptInFromExtra = (
  extra: Readonly<Record<string, unknown>> | null | undefined,
): boolean => extra?.[DAEMON_DIAGNOSTICS_OPT_IN_EXTRA_KEY] === true;

/** Cloud preference mutation — narrow so a stale full-config write cannot
 *  restore diagnostics or clobber unrelated extra keys. */
export const DAEMON_DIAGNOSTICS_PREFERENCE_PATH =
  "/api/user/daemon-diagnostics" as const;

export const DAEMON_DOCTOR_REPORTS_PATH = "/api/daemon/doctor-reports" as const;

/**
 * Intake HTTP semantics for POST {@link DAEMON_DOCTOR_REPORTS_PATH}:
 * - 200 + {@link DoctorReportAck} matching `report_id` → checkpoint that batch
 * - 401 unauthorized → stop pending credential recovery; do not native-auth
 * - 403 `diagnostics_disabled` → purge pending, disable until policy refresh
 * - 413 oversize / 422 invalid → quarantine/drop this batch; do not retry forever
 * - 429 → honor Retry-After; keep bounded spool
 * - 503 / timeout → no ack; retry with same IDs within caps
 */

export const DaemonDiagnosticsPreferenceBody = S.Struct({
  daemon_diagnostics_opt_in: S.Boolean,
});
export type TDaemonDiagnosticsPreferenceBody = S.Schema.Type<
  typeof DaemonDiagnosticsPreferenceBody
>;

export const DaemonDiagnosticsPreferenceResponse = S.Struct({
  daemon_diagnostics_opt_in: S.Boolean,
});
export type TDaemonDiagnosticsPreferenceResponse = S.Schema.Type<
  typeof DaemonDiagnosticsPreferenceResponse
>;

export const parseDaemonDiagnosticsPreferenceBody = (
  input: unknown,
): TDaemonDiagnosticsPreferenceBody =>
  S.decodeUnknownSync(DaemonDiagnosticsPreferenceBody)(
    input,
    STRICT_DOCTOR_PARSE,
  );

export const parseDaemonDiagnosticsPreferenceResponse = (
  input: unknown,
): TDaemonDiagnosticsPreferenceResponse =>
  S.decodeUnknownSync(DaemonDiagnosticsPreferenceResponse)(
    input,
    STRICT_DOCTOR_PARSE,
  );

/**
 * Optional bootstrap object. Absent / expired / invalid → no upload.
 * `generation` is an opaque UUID/hex. `expires_at_ms` is policy TTL
 * (see {@link DOCTOR_REPORTING_POLICY_TTL_MS}, 5 min) — not the 30s
 * in-flight upload lease ({@link DOCTOR_REPORT_LEASE_MS}).
 */
export const DaemonReportingPolicy = S.Struct({
  enabled: S.Boolean,
  generation: OpaqueId,
  expires_at_ms: S.Number.pipe(
    S.finite(),
    S.int(),
    S.greaterThanOrEqualTo(0),
    S.lessThanOrEqualTo(4_102_444_800_000),
  ),
  schema_version: S.Literal(DOCTOR_REPORT_SCHEMA_VERSION),
});
export type TDaemonReportingPolicy = S.Schema.Type<
  typeof DaemonReportingPolicy
>;

export const parseDaemonReportingPolicy = (
  input: unknown,
): TDaemonReportingPolicy =>
  S.decodeUnknownSync(DaemonReportingPolicy)(input, STRICT_DOCTOR_PARSE);

export const reportingPolicyAllowsUpload = (
  policy: TDaemonReportingPolicy | null | undefined,
  nowMs: number,
): boolean =>
  policy !== null &&
  policy !== undefined &&
  policy.enabled === true &&
  policy.schema_version === DOCTOR_REPORT_SCHEMA_VERSION &&
  nowMs < policy.expires_at_ms;

export const DOCTOR_REPORT_MAX_BODY_BYTES = 64 * 1024;
export const DOCTOR_REPORT_MAX_SPOOL_BYTES = 256 * 1024;
export const DOCTOR_REPORT_PENDING_TTL_MS = 24 * 60 * 60 * 1000;
export const DOCTOR_REPORT_DEBOUNCE_MS = 30_000;
export const DOCTOR_REPORT_MAX_BACKOFF_MS = 60 * 60 * 1000;
export const DOCTOR_REPORT_MAX_IN_FLIGHT = 1;
/** One in-flight upload lock TTL. Not bootstrap policy expiry. */
export const DOCTOR_REPORT_LEASE_MS = 30_000;
/** Cloud should stamp `reporting_policy.expires_at_ms` ≈ now + this. */
export const DOCTOR_REPORTING_POLICY_TTL_MS = 5 * 60 * 1000;
