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

export type TCooldownPolicy = {
  readonly cools: boolean;
  readonly ttlMs: number;
};

const cooldownPolicies = {
  network: { cools: false, ttlMs: 0 },
  timeout: { cools: true, ttlMs: 60_000 },
  rate_limit: { cools: true, ttlMs: 180_000 },
  quota_exhausted: { cools: true, ttlMs: 180_000 },
  server_error: { cools: true, ttlMs: 60_000 },
  auth: { cools: true, ttlMs: 60_000 },
  payment: { cools: true, ttlMs: 60_000 },
  not_found: { cools: true, ttlMs: 60_000 },
  payload_too_large: { cools: true, ttlMs: 60_000 },
  unprocessable: { cools: true, ttlMs: 60_000 },
  context_overflow: { cools: false, ttlMs: 0 },
  content_filter: { cools: false, ttlMs: 0 },
  upstream_rejection: { cools: true, ttlMs: 60_000 },
} satisfies Record<TCooldownReason, TCooldownPolicy>;

export const cooldownPolicyFor = (reason: TCooldownReason): TCooldownPolicy =>
  cooldownPolicies[reason];
