import type {
  TDefaultChainClass,
  TExtendedModel,
  TModelCapability,
} from "./models";
import { MEDIA_DEFAULT_CLASS } from "./models";

/**
 * Shared catalog default-chain ranking. Browser-safe (no DB/HTTP).
 * Primary: index of `chainClass` in `default_tiers` (lower first).
 * Tie-break: `tier_rank` ascending. Catalog array order is not policy.
 */
export type TDefaultChainRankable = Pick<
  TExtendedModel,
  "default_tiers" | "tier_rank" | "capabilities" | "deprecated" | "provider"
>;

export const compareDefaultChainMembers = (
  a: TDefaultChainRankable,
  b: TDefaultChainRankable,
  chainClass: TDefaultChainClass,
): number => {
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
