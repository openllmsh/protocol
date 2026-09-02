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

/**
 * Internal payload used only by the `__bucket__` completion marker. The value
 * bucket's marker carries a fingerprint of the eligible (provider, account,
 * tier) set it was derived from, so a reader can distinguish changed inputs
 * against mere elapsed time and refresh the bucket in place. Optional: markers
 * written before the field existed (and popularity markers) omit it.
 */
export const PublicUsageIndexMarkerMetrics = S.Struct({
  tier_set_fingerprint: S.optional(S.String),
});
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
  /** The provider's registry `displayName` — a rendered label, not a key. */
  provider: S.String,
  /**
   * The stable provider slug (`claude_code`, `openai`, …) behind that label.
   * Same role as `PublicValueByTier.provider_slug`: anything rendering a logo,
   * a tint or a public brand name keys off THIS, since `provider` above is a
   * display string. Empty only for a legacy label the registry no longer knows.
   */
  provider_slug: S.String,
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
  /** The provider's registry `displayName` — a rendered label, not a key. */
  provider: S.String,
  /**
   * The stable provider slug (`claude_code`, `openai`, …) behind that label.
   * Unlike the model rows, a provider row already stores the slug as its
   * SUBJECT, so this is carried straight through rather than recovered from
   * the registry. Anything rendering a logo, a tint or a public brand name
   * keys off THIS, since `provider` above is a display string.
   */
  provider_slug: S.String,
  users: S.Number,
  user_days: S.Number,
  requests: S.Number,
  pct_change: S.NullOr(S.Number),
});
export type TPublicProviderPopularity = S.Schema.Type<
  typeof PublicProviderPopularity
>;

/**
 * One period's reading for a tier, for the value trend series.
 *
 * Deliberately only the two fields a line needs. The calibration figures
 * (`accounts`, `pair_count`, `tightness`) describe how well a SINGLE estimate
 * is supported and are published on the current reading; repeating them for
 * every historical point would multiply the payload by the number of retained
 * buckets to say something no line can draw.
 */
export const PublicValuePoint = S.Struct({
  /** ISO period end, and the x value of the point. */
  period_end: S.String,
  value_usd_30d: S.Number,
});
export type TPublicValuePoint = S.Schema.Type<typeof PublicValuePoint>;

export const PublicValueByTier = S.Struct({
  /**
   * The provider's registry `displayName` — a sign-in-flow label ("Claude
   * (Pro/Max sign-in)"), kept for callers that already read it.
   */
  provider: S.String,
  /**
   * The stable provider slug (`claude_code`, `chatgpt`, …), split off the
   * row's `provider:tier` subject. `provider` above is a display string and so
   * cannot key a brand map; anything rendering a logo, a tint or a public
   * brand name keys off THIS.
   */
  provider_slug: S.String,
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
  /**
   * Every retained period for this tier, oldest first, INCLUDING the current
   * one — so a consumer plots `history` alone rather than stitching it to the
   * top-level reading and risking a duplicated or missing final point.
   *
   * The buckets were always kept (`public_usage_index` is keyed on
   * `(metric_version, metric, subject, period_start)`); it was the reader that
   * dropped them. A tier measured for the first time has a single point, which
   * is a fact a chart has to render rather than an error.
   */
  history: S.Array(PublicValuePoint),
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
