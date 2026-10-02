import { Schema as S } from "effect";

export const ServiceTier = S.Literal("auto", "default", "flex", "priority");
export type TServiceTier = S.Schema.Type<typeof ServiceTier>;

/** Sparse user overrides. Add named, schema-checked settings here as they ship. */
export const ModelSettings = S.Struct({
  service_tier: S.optional(ServiceTier),
});
export type TModelSettings = S.Schema.Type<typeof ModelSettings>;

export const ModelSettingsOverrides = S.Record({
  key: S.String,
  value: ModelSettings,
});
export type TModelSettingsOverrides = S.Schema.Type<
  typeof ModelSettingsOverrides
>;

export const ServiceTierSetting = S.Struct({
  label: S.String,
  description: S.String,
  options: S.Array(S.Struct({ value: ServiceTier, label: S.String })),
  default: S.optional(ServiceTier),
});

/** Catalog-owned controls and defaults, shared by discovery, UI and dispatch. */
export const ModelSettingDefinitions = S.Struct({
  service_tier: S.optional(ServiceTierSetting),
});
export type TModelSettingDefinitions = S.Schema.Type<
  typeof ModelSettingDefinitions
>;

export const resolveModelSettings = (
  definitions: TModelSettingDefinitions | undefined,
  overrides: TModelSettings | undefined,
): TModelSettings => {
  const setting = definitions?.service_tier;
  if (setting === undefined) return {};
  const override = overrides?.service_tier;
  const value =
    override !== undefined &&
    setting.options.some((option) => option.value === override)
      ? override
      : setting.default;
  return value !== undefined &&
    setting.options.some((option) => option.value === value)
    ? { service_tier: value }
    : {};
};

export const updateModelSettings = (
  overrides: TModelSettingsOverrides | undefined,
  modelId: string,
  serviceTier: TServiceTier | undefined,
): TModelSettingsOverrides => {
  const next = { ...overrides };
  const { service_tier: _previous, ...rest } = next[modelId] ?? {};
  if (serviceTier !== undefined) {
    next[modelId] = { ...rest, service_tier: serviceTier };
  } else if (Object.keys(rest).length > 0) {
    next[modelId] = rest;
  } else {
    delete next[modelId];
  }
  return next;
};

/** Codex config calls this "fast"; its request/app-server tier is "priority". */
export const codexServiceTier = (value: unknown): string | null => {
  if (value === "fast" || value === "priority") return "priority";
  if (value === "flex") return "flex";
  return null;
};
