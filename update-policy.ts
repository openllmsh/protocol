/** Shared release replacement policy for the daemon and CLI. */
import {
  compareDaemonSemver,
  isDevDaemonVersion,
  parseDaemonSemver,
} from "./semver";

export type TUpdatePolicyInput = {
  readonly currentVersion: string;
  readonly latestVersion: string | null;
  readonly channel: string | null;
  readonly gatewayOrigin: string;
  readonly gatewayOriginExplicit: boolean;
};

export type TUpdateRouteConfig = Omit<
  TUpdatePolicyInput,
  "currentVersion" | "latestVersion"
>;

export const isPublishedPrerelease = (version: string): boolean =>
  /^v?(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(
    version,
  ) && version.replace(/^v/, "") !== "0.0.0-dev";

export type TUpdateVerdict = {
  readonly allow: boolean;
  /** Short human-readable cause when `allow` is false; null when allowed. */
  readonly reason: string | null;
};

const refuse = (reason: string): TUpdateVerdict => ({ allow: false, reason });
const ALLOWED: TUpdateVerdict = { allow: true, reason: null };

/**
 * The production service origin (`*.openllm.sh`) carries credentialed traffic
 * and is never a candidate-artifact channel: a prerelease→prerelease hop is
 * only trusted from a separately configured candidate gateway.
 */
const isProductionServiceHost = (hostname: string): boolean => {
  const host = hostname.toLowerCase();
  return host === "openllm.sh" || host.endsWith(".openllm.sh");
};

/**
 * True when the route explicitly opts into a candidate artifact channel:
 * a non-empty, non-`stable` `OPENLLM_UPDATE_CHANNEL` AND an explicitly
 * configured gateway that is HTTPS and outside `openllm.sh` (loopback HTTP is
 * a dev gateway, matching `isSecureOrigin`). Any missing, production, or
 * insecure piece fails closed.
 */
const isCandidateArtifactRoute = (input: TUpdatePolicyInput): boolean => {
  const channel = input.channel?.trim() ?? "";
  if (channel.length === 0 || channel.toLowerCase() === "stable") return false;
  if (!input.gatewayOriginExplicit) return false;
  let url: URL;
  try {
    url = new URL(input.gatewayOrigin);
  } catch {
    return false;
  }
  if (url.protocol === "https:") {
    return !isProductionServiceHost(url.hostname);
  }
  return (
    url.protocol === "http:" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1")
  );
};

/**
 * Shared release replacement policy.
 *
 * - `latest` must be strict semver (`2.8.0 ` or other malformed strings are
 *   refused) and never the `0.0.0-dev` source sentinel.
 * - Stable builds converge ONLY on a STRICTLY NEWER published stable — never
 *   a prerelease, and never a downgrade. Republishing an older tag no longer
 *   drags stable installs back: rollback is exclusively the explicit `.prev`
 *   restore path (`boot-guard.ts` / the CLI converger's self-heal).
 * - Prerelease builds may move to a STRICTLY NEWER stable — the supported
 *   path out of a beta (2.8.0-beta.1 → 2.8.0+). Never a downgrade.
 * - Prerelease → newer prerelease requires an explicitly configured
 *   candidate route ({@link isCandidateArtifactRoute}) and the same
 *   `major.minor.patch` release line.
 */
export const evaluateUpdatePolicy = (
  input: TUpdatePolicyInput,
): TUpdateVerdict => {
  const latest = input.latestVersion;
  if (latest === null || latest.trim().length === 0) {
    return refuse("no published version reported by the gateway");
  }
  if (latest !== latest.trim()) {
    return refuse("published version is not strict semver");
  }
  const latestSemver = parseDaemonSemver(latest);
  if (latestSemver === null) {
    return refuse("published version is not strict semver");
  }
  if (isDevDaemonVersion(latest)) {
    return refuse("0.0.0-dev is a source sentinel, not a release");
  }
  const currentSemver = parseDaemonSemver(input.currentVersion);
  const currentIsPrerelease =
    currentSemver !== null &&
    currentSemver.pre !== null &&
    !isDevDaemonVersion(input.currentVersion);
  if (!currentIsPrerelease) {
    if (latestSemver.pre !== null) {
      return refuse("stable builds never take a prerelease");
    }
    // No downgrades on the normal route: the published version must be
    // strictly newer. Equal versions are refused here too — callers
    // short-circuit `current === latest` before the policy check, and the
    // installer reconverge path skips the gate for an equal pin.
    return compareDaemonSemver(input.currentVersion, latest) === -1
      ? ALLOWED
      : refuse(
          "published version is not newer than the installed build (no downgrades)",
        );
  }
  const order = compareDaemonSemver(input.currentVersion, latest);
  if (latestSemver.pre === null) {
    return order === -1
      ? ALLOWED
      : refuse(
          "prerelease builds can only move to a strictly newer stable (no downgrades)",
        );
  }
  if (!isCandidateArtifactRoute(input)) {
    return refuse(
      "prerelease-to-prerelease needs an explicit candidate channel " +
        "(OPENLLM_UPDATE_CHANNEL + an explicitly configured non-openllm.sh HTTPS gateway)",
    );
  }
  if (order !== -1) {
    return refuse("candidate is not newer than the installed prerelease");
  }
  if (
    currentSemver.major !== latestSemver.major ||
    currentSemver.minor !== latestSemver.minor ||
    currentSemver.patch !== latestSemver.patch
  ) {
    return refuse(
      "candidate prerelease is on a different release line — wait for its stable",
    );
  }
  return ALLOWED;
};

export const mayReplaceProductVersion = (input: TUpdatePolicyInput): boolean =>
  evaluateUpdatePolicy(input).allow;

/** Environment variables override shared-file values, including an empty value. */
export const resolveUpdateSetting = (
  environmentValue: string | undefined,
  fileValue: string | undefined,
): string | null => {
  const value = environmentValue ?? fileValue;
  return value === undefined ? null : value;
};
