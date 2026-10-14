import { Schema as S } from "effect";

/**
 * Marketplace entry — one integration a user can enable. Same shape for the
 * verified catalog (JSON in the repo) and, later, private user uploads.
 * See `docs/plan/2026-10-13-marketplace.md` §3.
 *
 * Only `remote` (hosted MCP over HTTP) is delivered today; `package` and
 * `download` are reserved for the daemon pipeline (P3).
 */
export const MarketplaceEntryKind = S.Literal("remote", "package", "download");
export type TMarketplaceEntryKind = S.Schema.Type<typeof MarketplaceEntryKind>;

/** How access is provided — the pipeline acts on this, never on the vendor. */
export const MarketplacePolicy = S.Literal("byok", "oauth", "none");
export type TMarketplacePolicy = S.Schema.Type<typeof MarketplacePolicy>;

export const MarketplaceTier = S.Literal("free", "pro");
export type TMarketplaceTier = S.Schema.Type<typeof MarketplaceTier>;

/** A field the UI asks the user for. `secret` fields are vault-encrypted. */
export const MarketplaceConfigField = S.Struct({
  key: S.String.pipe(S.pattern(/^[a-z][a-z0-9_]{0,63}$/)),
  label: S.String,
  secret: S.Boolean,
  required: S.Boolean,
  help_url: S.optional(S.String),
});
export type TMarketplaceConfigField = S.Schema.Type<
  typeof MarketplaceConfigField
>;

/**
 * How clients reach the server. String values may hold `{{secret:<key>}}` /
 * `{{config:<key>}}` placeholders, filled at launch.
 */
export const MarketplaceMcp = S.Struct({
  transport: S.Literal("http", "sse", "stdio"),
  url: S.optional(S.String),
  headers: S.optional(S.Record({ key: S.String, value: S.String })),
  command: S.optional(S.String),
  args: S.optional(S.Array(S.String)),
  env: S.optional(S.Record({ key: S.String, value: S.String })),
});
export type TMarketplaceMcp = S.Schema.Type<typeof MarketplaceMcp>;

export const MarketplaceEntry = S.Struct({
  /** Becomes the client's MCP server name — must not shadow `openllm`. */
  id: S.String.pipe(S.pattern(/^[a-z][a-z0-9-]{1,47}$/)),
  version: S.String,
  name: S.String,
  description: S.String,
  homepage: S.String,
  icon: S.optional(S.String),
  kind: MarketplaceEntryKind,
  policy: MarketplacePolicy,
  tier: S.optionalWith(MarketplaceTier, { default: () => "free" as const }),
  mcp: MarketplaceMcp,
  config: S.optionalWith(S.Array(MarketplaceConfigField), {
    default: () => [],
  }),
});
export type TMarketplaceEntry = S.Schema.Type<typeof MarketplaceEntry>;

/**
 * A resolved MCP server for one launch: placeholders filled, secrets
 * decrypted. Returned only to the owning user's own CLI.
 */
export const MarketplaceLaunchServer = S.Struct({
  id: S.String,
  transport: S.Literal("http", "sse", "stdio"),
  url: S.optional(S.String),
  headers: S.optional(S.Record({ key: S.String, value: S.String })),
  command: S.optional(S.String),
  args: S.optional(S.Array(S.String)),
  env: S.optional(S.Record({ key: S.String, value: S.String })),
});
export type TMarketplaceLaunchServer = S.Schema.Type<
  typeof MarketplaceLaunchServer
>;

export const MarketplaceLaunchResponse = S.Struct({
  servers: S.Array(MarketplaceLaunchServer),
});
export type TMarketplaceLaunchResponse = S.Schema.Type<
  typeof MarketplaceLaunchResponse
>;
