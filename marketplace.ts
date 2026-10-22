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
  /**
   * Upstream tool names never exposed to users — account-owner operations
   * (billing, logs, webhooks, account-wide jobs) that a consumer of the
   * integration must not reach. Hidden from `tools/list` by the CLI and
   * refused on `tools/call` by the included-usage proxy.
   */
  blocked_tools: S.optional(S.Array(S.String)),
});
export type TMarketplaceMcp = S.Schema.Type<typeof MarketplaceMcp>;

/**
 * Host-paid usage OpenLLM includes per plan tier, like the included inference
 * model (`included_usage` on catalog models). Calls go through the gateway's
 * metering proxy on OpenLLM's own vendor key — the key never reaches a client.
 * A user who brings their own key bypasses it entirely.
 */
export const MarketplaceIncludedUsage = S.Struct({
  /** What one unit is, as shown to users. Each MCP `tools/call` is metered. */
  unit: S.Literal("tool_calls", "tokens"),
  free: S.Number,
  trial: S.Number,
  pro: S.Number,
  /** Server env var holding the host key. Stripped from API responses. */
  host_key_env: S.optional(S.String),
});
export type TMarketplaceIncludedUsage = S.Schema.Type<
  typeof MarketplaceIncludedUsage
>;

export const MarketplaceEntry = S.Struct({
  /** Becomes the client's MCP server name — must not shadow `openllm`. */
  id: S.String.pipe(S.pattern(/^[a-z][a-z0-9-]{1,47}$/)),
  version: S.String,
  name: S.String,
  description: S.String,
  homepage: S.String,
  /** Optional logo URL, shown on the row tile. */
  image: S.optional(S.String),
  kind: MarketplaceEntryKind,
  policy: MarketplacePolicy,
  tier: S.optionalWith(MarketplaceTier, { default: () => "free" as const }),
  included_usage: S.optional(MarketplaceIncludedUsage),
  /**
   * On for every user until they turn it off — no installation row needed.
   * Only meaningful with included usage, so it runs without a key.
   */
  default_enabled: S.optional(S.Boolean),
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
  /** Carried from the entry's `mcp.blocked_tools`; the CLI drops these. */
  blocked_tools: S.optional(S.Array(S.String)),
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
