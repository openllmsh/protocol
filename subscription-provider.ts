import { Schema as S } from "effect";

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
);
export type TSubscriptionProviderSlug = S.Schema.Type<
  typeof SubscriptionProviderSlug
>;
