/**
 * Shared provider-tier identity. Trim only — never fold case or aliases —
 * so `pro` and `prolite` stay distinct. Missing/blank plan is `null`.
 *
 * `providerTierBucketKey` encodes `(provider, accountHash, plan)` with
 * length-prefixed segments so values containing the delimiter cannot collide.
 * Internal timeline keys may pass `plan: null`. A calibratable cache row must
 * not: callers reject null before using this as a cache key.
 */

export const PROVIDER_TIER_METHODOLOGY_VERSION = "tier-isolation-v1";

export const normalizeProviderTier = (raw: unknown): string | null => {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const encodeSegment = (value: string): string => `${value.length}:${value}`;

/** ASCII unit separator — explicit code point so the source stays readable. */
const SEGMENT_SEP = String.fromCharCode(0x1f);

/**
 * Collision-safe tuple encoding. Null plan uses a distinct `0` token, not an
 * empty segment (which would collide with a zero-length string, already
 * rejected by {@link normalizeProviderTier}).
 */
export const providerTierBucketKey = (
  provider: string,
  accountHash: string,
  plan: string | null,
): string =>
  `${encodeSegment(provider)}${SEGMENT_SEP}${encodeSegment(accountHash)}${SEGMENT_SEP}${
    plan === null ? "0" : encodeSegment(plan)
  }`;

/** Snapshot-series identity: bucket plus window label, same encoding. */
export const providerTierWindowSeriesKey = (
  provider: string,
  accountHash: string,
  plan: string | null,
  windowLabel: string,
): string =>
  `${providerTierBucketKey(provider, accountHash, plan)}${SEGMENT_SEP}${encodeSegment(windowLabel)}`;

/** Observation-sample identity for local idempotence of a (tier, as_of) pair. */
export const providerTierObservationSampleKey = (
  provider: string,
  accountHash: string,
  plan: string | null,
  observedAtMs: number,
): string =>
  `${providerTierBucketKey(provider, accountHash, plan)}${SEGMENT_SEP}${encodeSegment(String(observedAtMs))}`;
