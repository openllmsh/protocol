import type { TSubscriptionProviderSlug } from "./subscription-provider";

/**
 * Provider-level minimum daemon versions for subscription control-plane UI.
 *
 * Sparse map — providers absent here have no static floor (live only).
 *
 * `unreleased` means the provider's daemon support is in tree but no
 * provider-capable binary has been published yet. The release publisher stamps
 * every `unreleased` entry to `{ state: "since", version }` before the protocol
 * source mirror (via `stampFiles`) and commits this file with `DAEMON_RELEASE`.
 * Floors are excluded from daemon binary pathspecs so `--no-compile` may stamp
 * them. Do not invent a version here by hand, and do not bump a `since` floor
 * on later unrelated releases.
 */

export type TSubscriptionDaemonFloor =
  | { readonly state: "unreleased" }
  | { readonly state: "since"; readonly version: string };

export type TSubscriptionDaemonFloors = Readonly<
  Partial<Record<TSubscriptionProviderSlug, TSubscriptionDaemonFloor>>
>;

export const SUBSCRIPTION_DAEMON_FLOORS: TSubscriptionDaemonFloors = {
  // Published pin is still pre-Muse (`v2.7.5`). Next daemon binary publish that
  // carries Muse stamps this to that release's version automatically.
  muse: { state: "unreleased" },
};
