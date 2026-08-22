import { Schema as S } from "effect";
import type { TContextOverflowStrategy } from "./config";
import {
  ContextOverflowStrategy,
  FallbackGroup,
  ModelFallbackBinding,
} from "./config";
import { CooldownReason } from "./cooldown-reason";
import {
  ModelCapability,
  ProviderModelList,
  SubscriptionMeter,
} from "./models";
import { ProviderUsageSnapshot } from "./provider-usage";
import { RequestStatus } from "./stats";

// ─── GET /api/daemon/bootstrap (daemon → cloud) ──────────────────────
//
// One snapshot with everything the local pipeline needs to resolve a
// chain + price-free dispatch: the model catalog, the provider prefixes,
// and the authenticated user's fallback config. Pulled at boot and
// refreshed on a TTL so the daemon stays in lockstep with cloud config
// without recompiling.

export const DaemonCatalogEntry = S.Struct({
  model_id: S.String,
  provider: S.String,
  provider_model_id: S.String,
  input_token_limit: S.NullOr(S.Number),
  output_token_limit: S.NullOr(S.Number),
  subscription_meter: S.optional(SubscriptionMeter),
  /**
   * Catalog capabilities for this model. Optional so older clouds keep
   * bootstrapping newer daemons. Absent / empty = unknown (never treated
   * as known-non-vision). The walker vision gate reads this on each hop.
   */
  capabilities: S.optional(S.Array(ModelCapability)),
});
export type TDaemonCatalogEntry = S.Schema.Type<typeof DaemonCatalogEntry>;

/**
 * How a subscription hop EXECUTES after the cloud selected + signed it:
 * `bridge` = the native vendor-runtime path (Claude Code stream-json /
 * Codex app-server); `handrolled` = the manual upstream-HTTP transport.
 * A cloud-controlled preference, published in the bootstrap payload —
 * never a daemon-local env. See
 * `docs/proposals/active-sub-method.md` + `sub-method-simplified-execution.md`.
 */
export const SubMethod = S.Literal("bridge", "handrolled");
export type TSubMethod = S.Schema.Type<typeof SubMethod>;

export const DaemonBootstrap = S.Struct({
  catalog: S.Array(DaemonCatalogEntry),
  provider_prefixes: S.Array(S.String),
  user_fallback_groups: S.Array(FallbackGroup),
  user_model_fallback_bindings: S.Array(ModelFallbackBinding),
  /** Per-user context-window overflow routing preference. Absent means the
   * historical hop-to-larger-context behaviour. */
  context_overflow_strategy: S.optional(ContextOverflowStrategy),
  /**
   * Per-user HMAC key the daemon uses to VERIFY the `?__plan=` the cloud
   * 307s to it (the cloud signs with the same key). Lets the daemon reject
   * a `__plan` forged by another local process. Null when the cloud has no
   * signing secret configured (dev) — the daemon then accepts unsigned
   * plans. See `docs/proposals/coreless-daemon-passthrough.md` §9.
   */
  plan_signing_key: S.optional(S.NullOr(S.String)),
  /**
   * The daemon binary version the cloud currently publishes (bare semver, no
   * leading `v` — matches the daemon's compiled `DAEMON_VERSION`). The daemon
   * compares it against its own and SELF-UPDATES when they differ (converge to
   * published — the cloud is the source of truth, so republishing an older tag
   * rolls daemons back). Null/absent when no release is published yet (or the
   * cloud is too old to advertise it) — the daemon then never self-updates.
   * See `packages/daemon/src/self-update.ts`.
   */
  latest_version: S.optional(S.NullOr(S.String)),
  /**
   * The `openllmc` CLI version the cloud currently publishes (bare semver, no
   * leading `v`). The daemon converges the INSTALLED CLI binary at
   * `~/.openllm/bin/openllmc` to it on the same auto-update tick (and under
   * the same opt-out toggle) as its own self-update — one flow, one toggle.
   * The daemon never installs the CLI: an absent binary is skipped. Null/
   * absent when no CLI release is published yet (or the cloud is too old to
   * advertise it) — the daemon then never touches the CLI.
   * See `packages/daemon/src/cli-self-update.ts`.
   */
  latest_cli_version: S.optional(S.NullOr(S.String)),
  /**
   * The cloud's resolved `ACTIVE_SUB_METHOD` preference (server process env,
   * parsed cloud-side: only lowercase `bridge`/`handrolled`; unset/invalid →
   * null = no preference). The daemon samples it from its cached bootstrap
   * snapshot once per hop at selection time; an unsupported preference for a
   * provider resolves to that provider's default method (`methods[0]` in the
   * daemon's capability table). Optional so older clouds keep bootstrapping
   * older daemons.
   */
  active_sub_method: S.optional(S.NullOr(SubMethod)),
  /**
   * Per-provider overrides layered on top of `active_sub_method` — parsed
   * cloud-side from the same `ACTIVE_SUB_METHOD` env (`provider:method`
   * entries, e.g. `bridge,kimi_code:handrolled`). For a hop the daemon
   * resolves `overrides[provider] ?? active_sub_method` before the
   * capability check; an override for an unsupported method still falls
   * back to the provider default. String-keyed (not the closed slug
   * literal) so a newer cloud advertising a slug this daemon predates
   * never fails bootstrap decode. Optional/null so older clouds keep
   * bootstrapping newer daemons and vice versa.
   */
  active_sub_methods: S.optional(
    S.NullOr(S.Record({ key: S.String, value: SubMethod })),
  ),
  /**
   * Cloud-controlled toggle for the daemon's SIGNED-PLAN CACHE
   * (`DAEMON_PLAN_CACHE` on the cloud, default ON — an explicit `0`/`false`
   * disables): when true, a `/v1/*` request that reaches the daemon
   * directly WITHOUT a `?__plan=` may be served against the most recent
   * cloud-signed plan tuple for the same model alias within a short TTL,
   * skipping the per-request cloud round trip. The signature is still
   * verified per request (the cached tuple is exactly what the cloud
   * signed); staleness is bounded by the TTL. False → the daemon requires
   * a plan on every request; ABSENT (a cloud predating the field) → the
   * daemon also keeps the cache off (the cloud is the one authority). See
   * docs/proposals/sub-method-simplified-execution.md §4.
   */
  plan_cache: S.optional(S.Boolean),
  /**
   * The user's FLEET subscription servers: for each subscription provider
   * connected on some ONLINE daemon of this user, the serving daemon's
   * key id. Computed cloud-side from `api_key_activity` presence + status
   * (serve-by-default policy — every online device qualifies). A consuming
   * daemon with no local credential for a subscription hop tunnels the
   * request to `key_id` over the relay
   * (`docs/features/sub-tunnel-and-chat-sessions.md` §1). String-keyed
   * provider so newer slugs never fail an older daemon's decode; optional
   * so older clouds keep bootstrapping newer daemons.
   */
  fleet_subscriptions: S.optional(
    S.Array(
      S.Struct({
        provider: S.String,
        key_id: S.String,
        /** Serving daemon X25519 SPKI, absent for pre-pubkey peers. */
        pubkey: S.optional(S.String),
      }),
    ),
  ),
  /**
   * SPKI DER (base64) of the seed-derived device-access public key for
   * the authenticating api key. The daemon verifies browser-signed
   * device grants against it. Null when the key is un-provisioned or
   * the caller is session-only / watcher (no owning key). Optional so
   * older clouds keep bootstrapping newer daemons.
   */
  device_access_pubkey: S.optional(S.NullOr(S.String.pipe(S.maxLength(64)))),
});
export type TDaemonBootstrap = S.Schema.Type<typeof DaemonBootstrap>;

/**
 * Wire contracts for the local daemon ⇄ cloud control plane and for the
 * daemon's own localhost control surface.
 *
 * Compliance note: the only daemon→cloud payloads are config pulls and
 * the metadata-only request row below. No subscription token and no
 * prompt/completion content ever crosses this boundary.
 */

// ─── POST /api/daemon/requests (daemon → cloud) ──────────────────────
//
// One `public.requests` row for a subscription hop the daemon ran
// locally. `user_id` / `key_id` are deliberately ABSENT: the cloud
// derives both from the authenticating `sk-llm-...` key, so a daemon can
// only ever record rows for its own owner.
//
// No `cost_usd` either — the daemon reports only TOKEN COUNTS; the cloud
// is the single pricing source of truth and computes cost from these
// tokens in `daemonRecordHandler` (`costFor`). Keeping cost off the wire
// is why no pricing table is duplicated onto the daemon.
export const DaemonRecordRequest = S.Struct({
  model: S.String,
  provider: S.String,
  status: RequestStatus,
  /** Canonical prompt tokens — INCLUDES the two cache fields below. */
  tokens_in: S.Number,
  tokens_out: S.Number,
  // The cache split of `tokens_in`. Optional so a daemon built before this
  // field existed still records (its rows just price as all-fresh input, the
  // prior behaviour). Still no `cost_usd`: the cloud prices these tokens.
  cached_tokens: S.optional(S.Number),
  cache_creation_tokens: S.optional(S.Number),
  latency_ms: S.Number,
  idempotency_key: S.optional(S.NullOr(S.String)),
  error: S.optional(S.NullOr(S.String)),
  endpoint: S.optional(S.NullOr(S.String)),
  /** Obscured vendor-account identity of the credential that SERVED this
   *  hop — the same `sha256("openllm-account-v1:<provider>:<id>")` digest
   *  the status frame reports, computed from the token that ran the
   *  request. Lets the usage-calibration estimator attribute this row's
   *  cost to the right meter series when a provider has several accounts.
   *  Optional so daemons predating the field still record (the cloud
   *  stores null → the estimator's conservative null pool). */
  account_hash: S.optional(S.String),
  cooldown_reason: S.optional(CooldownReason),
  /** Reset instant for reset-aware TTL cap; optional so old daemons omit. */
  reset_at_ms: S.optional(S.Number),
}).pipe(
  // A successful hop never cools — a `cooldown_reason` on a `success` record
  // is malformed, so reject it at the schema boundary rather than let the
  // handler mark a cooldown for a model that just served cleanly.
  S.filter(
    (record) =>
      record.status !== "success" || record.cooldown_reason === undefined,
    { message: () => "cooldown_reason is only valid on a non-success record" },
  ),
);
export type TDaemonRecordRequest = S.Schema.Type<typeof DaemonRecordRequest>;

// ─── POST /api/daemon/models (daemon → cloud) ────────────────────────
//
// The daemon writer for `public.model_cache` (live-provider-model-catalog
// proposal §4): the live model lists the daemon's CONNECTED delegates
// report from their vendors' own list endpoints. Metadata only — model
// ids + optional display/context data, never a credential. `user_id` is
// deliberately ABSENT (derived from the authenticating `sk-llm-...` key,
// same posture as `DaemonRecordRequest`), and the handler restricts
// `provider` to the subscription set so a daemon can never overwrite the
// cloud-owned API-key rows.
export const DaemonModelReportEntry = S.Struct({
  provider: S.String.pipe(S.maxLength(64)),
  // Same per-list bound as `ProviderModelList` (defense-in-depth on
  // this authenticated write path).
  models: ProviderModelList,
  /** Vendor CLI version (bare semver) that OBSERVED this list. Some
   *  vendors gate model visibility by client version (Codex does), so
   *  the cloud uses this to refuse a write that would replace a fresh
   *  row produced by a NEWER CLI on another device. Optional so daemons
   *  built before the field still report (their writes stay permissive). */
  cli_version: S.optional(S.String.pipe(S.maxLength(64))),
});
export type TDaemonModelReportEntry = S.Schema.Type<
  typeof DaemonModelReportEntry
>;

export const DaemonModelReport = S.Struct({
  // One entry per subscription provider — the closed set is 4 slugs;
  // 32 leaves headroom without allowing a bloated report.
  entries: S.Array(DaemonModelReportEntry).pipe(S.maxItems(32)),
});
export type TDaemonModelReport = S.Schema.Type<typeof DaemonModelReport>;

// ─── Daemon control relay (cloud ⇄ daemon over the WebSocket relay) ──
//
// The daemon dials OUT and holds ONE WebSocket to the relay (it fetches the
// channel via `GET /api/daemon/channel`); the dashboard enqueues control
// commands via its own watcher socket (or `POST /api/daemon/cmd` as a
// fallback). Commands, acks and status all ride relay frames (see
// `packages/schema/relay.ts`); the relay writes `api_key_activity` so presence
// is server-side, no `x-openllm-daemon` header. See
// `docs/proposals/daemon-relay-websocket-push.md`.

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

/** Optional user-visible device-session label (open frames + presence). */
export const SessionTitleField = S.String.pipe(S.maxLength(80));
export type TSessionTitleField = S.Schema.Type<typeof SessionTitleField>;

/**
 * CLIs the device PTY surface can host: OpenLLM session clients with local
 * history + resume wiring (Claude / Codex / Grok / OpenCode / Hermes), plus a
 * direct login shell. Keep `SubscriptionProviderSlug` for credentials/usage;
 * session frames use this set, while the local-session list uses its narrower
 * canonical set. Kimi and Cursor stay subscription-only for now.
 */
export const DeviceSessionCli = S.Literal(
  "claude_code",
  "chatgpt",
  "grok",
  "opencode",
  "hermes",
  "shell",
);
export type TDeviceSessionCli = S.Schema.Type<typeof DeviceSessionCli>;

/**
 * CLIs for which `openllm -d <client>` (skip approvals) is meaningful.
 * Canonical set — the picker, session-host, and any consumer import THIS
 * rather than re-declaring their own membership list.
 */
export const DANGEROUS_SESSION_CLIS: ReadonlySet<TDeviceSessionCli> = new Set([
  "claude_code",
  "chatgpt",
  "grok",
  "hermes",
]);

/** CLIs with a local history reader on the daemon (v1). Canonical set. */
export const LISTABLE_SESSION_CLIS: ReadonlySet<TDeviceSessionCli> = new Set([
  "claude_code",
  "chatgpt",
  "grok",
  "opencode",
  "hermes",
]);

export const supportsDangerousSession = (cli: string): boolean =>
  (DANGEROUS_SESSION_CLIS as ReadonlySet<string>).has(cli);

export const isListableSessionCli = (cli: string): boolean =>
  (LISTABLE_SESSION_CLIS as ReadonlySet<string>).has(cli);

/**
 * One row from the daemon's local session index (vendor history +
 * `~/.openllm/run/<client>/<pid>/live.json` + in-memory device PTYs).
 * Used by `list_local_sessions` so the picker can attach / cold-resume
 * without scanning disk in the browser.
 */
export const LocalCliSession = S.Struct({
  /** Vendor session id when known; otherwise a synthetic live-run key. */
  id: S.String.pipe(S.minLength(1), S.maxLength(128)),
  title: SessionTitleField,
  cwd: S.NullOr(S.String.pipe(S.maxLength(1024))),
  updated_at_ms: S.Number,
  cli: DeviceSessionCli,
  live: S.Boolean,
  /** Where the live process is hosted, when `live`. */
  host: S.optional(S.NullOr(S.Literal("local", "device"))),
  /** OpenLLM device session id when the PTY is already hosted by the daemon. */
  openllm_session_id: S.optional(S.NullOr(S.String.pipe(S.maxLength(64)))),
  /** True when the browser can `mode:"attach"` without spawning a second CLI. */
  attachable: S.Boolean,
});
export type TLocalCliSession = S.Schema.Type<typeof LocalCliSession>;

/** Payload for `list_local_sessions`. */
export const ListLocalSessionsPayload = S.Struct({
  cli: DeviceSessionCli,
  /** Max rows (default 30 server-side; hard cap 100). */
  limit: S.optional(
    S.Number.pipe(S.int(), S.greaterThanOrEqualTo(1), S.lessThanOrEqualTo(100)),
  ),
});
export type TListLocalSessionsPayload = S.Schema.Type<
  typeof ListLocalSessionsPayload
>;

/** Result blob for `list_local_sessions` (command ack / lifecycle.result). */
export const ListLocalSessionsResult = S.Struct({
  sessions: S.Array(LocalCliSession),
});
export type TListLocalSessionsResult = S.Schema.Type<
  typeof ListLocalSessionsResult
>;

/** Terminal exit reason retained for a dead but resumable device session. */
export const SessionExitReason = S.Literal(
  "evicted",
  "reaped",
  "done",
  "killed",
);
export type TSessionExitReason = S.Schema.Type<typeof SessionExitReason>;

// Opaque base64 blob (an X25519 sealed box / SPKI public key) — decrypted or
// parsed by the recipient, never executed. Padding restricted to at most two
// '=' characters only at the end (valid base64 format).
const Base64Blob = S.String.pipe(S.pattern(/^[A-Za-z0-9+/]+={0,2}$/));

/** The closed set of install-time gateway modes: which base URL a client
 *  setup bakes — the local daemon (`local`, the default) or the cloud
 *  origin. ONE schema for every wire field and TS union that carries it. */
export const GatewayMode = S.Literal("local", "cloud");
export type TGatewayMode = S.Schema.Type<typeof GatewayMode>;

const ProviderPayload = S.Struct({ slug: SubscriptionProviderSlug });
/** A remote-Claude headless-login code submission: the X25519-sealed OAuth
 *  authorization code the user pasted from the hosted callback page. Opened on
 *  the target daemon and written to the waiting `claude auth login` stdin. The
 *  code is single-use + PKCE-bound (useless without the daemon's in-process
 *  verifier); sealed so the cloud relays it blind. See
 *  `docs/proposals/headless-claude-login-paste-back.md`. */
const SubmitLoginCodePayload = S.Struct({
  slug: SubscriptionProviderSlug,
  sealed: Base64Blob,
});
const SetAutoUpdatePayload = S.Struct({ enabled: S.Boolean });
/** `refresh` scoped to one provider's usage cache; bare `{}` clears all. */
const RefreshPayload = S.Struct({
  slug: S.optional(SubscriptionProviderSlug),
});
/** Payload-less commands (`status` / `update`): accept an absent payload or a
 *  bare `{}` so every union member carries the field (uniform access). */
const EmptyPayload = S.Struct({});

/**
 * The CLOSED control-command vocabulary — one struct per kind, literal-
 * discriminated, every payload field a constrained scalar (a provider-slug
 * enum, a charset-pinned artifact slug, a boolean, an opaque base64 blob).
 * NO field may carry a command string, script body, args array, URL, or
 * free filesystem path — adding one is a deliberate, reviewable schema
 * change, not something `S.Unknown` admits. A command outside this set
 * fails decode at the parse boundary on BOTH ends (cloud/relay enqueue +
 * the daemon's relay socket) before any handler runs. See
 * `docs/proposals/daemon-os-sandbox-and-typed-control.md` §2.
 *
 * Built once and addressed three ways so the vocabularies can never drift:
 * bare (enqueue validation), `id` (relay delivery wire), `key_id`
 * (dashboard enqueue wire).
 */
const commandVariants = <F extends S.Struct.Fields>(addressing: F) =>
  [
    S.Struct({
      ...addressing,
      kind: S.Literal("connect"),
      payload: ProviderPayload,
    }),
    S.Struct({
      ...addressing,
      kind: S.Literal("connect_device_code"),
      payload: ProviderPayload,
    }),
    S.Struct({
      ...addressing,
      kind: S.Literal("cancel_connect"),
      payload: ProviderPayload,
    }),
    S.Struct({
      ...addressing,
      kind: S.Literal("logout"),
      payload: ProviderPayload,
    }),
    S.Struct({
      ...addressing,
      kind: S.Literal("submit_login_code"),
      payload: SubmitLoginCodePayload,
    }),
    S.Struct({
      ...addressing,
      kind: S.Literal("set_auto_update"),
      payload: SetAutoUpdatePayload,
    }),
    S.Struct({
      ...addressing,
      kind: S.Literal("refresh"),
      payload: S.optional(RefreshPayload),
    }),
    S.Struct({
      ...addressing,
      kind: S.Literal("status"),
      payload: S.optional(EmptyPayload),
    }),
    S.Struct({
      ...addressing,
      kind: S.Literal("update"),
      payload: S.optional(EmptyPayload),
    }),
    // Drop every cached signed plan tuple NOW. The dashboard enqueues this
    // after a successful chain/config save so the very next request bounces
    // through the cloud and picks up the new chain instead of replaying the
    // old one for up to the cache TTL (the "app feels unresponsive to chain
    // reorders" friction). Payload-less and idempotent.
    S.Struct({
      ...addressing,
      kind: S.Literal("bust_plan_cache"),
      payload: S.optional(EmptyPayload),
    }),
    // Force a live model-list re-report NOW. The daemon's model-report
    // throttle mirrors the cloud's 30m `MODEL_CACHE_TTL_MS` — without this
    // command the only way to re-discover models mid-TTL is `openllmd
    // restart`. The dashboard's "Available models" refresh button enqueues
    // this; the executor clears the throttle, re-fetches every connected
    // delegate's list, and POSTs to `/api/daemon/models` BEFORE acking so
    // the subsequent `/v1/models` refetch the dashboard does after the
    // lifecycle frame lands sees the fresh rows. Payload-less and
    // idempotent.
    S.Struct({
      ...addressing,
      kind: S.Literal("refresh_models"),
      payload: S.optional(EmptyPayload),
    }),
    // List vendor-local sessions on this machine for one device CLI
    // (history stores + ~/.openllm/run live.json + in-memory PTYs). Result
    // rides on the command ack / lifecycle.result for the picker.
    S.Struct({
      ...addressing,
      kind: S.Literal("list_local_sessions"),
      payload: ListLocalSessionsPayload,
    }),
  ] as const;

/** The bare `{ kind, payload }` vocabulary — what an enqueue boundary (the
 *  relay's watcher `enqueue` frame, `enqueueCommand` in `packages/api`)
 *  validates before writing a `daemon_commands` row. */
export const DaemonCommandBody = S.Union(...commandVariants({}));
export type TDaemonCommandBody = S.Schema.Type<typeof DaemonCommandBody>;

/** Every kind in the closed vocabulary (the union's discriminants). */
export type TDaemonCommandKind = TDaemonCommandBody["kind"];

/** Runtime literal of the closed command vocabulary — the discriminant only,
 *  no payload. Used by `control-channel.ts`'s `CommandLifecycle` to echo which
 *  command a lifecycle frame is reporting on. The `_kindDriftGuard` below makes
 *  this fail to compile if it ever drifts from the `commandVariants` union, so
 *  the two stay in lockstep without duplicating the payload mapping. */
export const DaemonCommandKind = S.Literal(
  "connect",
  "connect_device_code",
  "cancel_connect",
  "logout",
  "submit_login_code",
  "set_auto_update",
  "refresh",
  "status",
  "update",
  "bust_plan_cache",
  "refresh_models",
  "list_local_sessions",
);
type TDaemonCommandKindLiteral = S.Schema.Type<typeof DaemonCommandKind>;
// Bidirectional assignability assertion: the literal and the union's
// discriminant must be the SAME set. Adding a kind to `commandVariants` without
// adding it here (or vice-versa) breaks this line at compile time.
type _AssertSameKinds = [TDaemonCommandKind] extends [TDaemonCommandKindLiteral]
  ? [TDaemonCommandKindLiteral] extends [TDaemonCommandKind]
    ? true
    : never
  : never;
const _kindDriftGuard: _AssertSameKinds = true;
void _kindDriftGuard;

/** One control command delivered to the daemon over its relay socket.
 *  `id` is `daemon_commands.id` (bigserial), stringified for the wire. */
export const DaemonCommand = S.Union(...commandVariants({ id: S.String }));
export type TDaemonCommand = S.Schema.Type<typeof DaemonCommand>;

/** POST /api/daemon/cmd (dashboard → cloud) — enqueue for a target key
 *  (`key_id` must belong to the session user). */
export const DaemonCmdRequest = S.Union(
  ...commandVariants({ key_id: S.String }),
);
export type TDaemonCmdRequest = S.Schema.Type<typeof DaemonCmdRequest>;

/** A command result the daemon reports back over its relay socket (the
 *  `ack`/`status` frames in `relay.ts` carry these). */
export const DaemonCommandAck = S.Struct({
  id: S.String,
  /** `ack` confirms that the daemon dequeued the command. Terminal outcomes
   * retain the previous ack shape for older relay binaries. */
  status: S.Literal("ack", "done", "not_done", "error"),
  result: S.optional(S.Unknown),
});
export type TDaemonCommandAck = S.Schema.Type<typeof DaemonCommandAck>;

// ─── Daemon control surface (browser → daemon, on localhost) ─────────

export const DaemonProviderConnection = S.Struct({
  provider: S.String,
  connected: S.Boolean,
  /** The vendor CLI the daemon runs is installed on the machine. The daemon
   *  never installs it — installs are user-run (the daemon install script or by
   *  hand); the daemon lazily auto-links its isolated run-view
   *  (~/.openllm/cli/<provider>/) to the host binary. When false the dashboard
   *  prompts the user to (re-)run the daemon installer. Absent means a status
   *  probe failed before it could determine installation state; consumers must
   *  not treat absence as not installed. */
  cli_installed: S.optional(S.Boolean),
  /** Version of the isolated CLI, when installed + readable. */
  cli_version: S.optional(S.String),
  detail: S.optional(S.String),
  last_login_at_ms: S.optional(S.NullOr(S.Number)),
  /** A LIVE device-code flow awaiting the user (codex/kimi on a remote box):
   *  the verification URL + one-time code to surface so the dashboard can
   *  render a synced "open this link, enter this code" panel. Present only
   *  while a flow is pending; cleared the moment the credential lands. The
   *  card flips to Connected automatically on the next status push.
   *
   *  The actionable `url`/`code` are OPTIONAL because the relay REDACTS them
   *  from the broadcast + persisted status for every dashboard EXCEPT the one
   *  that started the login (issue #3 — otherwise the OAuth secret fans out to
   *  every same-user browser). A redacted snapshot carries `{ pending: true,
   *  mode? }` with no url/code; the initiating dashboard receives the full
   *  `{ url, code, mode? }` directly. UIs must treat a missing/empty `url` as
   *  "awaiting authorization" (non-actionable), never auto-opening a flow. */
  pending_auth: S.optional(
    S.NullOr(
      S.Struct({
        url: S.optional(S.String),
        code: S.optional(S.String),
        /** True on a REDACTED snapshot (non-origin watcher / persisted row):
         *  a login is in progress but the actionable url/code were stripped. */
        pending: S.optional(S.Boolean),
        /** `device_code` (codex/kimi: surface URL + one-time code to enter in
         *  the browser, then poll) or `paste_code` (claude headless login:
         *  surface URL, then a paste-back input for the code the hosted
         *  callback page displays). Absent ⇒ `device_code`. */
        mode: S.optional(S.Literal("device_code", "paste_code")),
        /** Browser `req_id` of the login that produced this snapshot. Absent
         *  on daemons predating auth events. Lets a cold status still
         *  correlate to an in-flight `auth.login.*` flow without being the
         *  event itself. */
        flow_id: S.optional(S.String),
        /** Epoch ms when this pending flow was created. Carried on both the
         *  actionable and the REDACTED snapshot so every consumer can expire a
         *  STALE entry (older than {@link PENDING_AUTH_TTL_MS}) without needing
         *  the daemon to re-push. The daemon persists its whole status snapshot
         *  to `api_key_activity.daemon_status_json`; an abandoned/never-completed
         *  login (or a daemon restart that drops the live child) would otherwise
         *  leave a dead `pending_auth` in that row forever, and the dashboard
         *  would re-surface + auto-open a sign-in flow that no longer exists on
         *  every cold load. Absent on daemons predating this field. */
        started_at_ms: S.optional(S.Number),
      }),
    ),
  ),
  /** Metadata-only usage snapshot for a CONNECTED provider, read locally by
   *  the daemon and pushed with its status. Absent when not connected or the
   *  read failed. */
  usage: S.optional(S.NullOr(ProviderUsageSnapshot)),
  /** Obscured vendor-account identity for a CONNECTED provider:
   *  sha256("openllm-account-v1:<provider>:<stable-account-id>") over the
   *  stable account id the vendor CLI stores locally (Anthropic's
   *  accountUuid, ChatGPT's account_id, Kimi's user_id, Grok's user_id).
   *  Lets the cloud key usage-meter series per ACCOUNT — two devices on the
   *  same account share the hash; a second account on the same provider gets
   *  its own — without ever shipping the raw vendor id off-box. Absent when
   *  not connected or unreadable, and on daemons predating it. See
   *  docs/proposals/inferred-subscription-usage-calibration.md §10. */
  account_hash: S.optional(S.String),
});
export type TDaemonProviderConnection = S.Schema.Type<
  typeof DaemonProviderConnection
>;

/**
 * A `pending_auth` self-expires after this. The login ceiling
 * (`DEFAULT_LOGIN_TIMEOUT_MS`, 5 min) reaps the live child and the
 * background-exit cleanup clears the entry on a clean run; this TTL is the
 * BACKSTOP for when that cleanup never runs (daemon restart, a browser-OAuth
 * child with no hard ceiling that the user never completes). Comfortably above
 * any real human login so a still-live flow is never expired early, yet short
 * enough that a stale entry surfaced on a later cold load is dropped rather than
 * re-opening a dead sign-in dialog. Shared by the daemon (in-memory expiry) and
 * the browser (mirror expiry against the persisted `started_at_ms`). */
export const PENDING_AUTH_TTL_MS = 10 * 60_000;

// Outcome of the daemon's last cloud bootstrap — drives the dashboard's
// 3-state Providers UI: needs a key (`no_key`/`invalid_key`) → show the
// API-key picker; `unreachable` → retry hint; `ok` → provider cards.
export const DaemonCloudState = S.Literal(
  "ok",
  "no_key",
  "invalid_key",
  "unreachable",
);
export type TDaemonCloudState = S.Schema.Type<typeof DaemonCloudState>;

/**
 * The openllm CLI's presence on this box, as the daemon already knows it from
 * its auto-update loop (`cli-self-update.ts`) — no probe scripts, no per-client
 * walk. This is the ONLY install state the dashboard needs now: clients are
 * configured at RUN time by `openllm <client>`, so there is nothing per-client
 * to install, stamp, or diverge.
 */
export const DaemonCliState = S.Struct({
  installed: S.Boolean,
  /** Version the installed binary reports; absent when it can't be read. */
  version: S.optional(S.NullOr(S.String)),
});
export type TDaemonCliState = S.Schema.Type<typeof DaemonCliState>;

// GET /status
export const DaemonStatus = S.Struct({
  daemon_version: S.String,
  /** Whether an sk-llm key is set (the daemon installs keyless). */
  key_configured: S.Boolean,
  /** Whether automatic self-update is enabled (OPT-OUT, default on). Drives the
   *  dashboard's auto-update switch; toggled via the `set_auto_update` command.
   *  Absent on daemons too old to report it — those always self-updated, so the
   *  switch then reads as on. See `packages/daemon/src/auto-update-pref.ts`. */
  auto_update: S.optional(S.Boolean),
  /** Whether remote PTY sessions are enabled (OPT-IN, default off). Local-only
   *  toggle — `openllmd sessions on|off` or the install flag; deliberately NO
   *  relay command can flip it. Absent on daemons too old to gate (those serve
   *  sessions unconditionally). See `packages/daemon/src/pty-sessions-pref.ts`. */
  pty_sessions: S.optional(S.Boolean),
  /** Result of the last bootstrap — see `DaemonCloudState`. */
  cloud_state: DaemonCloudState,
  /** This daemon's X25519 public key (SPKI DER, base64). Lets ANOTHER of the
   *  user's daemons SEAL a Claude setup-token to it for cross-machine copy
   *  (`/api/daemon/relay-credential`) — the cloud only ever relays ciphertext.
   *  Absent on daemons too old to publish one. */
  pubkey: S.optional(S.String),
  /** The loopback port this daemon's `/v1/*` + `/whoami` surface listens on
   *  (`OPENLLM_DAEMON_PORT`, default 8787). The dashboard probes
   *  `http://127.0.0.1:<port>/whoami` to learn which key's daemon is on THIS
   *  host — the single authoritative locality signal (answering your own
   *  loopback proves your own machine). Absent on daemons too old to publish
   *  it; the probe falls back to the default port. See
   *  `docs/proposals/this-machine-detection-audit.md`. */
  port: S.optional(S.Number),
  /** The OS-sandbox posture this daemon booted with (`sandbox/landlock.ts`):
   *  `enforced` (Landlock active), `off` (kill switch / dev opt-out),
   *  `unsupported` (non-Linux, or a kernel without Landlock — the systemd
   *  unit hardening may still confine the service), `error` (setup failed —
   *  fail-open, surfaced so an unconfined daemon is visible, not silent).
   *  Absent on daemons too old to report it. */
  sandbox: S.optional(S.Literal("enforced", "off", "unsupported", "error")),
  connections: S.Array(DaemonProviderConnection),
  /** The openllm CLI on this box. Absent on daemons too old to report it. */
  cli: S.optional(DaemonCliState),
  /** Advertised transport capabilities, retained in fleet status telemetry. */
  caps: S.optional(S.Array(S.String)),
  /** Whether this daemon can host device chat sessions (PTY — POSIX only;
   *  false on win32). Absent on daemons too old to report it — the
   *  dashboard then hides the device variant for this box. */
  pty_supported: S.optional(S.Boolean),
  /** Live/dormant device sessions hosted on this box (feature §2.2) —
   *  lets the dashboard mark which sessions can `attach` vs `continue`. */
  sessions: S.optional(
    S.Array(
      S.Struct({
        /** Local daemon session id; independent of the mux SessionId validator. */
        id: S.String.pipe(S.minLength(1), S.maxLength(128)),
        // Same closed vocabulary as the mux `SessionStreamOpenPayload.cli`.
        cli: DeviceSessionCli,
        started_at_ms: S.Number,
        /** A consumer channel is currently bound. */
        attached: S.Boolean,
        /** The PTY is still running (attach re-binds; false → continue). */
        live: S.Boolean,
        /** Best-effort process-tree activity signal for dormant sessions. */
        busy: S.optional(S.Boolean),
        /** User-visible session label, bounded for presence snapshots. */
        title: S.optional(SessionTitleField),
        /** Terminal reason retained for a dead resumable session. */
        last_exit_reason: S.optional(SessionExitReason),
        /** Vendor resume id when known (local history / resume spawn). */
        vendor_session_id: S.optional(
          S.NullOr(S.String.pipe(S.maxLength(128))),
        ),
      }),
    ).pipe(S.maxItems(32)),
  ),
});
export type TDaemonStatus = S.Schema.Type<typeof DaemonStatus>;

/**
 * Canonical payload the cloud HMAC-signs for the same-machine 307, and the
 * daemon re-derives to verify it (proposals: same-machine-307-redirect §9 +
 * daemon-presence-without-heartbeat). Order + separators are load-bearing —
 * both sides MUST assemble it identically, so it lives here, shared. Covers:
 * the ordered `__plan` (provider/model ids), the parallel `__pmids` (concrete
 * upstream `provider_model_id`s, so the daemon serves catalog-free), and the
 * `__origin` (the deployment that issued the 307, so the daemon forwards +
 * records back to it). Signing the lot makes the upstream ids and the
 * forward/record target tamper-evident.
 */
export const daemonPlanSigningPayload = (
  plan: string,
  providerModelIds: string,
  origin: string,
  contextOverflowStrategy?: TContextOverflowStrategy | null,
): string =>
  contextOverflowStrategy === undefined || contextOverflowStrategy === null
    ? `${plan}\n${providerModelIds}\n${origin}`
    : `${plan}\n${providerModelIds}\n${origin}\n${contextOverflowStrategy}`;

// ─── GET /api/daemon/plan (daemon → cloud) ───────────────────────────
//
// The local-first gateway's plan fetch: the SAME signed tuple a
// same-machine 307 carries in its query, returned as JSON so a daemon
// serving a DIRECT client request can obtain a plan without the request
// body transiting the cloud. The daemon verifies `sig` with the
// bootstrap-delivered per-user key (`planSignatureOk`) before caching or
// executing — the endpoint earns no more trust than a 307 does. See
// `docs/proposals/local-first-gateway.md` §4.1.
export const DaemonPlanResponse = S.Struct({
  /** Comma-joined ordered `provider/model` chain (the 307's `__plan`). */
  plan: S.String,
  /** Parallel concrete `provider_model_id`s (the 307's `__pmids`). */
  pmids: S.String,
  /** The issuing deployment's origin (the 307's `__origin`). */
  origin: S.String,
  /** Context-overflow strategy for this plan. Absent means hop-to-larger-context. */
  context_overflow_strategy: S.optional(ContextOverflowStrategy),
  /** HMAC over the canonical payload; null when the cloud has no signing
   *  secret configured (dev) — the daemon then treats it as unsigned. */
  sig: S.NullOr(S.String),
});
export type TDaemonPlanResponse = S.Schema.Type<typeof DaemonPlanResponse>;

/** Header a managed client sets when it FOLLOWED a 307 to its loopback and
 *  the daemon refused (stopped/crashed): "route me without the daemon", so the
 *  cloud skips subscription hops and serves the API-key fallthrough (§7.1). */
export const NO_DAEMON_HEADER = "x-openllm-no-daemon";

/** Headers the daemon stamps on EVERY cloud control call (poll/status/bootstrap
 *  /requests/relay/search) so the cloud can record which device a key's daemon
 *  runs on — `api_key_activity.device_id`/`device_label`. The id is the daemon's
 *  stable opaque per-machine UUID (`OPENLLM_DEVICE_ID` in `~/.openllm/.env`); the label is the
 *  host's `os.hostname()` for the dashboard to show. Both metadata-only (no
 *  token, no content). Lets the dashboard tell two daemons behind one NAT apart
 *  — device code + IP, not IP alone. See
 *  `docs/proposals/daemon-device-aware-this-machine.md`. */
export const DAEMON_DEVICE_ID_HEADER = "x-openllm-device-id";
export const DAEMON_DEVICE_LABEL_HEADER = "x-openllm-device-label";

/** Header a BROWSER client (the dashboard "Try" card) sets to ask the cloud to
 *  describe a daemon redirect as a readable `200 { redirect, location }` JSON
 *  instead of a `307`. A browser `fetch` can't read a cross-origin 307 (it
 *  comes back as an opaqueredirect: status 0, no headers), so it can never
 *  follow the daemon hop itself. With this header the card reads `location` and
 *  fetches the daemon directly. Non-browser clients omit it and get the 307. */
export const REDIRECT_JSON_HEADER = "x-openllm-redirect-json";

// POST /config/api-key — set/update the daemon's sk-llm key after install.
export const DaemonSetApiKeyRequest = S.Struct({
  api_key: S.String,
});
export type TDaemonSetApiKeyRequest = S.Schema.Type<
  typeof DaemonSetApiKeyRequest
>;

export const DaemonSetApiKeyResponse = S.Struct({
  key_configured: S.Boolean,
  cloud_state: DaemonCloudState,
});
export type TDaemonSetApiKeyResponse = S.Schema.Type<
  typeof DaemonSetApiKeyResponse
>;

// POST /connect/:slug
export const DaemonConnectResponse = S.Struct({
  provider: S.String,
  connected: S.Boolean,
  detail: S.optional(S.String),
  /**
   * True when `connect` kicked off an async flow that hasn't finished yet
   * (Kimi's device-code login: browser opened, daemon polling in the
   * background). `detail` is then INFORMATIONAL guidance, not an error —
   * the UI renders it neutrally and the status stream flips to connected
   * when the flow completes. Absent/false on terminal results.
   */
  pending: S.optional(S.Boolean),
});
export type TDaemonConnectResponse = S.Schema.Type<
  typeof DaemonConnectResponse
>;

// GET /usage/:slug — reuses the existing snapshot shape verbatim.
export const DaemonUsageResponse = S.Struct({
  provider: S.String,
  snapshot: ProviderUsageSnapshot,
});
export type TDaemonUsageResponse = S.Schema.Type<typeof DaemonUsageResponse>;
