import { Schema as S } from "effect";

export const CooldownReason = S.Literal(
  "network",
  "timeout",
  "rate_limit",
  "quota_exhausted",
  "server_error",
  "auth",
  "payment",
  "not_found",
  "payload_too_large",
  "unprocessable",
  "context_overflow",
  "content_filter",
  "upstream_rejection",
);
export type TCooldownReason = S.Schema.Type<typeof CooldownReason>;

export type THopAction =
  | "retry_in_place"
  | "cool_and_advance"
  | "walk_no_cool";

/**
 * The routing verb for a classified hop failure. Whether a reason *cools* is not
 * a separate flag — it is exactly `action === "cool_and_advance"`, and `ttlMs`
 * exists only on that variant (a non-cooling reason carries no window).
 */
export type TCooldownPolicy =
  | { readonly action: "retry_in_place" | "walk_no_cool" }
  | { readonly action: "cool_and_advance"; readonly ttlMs: number };

const cooldownPolicies = {
  network: { action: "retry_in_place" },
  timeout: { action: "retry_in_place" },
  rate_limit: { action: "cool_and_advance", ttlMs: 180_000 },
  quota_exhausted: { action: "cool_and_advance", ttlMs: 180_000 },
  server_error: { action: "retry_in_place" },
  auth: { action: "cool_and_advance", ttlMs: 60_000 },
  payment: { action: "cool_and_advance", ttlMs: 60_000 },
  not_found: { action: "walk_no_cool" },
  payload_too_large: { action: "walk_no_cool" },
  unprocessable: { action: "walk_no_cool" },
  // Context overflow is intercepted before the action switch, so this is inert.
  context_overflow: { action: "walk_no_cool" },
  content_filter: { action: "walk_no_cool" },
  upstream_rejection: { action: "walk_no_cool" },
} satisfies Record<TCooldownReason, TCooldownPolicy>;

export const cooldownPolicyFor = (reason: TCooldownReason): TCooldownPolicy =>
  cooldownPolicies[reason];
