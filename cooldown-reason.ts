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

export type TCooldownPolicy = {
  readonly action: THopAction;
  readonly cools: boolean;
  readonly ttlMs: number;
};

const cooldownPolicies = {
  network: { action: "retry_in_place", cools: false, ttlMs: 0 },
  timeout: { action: "retry_in_place", cools: false, ttlMs: 0 },
  rate_limit: { action: "cool_and_advance", cools: true, ttlMs: 180_000 },
  quota_exhausted: { action: "cool_and_advance", cools: true, ttlMs: 180_000 },
  server_error: { action: "retry_in_place", cools: false, ttlMs: 0 },
  auth: { action: "cool_and_advance", cools: true, ttlMs: 60_000 },
  payment: { action: "cool_and_advance", cools: true, ttlMs: 60_000 },
  not_found: { action: "walk_no_cool", cools: false, ttlMs: 0 },
  payload_too_large: { action: "walk_no_cool", cools: false, ttlMs: 0 },
  unprocessable: { action: "walk_no_cool", cools: false, ttlMs: 0 },
  // Context overflow is intercepted before the action switch, so this is inert.
  context_overflow: { action: "walk_no_cool", cools: false, ttlMs: 0 },
  content_filter: { action: "walk_no_cool", cools: false, ttlMs: 0 },
  upstream_rejection: { action: "walk_no_cool", cools: false, ttlMs: 0 },
} satisfies Record<TCooldownReason, TCooldownPolicy>;

export const cooldownPolicyFor = (reason: TCooldownReason): TCooldownPolicy =>
  cooldownPolicies[reason];
