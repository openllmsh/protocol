import { Schema as S } from "effect";
import type { TModelProviderType } from "./models";

/** The closed set of subscription-provider slugs a control command may
 *  address — the ONLY values that can ever reach a daemon delegate or the
 *  isolated-CLI installer. The daemon's `TCliProvider` derives from this. */
export const SubscriptionProviderSlug = S.Literal(
  "claude_code",
  "chatgpt",
  "kimi_code",
  // xAI Grok ("Grok Build", x.ai/cli) — SuperGrok / X Premium+ subscription
  // OAuth, delegated to the official `grok` CLI by the daemon.
  "grok",
  // Cursor subscription, delegated to the official `cursor-agent` CLI.
  "cursor",
  // Meta Muse Code subscription — daemon bridge to the official `muse`
  // CLI / SDK only. No direct Meta Model API-key fallback on this slug.
  "muse",
);
export type TSubscriptionProviderSlug = S.Schema.Type<
  typeof SubscriptionProviderSlug
>;

/** Catalog tagging only — execution still uses registry `authKind`. */
export const isSubscriptionProviderSlug = (
  provider: string,
): provider is TSubscriptionProviderSlug =>
  (SubscriptionProviderSlug.literals as ReadonlyArray<string>).includes(
    provider,
  );

export const catalogProviderType = (provider: string): TModelProviderType =>
  isSubscriptionProviderSlug(provider) ? "subscription" : "api_key";
