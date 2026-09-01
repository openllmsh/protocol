import { Schema as S } from "effect";

/**
 * Public usage index — OpenLLM's own aggregate projection of gateway activity,
 * published as exact figures. This is our analytics, not a re-release of any
 * upstream vendor's data: raw counts, projected per-tier value, and period-over-
 * period change, with no suppression, bucketing, floors, or noise. Rows are
 * recomputed and OVERWRITTEN each rollup run (live, never frozen).
 */

export const PublicUsageMetric = S.Literal(
  "model_popularity",
  "provider_popularity",
  "value",
);
export type TPublicUsageMetric = S.Schema.Type<typeof PublicUsageMetric>;

/**
 * The exact figures stored per rollup row (the `metrics` jsonb column). One flat
 * struct across metrics: popularity rows populate `users`/`user_days`/`requests`
 * (+ the previous window's `prev_users`); value rows populate `value_usd_30d`/
 * `accounts` (+ `prev_value_usd_30d`). The row's `metric` says which apply.
 */
export const PublicUsageIndexMetrics = S.Struct({
  users: S.optional(S.Number),
  user_days: S.optional(S.Number),
  requests: S.optional(S.Number),
  prev_users: S.optional(S.NullOr(S.Number)),
  value_usd_30d: S.optional(S.Number),
  accounts: S.optional(S.Number),
  prev_value_usd_30d: S.optional(S.NullOr(S.Number)),
});
export type TPublicUsageIndexMetrics = S.Schema.Type<
  typeof PublicUsageIndexMetrics
>;

/** One rollup row, matching the `public_usage_index` table. */
export const PublicUsageIndexRow = S.Struct({
  metric_version: S.String,
  metric: PublicUsageMetric,
  subject: S.String,
  provider: S.String,
  label: S.String,
  period_start: S.String,
  period_end: S.String,
  metrics: PublicUsageIndexMetrics,
  updated_at: S.String,
});
export type TPublicUsageIndexRow = S.Schema.Type<typeof PublicUsageIndexRow>;

/** Factual caption describing what the figures measure (not a legal hedge). */
export const PUBLIC_USAGE_INDEX_CAPTION =
  "Trends measured across OpenLLM gateway activity";

export const PublicModelPopularity = S.Struct({
  provider: S.String,
  model: S.String,
  users: S.Number,
  user_days: S.Number,
  requests: S.Number,
  /** Percent change in distinct users vs the previous window; null if no prior. */
  pct_change: S.NullOr(S.Number),
});
export type TPublicModelPopularity = S.Schema.Type<
  typeof PublicModelPopularity
>;

export const PublicProviderPopularity = S.Struct({
  provider: S.String,
  users: S.Number,
  user_days: S.Number,
  requests: S.Number,
  pct_change: S.NullOr(S.Number),
});
export type TPublicProviderPopularity = S.Schema.Type<
  typeof PublicProviderPopularity
>;

export const PublicValueByTier = S.Struct({
  provider: S.String,
  tier: S.String,
  /** Projected API-equivalent value of the subscription per 30 days. */
  value_usd_30d: S.Number,
  accounts: S.Number,
  pct_change: S.NullOr(S.Number),
});
export type TPublicValueByTier = S.Schema.Type<typeof PublicValueByTier>;

/**
 * Public usage artifact: exact aggregate figures grouped for display. Model and
 * provider popularity carry real counts + period-over-period change; value is a
 * per-provider tier breakdown of projected 30-day value. A provider or tier with
 * no data for the window is simply absent (no placeholder).
 */
export const PublicUsageIndexResponse = S.Struct({
  period_start: S.NullOr(S.String),
  period_end: S.NullOr(S.String),
  caption: S.Literal(PUBLIC_USAGE_INDEX_CAPTION),
  model_popularity: S.Array(PublicModelPopularity),
  provider_popularity: S.Array(PublicProviderPopularity),
  value_by_tier: S.Array(PublicValueByTier),
});
export type TPublicUsageIndexResponse = S.Schema.Type<
  typeof PublicUsageIndexResponse
>;
