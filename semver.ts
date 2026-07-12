/**
 * Semver comparison for vendor CLI versions reported by the daemon.
 *
 * Versions arrive as whatever the CLI prints (`codex-cli 0.142.0`), so the
 * x.y.z is extracted rather than assumed to be the whole string. Shared by
 * the cloud (model-cache write guard), the dashboard (update notices), and
 * the daemon — providers can gate model visibility by client version
 * (Codex does), so version comparison is protocol-level, not app-local.
 */

/**
 * The bare `x.y.z` inside whatever the CLI (or a GitHub release tag) prints —
 * `codex-cli 0.142.0`, `v0.142.0`. Null when there is no semver to find, or
 * the input isn't a string (a release tag arrives as `unknown` from JSON).
 */
export const extractSemver = (version: unknown): string | null => {
  if (typeof version !== "string") return null;
  return version.match(/\d+\.\d+\.\d+/)?.[0] ?? null;
};

const parseSemver = (version: string): readonly number[] | null => {
  const match = extractSemver(version);
  if (match === null) return null;
  return match.split(".").map((part) => Number.parseInt(part, 10));
};

/** `-1` / `0` / `1`, or null when either side carries no parseable semver. */
export const compareSemver = (left: string, right: string): number | null => {
  const leftParts = parseSemver(left);
  const rightParts = parseSemver(right);
  if (leftParts === null || rightParts === null) return null;
  const length = Math.max(leftParts.length, rightParts.length);
  for (let i = 0; i < length; i += 1) {
    const leftPart = leftParts[i] ?? 0;
    const rightPart = rightParts[i] ?? 0;
    if (leftPart < rightPart) return -1;
    if (leftPart > rightPart) return 1;
  }
  return 0;
};

/** True only when both parse AND `current` is strictly behind `latest`. */
export const isOlderSemver = (current: string, latest: string): boolean =>
  compareSemver(current, latest) === -1;

/**
 * True only when both parse AND `current`'s `major.minor` is strictly
 * behind `latest`'s — the patch component is ignored, so a patch-only
 * lag (0.144.0 vs 0.144.1) is NOT "behind". Used for update notices:
 * patch bumps are too noisy to nag about.
 */
export const isMinorBehind = (current: string, latest: string): boolean => {
  const currentParts = extractSemver(current)?.split(".");
  const latestParts = extractSemver(latest)?.split(".");
  if (currentParts === undefined || latestParts === undefined) return false;
  const currentMinor = `${currentParts[0]}.${currentParts[1]}.0`;
  const latestMinor = `${latestParts[0]}.${latestParts[1]}.0`;
  return compareSemver(currentMinor, latestMinor) === -1;
};
