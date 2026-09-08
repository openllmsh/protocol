import { Schema as S } from "effect";
import {
  DOCTOR_OPAQUE_ID_PATTERN,
  DOCTOR_REPORT_MAX_EVENTS,
  DOCTOR_REPORT_SCHEMA_VERSION,
  DOCTOR_SCOPE_HASH_PREFIX,
  DOCTOR_VERSION_STAMP_PATTERN,
  OpaqueId,
  STRICT_DOCTOR_PARSE,
  VersionStamp,
} from "./doctor-report";
import {
  DAEMON_DIAGNOSTICS_OPT_IN_EXTRA_KEY,
  DAEMON_DIAGNOSTICS_POLICY_GENERATION_EXTRA_KEY,
  DAEMON_DIAGNOSTICS_PREFERENCE_PATH,
  DAEMON_DOCTOR_REPORTS_PATH,
  DOCTOR_REPORT_DEBOUNCE_MS,
  DOCTOR_REPORT_LEASE_MS,
  DOCTOR_REPORT_MAX_BACKOFF_MS,
  DOCTOR_REPORT_MAX_BODY_BYTES,
  DOCTOR_REPORT_MAX_IN_FLIGHT,
  DOCTOR_REPORT_MAX_SPOOL_BYTES,
  DOCTOR_REPORT_PENDING_TTL_MS,
  DOCTOR_REPORTING_POLICY_TTL_MS,
} from "./doctor-report-policy";

/**
 * CLI-only localhost control surface for doctor reporting. Not a browser
 * loopback API. Paths, capability filename and local opt-out filename are
 * constants so the CLI generator can emit them without duplicating schemas.
 */

export const DOCTOR_LOCAL_REPORT_PATH = "/doctor/report" as const;
export const DOCTOR_LOCAL_STATUS_PATH = "/doctor/reporting-status" as const;
export const DOCTOR_LOCAL_PREFERENCE_PATH = "/doctor/local-preference" as const;

/** Owner-only capability file basename under the install data dir. */
export const DOCTOR_LOCAL_CAPABILITY_FILENAME =
  "doctor-report.capability" as const;

/** HTTP header the CLI presents from the capability file (not a cookie). */
export const DOCTOR_LOCAL_CAPABILITY_HEADER =
  "x-openllm-doctor-capability" as const;

/** Shared local opt-out / pending-sync record basename. */
export const DOCTOR_LOCAL_OPT_OUT_FILENAME =
  "doctor-report.local.json" as const;

export const DoctorLocalReportRequest = S.Struct({
  dry_run: S.optionalWith(S.Boolean, { default: () => false }),
  reporter_cli_version: S.optional(VersionStamp),
});
export type TDoctorLocalReportRequest = S.Schema.Type<
  typeof DoctorLocalReportRequest
>;

export const DoctorLocalUnavailableReason = S.Literal(
  "daemon_stopped",
  "upgrade_required",
  "capability_missing",
);
export type TDoctorLocalUnavailableReason = S.Schema.Type<
  typeof DoctorLocalUnavailableReason
>;

export const DoctorLocalReportResult = S.Struct({
  nothing_new: S.Boolean,
  dry_run: S.Boolean,
  report_id: S.optional(OpaqueId),
  accepted_count: S.Number.pipe(S.finite(), S.int(), S.greaterThanOrEqualTo(0)),
  skipped_count: S.Number.pipe(S.finite(), S.int(), S.greaterThanOrEqualTo(0)),
  gap_count: S.Number.pipe(S.finite(), S.int(), S.greaterThanOrEqualTo(0)),
  legacy_records_skipped: S.Number.pipe(
    S.finite(),
    S.int(),
    S.greaterThanOrEqualTo(0),
  ),
  daemon_versions: S.Array(VersionStamp).pipe(S.maxItems(16)),
  pending: S.Boolean,
  unavailable_reason: S.optional(DoctorLocalUnavailableReason),
});
export type TDoctorLocalReportResult = S.Schema.Type<
  typeof DoctorLocalReportResult
>;

export const DoctorLocalPreference = S.Struct({
  enabled: S.Boolean,
  pending_account_sync: S.Boolean,
  /** Hash/UUID of the configured origin — never a URL. */
  origin_scope: S.optional(OpaqueId),
  /** Hash/UUID of the account/key — never a credential. */
  account_scope: S.optional(OpaqueId),
  /** Consent generation fence (UUID/hex). */
  generation: S.optional(OpaqueId),
});
export type TDoctorLocalPreference = S.Schema.Type<
  typeof DoctorLocalPreference
>;

export const DoctorReportingStatus = S.Struct({
  local_enabled: S.Boolean,
  account_enabled: S.Boolean,
  pending_account_sync: S.Boolean,
  last_acknowledged_report_id: S.optional(OpaqueId),
  daemon_version: S.optional(VersionStamp),
  unavailable_reason: S.optional(DoctorLocalUnavailableReason),
});
export type TDoctorReportingStatus = S.Schema.Type<
  typeof DoctorReportingStatus
>;

export const parseDoctorLocalReportRequest = (
  input: unknown,
): TDoctorLocalReportRequest =>
  S.decodeUnknownSync(DoctorLocalReportRequest)(input, STRICT_DOCTOR_PARSE);

export const parseDoctorLocalReportResult = (
  input: unknown,
): TDoctorLocalReportResult =>
  S.decodeUnknownSync(DoctorLocalReportResult)(input, STRICT_DOCTOR_PARSE);

export const parseDoctorLocalPreference = (
  input: unknown,
): TDoctorLocalPreference =>
  S.decodeUnknownSync(DoctorLocalPreference)(input, STRICT_DOCTOR_PARSE);

export const parseDoctorReportingStatus = (
  input: unknown,
): TDoctorReportingStatus =>
  S.decodeUnknownSync(DoctorReportingStatus)(input, STRICT_DOCTOR_PARSE);

/**
 * Flat constants the CLI generator copies into a committed artifact.
 * Do not hand-duplicate these in CLI source.
 */
export const DOCTOR_REPORT_CLI_CONSTANTS = {
  schemaVersion: DOCTOR_REPORT_SCHEMA_VERSION,
  extraKey: DAEMON_DIAGNOSTICS_OPT_IN_EXTRA_KEY,
  policyGenerationExtraKey: DAEMON_DIAGNOSTICS_POLICY_GENERATION_EXTRA_KEY,
  cloudReportsPath: DAEMON_DOCTOR_REPORTS_PATH,
  cloudPreferencePath: DAEMON_DIAGNOSTICS_PREFERENCE_PATH,
  localReportPath: DOCTOR_LOCAL_REPORT_PATH,
  localStatusPath: DOCTOR_LOCAL_STATUS_PATH,
  localPreferencePath: DOCTOR_LOCAL_PREFERENCE_PATH,
  capabilityFilename: DOCTOR_LOCAL_CAPABILITY_FILENAME,
  capabilityHeader: DOCTOR_LOCAL_CAPABILITY_HEADER,
  localOptOutFilename: DOCTOR_LOCAL_OPT_OUT_FILENAME,
  maxEvents: DOCTOR_REPORT_MAX_EVENTS,
  maxBodyBytes: DOCTOR_REPORT_MAX_BODY_BYTES,
  maxSpoolBytes: DOCTOR_REPORT_MAX_SPOOL_BYTES,
  pendingTtlMs: DOCTOR_REPORT_PENDING_TTL_MS,
  debounceMs: DOCTOR_REPORT_DEBOUNCE_MS,
  maxBackoffMs: DOCTOR_REPORT_MAX_BACKOFF_MS,
  maxInFlight: DOCTOR_REPORT_MAX_IN_FLIGHT,
  leaseMs: DOCTOR_REPORT_LEASE_MS,
  reportingPolicyTtlMs: DOCTOR_REPORTING_POLICY_TTL_MS,
  scopeHashPrefix: DOCTOR_SCOPE_HASH_PREFIX,
} as const;

export type TDoctorReportCliConstants = typeof DOCTOR_REPORT_CLI_CONSTANTS;

/** Render the committed CLI artifact. Generator-only; CLI runtime stays
 *  workspace-free by checking in the output later. */
export const renderDoctorReportCliArtifact = (): string =>
  `// AUTOGENERATED from protocol doctor-report contracts — DO NOT EDIT BY HAND.
// Regenerate via packages/protocol/doctor-report-local.ts#renderDoctorReportCliArtifact
// (packages/cli/scripts/generate-sdk.ts should call this when CLI wiring lands).

import { createHash } from "node:crypto";

export const DOCTOR_REPORT_CLI_CONSTANTS = ${JSON.stringify(
    DOCTOR_REPORT_CLI_CONSTANTS,
    null,
    2,
  )} as const;

export type TDoctorReportCliConstants = typeof DOCTOR_REPORT_CLI_CONSTANTS;

export const opaqueDoctorScope = (
  label: "origin" | "account",
  value: string,
): string =>
  createHash("sha256")
    .update(\`\${DOCTOR_REPORT_CLI_CONSTANTS.scopeHashPrefix}:\${label}:\${value}\`)
    .digest("hex")
    .slice(0, 32);

export const DOCTOR_OPAQUE_ID_PATTERN = /${DOCTOR_OPAQUE_ID_PATTERN.source}/;
const OPAQUE_ID = DOCTOR_OPAQUE_ID_PATTERN;
const VERSION_STAMP = /${DOCTOR_VERSION_STAMP_PATTERN.source}/;
const UNAVAILABLE = ${JSON.stringify([
    "daemon_stopped",
    "upgrade_required",
    "capability_missing",
  ])} as const;

export type TDoctorLocalUnavailableReason = (typeof UNAVAILABLE)[number];

export type TDoctorLocalReportResult = {
  readonly nothing_new: boolean;
  readonly dry_run: boolean;
  readonly report_id?: string;
  readonly accepted_count: number;
  readonly skipped_count: number;
  readonly gap_count: number;
  readonly legacy_records_skipped: number;
  readonly daemon_versions: readonly string[];
  readonly pending: boolean;
  readonly unavailable_reason?: TDoctorLocalUnavailableReason;
};

export type TDoctorReportingStatus = {
  readonly local_enabled: boolean;
  readonly account_enabled: boolean;
  readonly pending_account_sync: boolean;
  readonly last_acknowledged_report_id?: string;
  readonly daemon_version?: string;
  readonly unavailable_reason?: TDoctorLocalUnavailableReason;
};

const fail = (message: string): never => {
  throw new Error(message);
};

const isRecord = (input: unknown): input is Record<string, unknown> =>
  typeof input === "object" && input !== null && !Array.isArray(input);

const bool = (input: Record<string, unknown>, key: string): boolean => {
  const value = input[key];
  return typeof value === "boolean" ? value : fail(\`invalid \${key}\`);
};

const nonNegInt = (input: Record<string, unknown>, key: string): number => {
  const value = input[key];
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : fail(\`invalid \${key}\`);
};

const optionalOpaque = (
  input: Record<string, unknown>,
  key: string,
): string | undefined => {
  const value = input[key];
  if (value === undefined) return undefined;
  return typeof value === "string" && OPAQUE_ID.test(value)
    ? value
    : fail(\`invalid \${key}\`);
};

const optionalVersion = (
  input: Record<string, unknown>,
  key: string,
): string | undefined => {
  const value = input[key];
  if (value === undefined) return undefined;
  return typeof value === "string" && VERSION_STAMP.test(value)
    ? value
    : fail(\`invalid \${key}\`);
};

const optionalUnavailable = (
  input: Record<string, unknown>,
): TDoctorLocalUnavailableReason | undefined => {
  const value = input.unavailable_reason;
  if (value === undefined) return undefined;
  return typeof value === "string" &&
    (UNAVAILABLE as readonly string[]).includes(value)
    ? (value as TDoctorLocalUnavailableReason)
    : fail("invalid unavailable_reason");
};

export const parseDoctorLocalReportResult = (
  input: unknown,
): TDoctorLocalReportResult => {
  if (!isRecord(input)) {
    return fail("invalid doctor local report result");
  }
  const record: Record<string, unknown> = input;
  const versions: unknown = record.daemon_versions;
  if (!Array.isArray(versions) || versions.length > 16) {
    return fail("invalid daemon_versions");
  }
  const daemonVersions: string[] = [];
  for (const item of versions) {
    const version: unknown = item;
    if (typeof version !== "string" || !VERSION_STAMP.test(version)) {
      return fail("invalid daemon_versions");
    }
    daemonVersions.push(version);
  }
  return {
    nothing_new: bool(record, "nothing_new"),
    dry_run: bool(record, "dry_run"),
    report_id: optionalOpaque(record, "report_id"),
    accepted_count: nonNegInt(record, "accepted_count"),
    skipped_count: nonNegInt(record, "skipped_count"),
    gap_count: nonNegInt(record, "gap_count"),
    legacy_records_skipped: nonNegInt(record, "legacy_records_skipped"),
    daemon_versions: daemonVersions,
    pending: bool(record, "pending"),
    unavailable_reason: optionalUnavailable(record),
  };
};

export const parseDoctorReportingStatus = (
  input: unknown,
): TDoctorReportingStatus => {
  if (!isRecord(input)) {
    return fail("invalid doctor reporting status");
  }
  const record: Record<string, unknown> = input;
  return {
    local_enabled: bool(record, "local_enabled"),
    account_enabled: bool(record, "account_enabled"),
    pending_account_sync: bool(record, "pending_account_sync"),
    last_acknowledged_report_id: optionalOpaque(
      record,
      "last_acknowledged_report_id",
    ),
    daemon_version: optionalVersion(record, "daemon_version"),
    unavailable_reason: optionalUnavailable(record),
  };
};

export const parseDoctorLocalReportResultCli = parseDoctorLocalReportResult;
export const parseDoctorReportingStatusCli = parseDoctorReportingStatus;
`.replace(/\s+$/u, "\n");
