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

export const PublicUsagePopularityMetrics = S.Struct({
  users: S.Number,
  user_days: S.Number,
  requests: S.Number,
  prev_users: S.NullOr(S.Number),
});
export type TPublicUsagePopularityMetrics = S.Schema.Type<
  typeof PublicUsagePopularityMetrics
>;

export const PublicUsageValueMetrics = S.Struct({
  value_usd_30d: S.Number,
  accounts: S.Number,
  /** Valid meter-delta pairs supporting the selected value estimate. */
  pair_count: S.Number,
  /** Ratio clustering quality for the selected value estimate. */
  tightness: S.Number,
  prev_value_usd_30d: S.NullOr(S.Number),
});
export type TPublicUsageValueMetrics = S.Schema.Type<
  typeof PublicUsageValueMetrics
>;

/** The exact figures stored per non-marker rollup row in `metrics` jsonb. */
export const PublicUsageIndexMetrics = S.Union(
  PublicUsagePopularityMetrics,
  PublicUsageValueMetrics,
);
export type TPublicUsageIndexMetrics = S.Schema.Type<
  typeof PublicUsageIndexMetrics
>;

/** Metadata marker that represents an otherwise empty completed bucket. */
export const PUBLIC_USAGE_INDEX_BUCKET_MARKER = "__bucket__";

/** Internal empty payload used only by the `__bucket__` completion marker. */
export const PublicUsageIndexMarkerMetrics = S.Struct({});
export type TPublicUsageIndexMarkerMetrics = S.Schema.Type<
  typeof PublicUsageIndexMarkerMetrics
>;

/**
 * The metric-specific portion of a stored row. This makes a row's sibling
 * `metric` column the discriminator for its otherwise unrelated JSON payload.
 */
export const PublicUsageIndexStoredMetric = S.Union(
  S.Struct({
    metric: S.Literal("model_popularity"),
    subject: S.String,
    metrics: PublicUsagePopularityMetrics,
  }),
  S.Struct({
    metric: S.Literal("provider_popularity"),
    subject: S.String,
    metrics: PublicUsagePopularityMetrics,
  }),
  S.Struct({
    metric: S.Literal("value"),
    subject: S.String,
    metrics: PublicUsageValueMetrics,
  }),
  S.Struct({
    metric: PublicUsageMetric,
    subject: S.Literal(PUBLIC_USAGE_INDEX_BUCKET_MARKER),
    metrics: PublicUsageIndexMarkerMetrics,
  }),
);
export type TPublicUsageIndexStoredMetric = S.Schema.Type<
  typeof PublicUsageIndexStoredMetric
>;

const PublicUsageIndexRowBase = S.Struct({
  metric_version: S.String,
  provider: S.String,
  label: S.String,
  period_start: S.String,
  period_end: S.String,
  updated_at: S.String,
});

/** One rollup row, matching the `public_usage_index` table. */
export const PublicUsageIndexRow = S.Union(
  S.extend(
    PublicUsageIndexRowBase,
    S.Struct({
      metric: S.Literal("model_popularity"),
      subject: S.String,
      metrics: PublicUsagePopularityMetrics,
    }),
  ),
  S.extend(
    PublicUsageIndexRowBase,
    S.Struct({
      metric: S.Literal("provider_popularity"),
      subject: S.String,
      metrics: PublicUsagePopularityMetrics,
    }),
  ),
  S.extend(
    PublicUsageIndexRowBase,
    S.Struct({
      metric: S.Literal("value"),
      subject: S.String,
      metrics: PublicUsageValueMetrics,
    }),
  ),
  S.extend(
    PublicUsageIndexRowBase,
    S.Struct({
      metric: PublicUsageMetric,
      subject: S.Literal(PUBLIC_USAGE_INDEX_BUCKET_MARKER),
      metrics: PublicUsageIndexMarkerMetrics,
    }),
  ),
);
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
  /** Projected API-equivalent value of the best-calibrated subscription per 30 days. */
  value_usd_30d: S.Number,
  /** Eligible calibrated accounts in the tier; the figure is the best-calibrated one of them. */
  accounts: S.Number,
  /** Valid meter-delta pairs supporting the selected account's estimate. */
  pair_count: S.Number,
  /** Ratio clustering quality for the selected account's estimate. */
  tightness: S.Number,
  pct_change: S.NullOr(S.Number),
});
export type TPublicValueByTier = S.Schema.Type<typeof PublicValueByTier>;

export const PeriodWindow = S.Struct({
  period_start: S.NullOr(S.String),
  period_end: S.NullOr(S.String),
});
export type TPeriodWindow = S.Schema.Type<typeof PeriodWindow>;

/**
 * Public usage artifact: exact aggregate figures grouped for display. The
 * top-level period is the min/max envelope across metric-specific windows,
 * retained for backward compatibility.
 */
export const PublicUsageIndexResponse = S.Struct({
  period_start: S.NullOr(S.String),
  period_end: S.NullOr(S.String),
  windows: S.Struct({
    model: PeriodWindow,
    provider: PeriodWindow,
    value: PeriodWindow,
  }),
  caption: S.Literal(PUBLIC_USAGE_INDEX_CAPTION),
  model_popularity: S.Array(PublicModelPopularity),
  provider_popularity: S.Array(PublicProviderPopularity),
  value_by_tier: S.Array(PublicValueByTier),
});
export type TPublicUsageIndexResponse = S.Schema.Type<
  typeof PublicUsageIndexResponse
>;

export function hasPublicUsageIndexData(
  response: TPublicUsageIndexResponse,
): boolean {
  return (
    response.model_popularity.length > 0 ||
    response.provider_popularity.length > 0 ||
    response.value_by_tier.length > 0
  );
}
