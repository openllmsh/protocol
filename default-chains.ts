import type {
  TDefaultChainClass,
  TExtendedModel,
  TModelCapability,
} from "./models";
import { MEDIA_DEFAULT_CLASS } from "./models";

/**
 * Shared catalog default-chain ranking. Browser-safe (no DB/HTTP).
 * Lead: host-paid included models (`included_usage`) come first in every
 * chain they belong to — a fresh user starts on what OpenLLM gives them.
 * Primary: index of `chainClass` in `default_tiers` (lower first).
 * Tie-break: `tier_rank` ascending. Catalog array order is not policy.
 */
export type TDefaultChainRankable = Pick<
  TExtendedModel,
  | "default_tiers"
  | "tier_rank"
  | "capabilities"
  | "deprecated"
  | "provider"
  | "included_usage"
>;

export const compareDefaultChainMembers = (
  a: TDefaultChainRankable,
  b: TDefaultChainRankable,
  chainClass: TDefaultChainClass,
): number => {
  const leadA = a.included_usage === undefined ? 1 : 0;
  const leadB = b.included_usage === undefined ? 1 : 0;
  if (leadA !== leadB) return leadA - leadB;
  const depthA =
    a.default_tiers?.indexOf(chainClass) ?? Number.MAX_SAFE_INTEGER;
  const depthB =
    b.default_tiers?.indexOf(chainClass) ?? Number.MAX_SAFE_INTEGER;
  if (depthA !== depthB) return depthA - depthB;
  return (
    (a.tier_rank ?? Number.MAX_SAFE_INTEGER) -
    (b.tier_rank ?? Number.MAX_SAFE_INTEGER)
  );
};

export const orderDefaultChainMembers = <T extends TDefaultChainRankable>(
  catalog: ReadonlyArray<T>,
  available: ReadonlySet<string> | undefined,
  chainClass: TDefaultChainClass,
  capability: TModelCapability,
): ReadonlyArray<T> =>
  catalog
    .filter(
      (m) =>
        (m.default_tiers?.includes(chainClass) ?? false) &&
        m.capabilities.includes(capability) &&
        m.deprecated !== true &&
        (available === undefined || available.has(m.provider)),
    )
    .sort((a, b) => compareDefaultChainMembers(a, b, chainClass));

/** Ordered catalog media defaults for one capability. Empty if none qualify. */
export const deriveMediaDefaultModels = (
  catalog: ReadonlyArray<TExtendedModel>,
  available: ReadonlySet<string>,
  capability: TModelCapability,
): ReadonlyArray<TExtendedModel> =>
  orderDefaultChainMembers(catalog, available, MEDIA_DEFAULT_CLASS, capability);
