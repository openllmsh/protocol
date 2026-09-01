import { Schema as S } from "effect";

export const PublicUsageMetric = S.Literal(
  "model_popularity",
  "provider_popularity",
  "value",
);
export type TPublicUsageMetric = S.Schema.Type<typeof PublicUsageMetric>;

export const PublicUsageDirection = S.Literal(
  "up",
  "steady",
  "down",
  "more",
  "same",
  "less",
  "withheld",
);
export type TPublicUsageDirection = S.Schema.Type<typeof PublicUsageDirection>;

export const PublicUsageGroup = S.Literal("leading", "established");
export type TPublicUsageGroup = S.Schema.Type<typeof PublicUsageGroup>;

export const PublicUsageAccountCalibration = S.Struct({
  account_hash: S.String,
  window_label: S.String,
  k_usd_per_pct: S.Number,
  bracket_usd: S.Number,
  pair_count: S.Number,
  tightness: S.Number,
  near_ceiling: S.Boolean,
});
export type TPublicUsageAccountCalibration = S.Schema.Type<
  typeof PublicUsageAccountCalibration
>;

/** Internal-only rollup diagnostics. Never expose this shape from a public route. */
export const PublicUsageIndexInternalMetrics = S.Struct({
  raw_request_count: S.Number,
  distinct_user_count: S.Number,
  active_user_days: S.Number,
  allowlist_matched_request_count: S.Number,
  allowlist_dropped_request_count: S.Number,
  allowlist_coverage: S.Number,
  previous_distinct_user_count: S.NullOr(S.Number),
  previous_active_user_days: S.NullOr(S.Number),
  floors_passed: S.Boolean,
  calibratable_account_count: S.Number,
  account_calibrations: S.Array(PublicUsageAccountCalibration),
  clip_cap_usd: S.Number,
  epsilon_spent: S.Number,
  tier: S.NullOr(S.String),
});
export type TPublicUsageIndexInternalMetrics = S.Schema.Type<
  typeof PublicUsageIndexInternalMetrics
>;

export const PublicUsageIndexRow = S.Struct({
  metric_version: S.String,
  metric: PublicUsageMetric,
  subject: S.String,
  provider: S.String,
  label: S.String,
  grp: S.NullOr(PublicUsageGroup),
  period_start: S.String,
  period_end: S.String,
  direction: S.NullOr(PublicUsageDirection),
  value_band: S.NullOr(S.String),
  shift_badge: S.NullOr(S.String),
  is_frozen: S.Boolean,
  internal_metrics: PublicUsageIndexInternalMetrics,
  published_at: S.NullOr(S.String),
  updated_at: S.String,
});
export type TPublicUsageIndexRow = S.Schema.Type<typeof PublicUsageIndexRow>;
