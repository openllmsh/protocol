import { Schema as S } from "effect";
import { DaemonCommand, DaemonCommandAck } from "./daemon";

// ─── Daemon relay (push over a Sandbox WebSocket fed by Neon CDC) ─────
//
// Replaces the `GET /api/daemon/poll` long-poll transport with a
// persistent WebSocket each end (daemon AND browser) holds to a relay
// running in a Vercel Sandbox. The relay consumes Neon logical
// replication off `daemon_commands` and pushes each new row down the
// matching daemon socket; daemon acks + status fan out to the user's open
// dashboards. The data model (one `sk-llm` key, `api_key_activity`,
// `daemon_commands`) is unchanged — only the transport. See
// `docs/proposals/daemon-relay-websocket-push.md`.

/** Which end a connect ticket authorizes. A `daemon` socket receives
 *  commands for its `key_id` and sends acks/status; a `watcher` socket
 *  (a dashboard tab) enqueues commands for keys its `user_id` owns and
 *  receives status/presence pushes. */
export const RelayRole = S.Literal("daemon", "watcher");
export type TRelayRole = S.Schema.Type<typeof RelayRole>;

/** Domain-separation label for the connect-ticket HMAC. Shared by the cloud
 *  signer (`packages/api/lib/relay-ticket.ts`) and the relay verifier
 *  (`packages/daemon-relay/src/ticket.ts`) so the two can never drift. */
export const RELAY_TICKET_LABEL = "openllm-relay-ticket-v1";

/** The port the in-sandbox WS server listens on — declared in `ports` at
 *  `Sandbox.getOrCreate` (cloud) and bound by the relay. A fixed internal
 *  constant (the public surface is the sandbox's own domain), shared so the
 *  provisioner's `sandbox.domain(port)` and the relay's listener agree. */
export const RELAY_PORT = 8080;

export type TRelayDatabaseTarget = "pre-production" | "production";

/**
 * The relay identity (sandbox name + TTL class) for the current deployment,
 * derived from `VERCEL_ENV` — the only remaining discriminator now that a
 * single `DATABASE_URL_UNPOOLED` selects the Neon database per environment
 * (Vercel injects the matching value in each env; local dev points it at the
 * dev branch). `production` only on the Vercel production deployment;
 * everything else (preview, `vercel dev`, plain `next dev`, tests) is
 * `pre-production`. Pure (a function of its input) so the DB client, the cloud
 * provisioner, and the in-sandbox relay all agree from the same signal.
 */
export const resolveDatabaseTarget = (
  vercelEnv: string | undefined,
): TRelayDatabaseTarget =>
  vercelEnv === "production" ? "production" : "pre-production";

/** The Neon logical-replication publication + slot names. Plain per-database
 *  constants: each environment is its own Neon branch, so the names never
 *  collide and need no target suffix. The migration that creates them
 *  (`packages/db/migrations/*_daemon_relay_cdc.sql`) uses these literals; the
 *  relay subscribes them. See proposal §4.1 + Phase 0. */
export const RELAY_PUBLICATION = "daemon_relay_pub";
export const RELAY_SLOT = "daemon_relay_slot";

/** The per-environment relay identity. The SANDBOX name is target-scoped
 *  (sandbox names share one Vercel-project namespace); the publication/slot are
 *  the per-DB constants above. Pure derivation (no env, no I/O) so the cloud
 *  provisioner and the relay agree. */
export type TRelayNames = {
  readonly relayName: string;
  readonly pubName: string;
  readonly slotName: string;
};

export const relayNamesFor = (target: TRelayDatabaseTarget): TRelayNames => ({
  relayName: `daemon-relay-${target}`,
  pubName: RELAY_PUBLICATION,
  slotName: RELAY_SLOT,
});

/**
 * The decoded claims of a connect ticket. The cloud (`/api/daemon/channel`)
 * mints these after validating the caller (`sk-llm` key → `daemon`, Neon
 * Auth session → `watcher`) and HMAC-signs them; the relay verifies the
 * signature and trusts these claims (it does NO DB-side auth in the
 * Sandbox). `key_id` is present iff `role === "daemon"`. `exp` is a unix-ms
 * deadline kept short (~60s) so a leaked ticket is near-useless.
 */
export const RelayTicketClaims = S.Struct({
  role: RelayRole,
  user_id: S.String,
  key_id: S.optional(S.String),
  exp: S.Number,
});
export type TRelayTicketClaims = S.Schema.Type<typeof RelayTicketClaims>;

/** GET /api/daemon/channel → the live relay WSS URL + a connect ticket. Both
 *  daemon and browser dial `wss_url`, presenting `ticket` in their first
 *  `hello` frame. The URL is the sandbox's own domain (`wss://<sandbox-host>`);
 *  it can rotate when the relay cycles, so clients re-fetch this on every
 *  (re)connect rather than caching the host. */
export const RelayChannelResponse = S.Struct({
  wss_url: S.String,
  /** Short-lived HMAC connect ticket (opaque `<b64url(claims)>.<hmac>`). */
  ticket: S.String,
});
export type TRelayChannelResponse = S.Schema.Type<typeof RelayChannelResponse>;

// ─── WebSocket frame envelope ────────────────────────────────────────
//
// One tagged union shared by all four parties. Each variant documents its
// direction; a given end only emits the subset it owns and ignores the
// rest. JSON over text frames.

/** client → relay (first frame). A daemon may piggyback its initial
 *  status snapshot; a watcher sends ticket only. */
export const RelayHelloFrame = S.Struct({
  type: S.Literal("hello"),
  ticket: S.String,
  /** Daemon only: initial per-provider `TDaemonStatus` snapshot, folded
   *  into `api_key_activity.daemon_status_json` on connect. */
  status: S.optional(S.Unknown),
});
export type TRelayHelloFrame = S.Schema.Type<typeof RelayHelloFrame>;

/** relay → client. Handshake accepted; carries the current presence snapshot so
 *  a freshly-attached dashboard paints immediately. */
export const RelayWelcomeFrame = S.Struct({
  type: S.Literal("welcome"),
  /** Watcher only: the AUTHORITATIVE set of the user's key ids that have a live
   *  daemon socket on the relay right now, from its in-memory registry. The
   *  dashboard treats membership as presence — keys absent here are offline by
   *  authority of the relay that owns every socket — so a stale-`true`
   *  `api_key_activity` row (ungraceful relay death) is corrected the instant a
   *  watcher (re)connects. Live status keeps flowing via `status_push`. */
  snapshot: S.optional(S.Array(S.String)),
});
export type TRelayWelcomeFrame = S.Schema.Type<typeof RelayWelcomeFrame>;

/** relay → daemon. One command to run (fed by the replication stream or a
 *  connect-time replay of pending rows). */
export const RelayCommandFrame = S.Struct({
  type: S.Literal("command"),
  command: DaemonCommand,
});
export type TRelayCommandFrame = S.Schema.Type<typeof RelayCommandFrame>;

/** daemon → relay. A command result; the relay writes it to
 *  `daemon_commands.status` + `result`. */
export const RelayAckFrame = S.Struct({
  type: S.Literal("ack"),
  ack: DaemonCommandAck,
});
export type TRelayAckFrame = S.Schema.Type<typeof RelayAckFrame>;

/** daemon → relay. Heartbeat + per-provider snapshot (mirrors the old
 *  `POST /api/daemon/status` body). `active:false` is the graceful-exit
 *  beacon. The relay writes `api_key_activity` and fans the snapshot out to
 *  the user's watchers. */
export const RelayStatusFrame = S.Struct({
  type: S.Literal("status"),
  active: S.optional(S.Boolean),
  status: S.optional(S.Unknown),
  acks: S.optional(S.Array(DaemonCommandAck)),
});
export type TRelayStatusFrame = S.Schema.Type<typeof RelayStatusFrame>;

/** watcher → relay. The dashboard enqueues a control command for one of the
 *  user's keys (replaces `POST /api/daemon/cmd`). The relay verifies the
 *  watcher's `user_id` owns `key_id`, then writes the durable
 *  `daemon_commands` row. `req_id` correlates the relay's `enqueue_ack` so the
 *  browser learns the row id / any error; omit it for fire-and-forget. */
export const RelayEnqueueFrame = S.Struct({
  type: S.Literal("enqueue"),
  req_id: S.optional(S.String),
  key_id: S.String,
  kind: S.String,
  payload: S.optional(S.Unknown),
});
export type TRelayEnqueueFrame = S.Schema.Type<typeof RelayEnqueueFrame>;

/** relay → watcher. The result of an `enqueue` carrying a `req_id`: the new
 *  `daemon_commands` id on success, or an error (e.g. the key isn't owned). */
export const RelayEnqueueAckFrame = S.Struct({
  type: S.Literal("enqueue_ack"),
  req_id: S.String,
  ok: S.Boolean,
  id: S.optional(S.String),
  error: S.optional(S.String),
});
export type TRelayEnqueueAckFrame = S.Schema.Type<typeof RelayEnqueueAckFrame>;

/** relay → watcher. A daemon's status snapshot for one key landed; push it
 *  to the dashboard. */
export const RelayStatusPushFrame = S.Struct({
  type: S.Literal("status_push"),
  key_id: S.String,
  status: S.Unknown,
});
export type TRelayStatusPushFrame = S.Schema.Type<typeof RelayStatusPushFrame>;

/** relay → watcher. A key's daemon presence flipped (socket open/close). */
export const RelayPresenceFrame = S.Struct({
  type: S.Literal("presence"),
  key_id: S.String,
  active: S.Boolean,
});
export type TRelayPresenceFrame = S.Schema.Type<typeof RelayPresenceFrame>;

/** Keepalive (both directions). The relay pings below Cloudflare's
 *  proxied-WS idle bound; a missed pong is the relay's dead-peer signal. */
export const RelayPingFrame = S.Struct({ type: S.Literal("ping") });
export type TRelayPingFrame = S.Schema.Type<typeof RelayPingFrame>;

export const RelayPongFrame = S.Struct({ type: S.Literal("pong") });
export type TRelayPongFrame = S.Schema.Type<typeof RelayPongFrame>;

// NOTE: older daemon binaries also sent `received` (a per-command delivery
// receipt) and `resync` (a periodic "re-push my pending rows" floor). Both are
// retired: delivery is now marked optimistically on push and recovered by the
// relay's own periodic sweep over non-terminal rows, so neither frame has a
// consumer. They are deliberately NOT in the union — an old daemon's frames
// fail decode and are silently dropped (`parseFrame` → null), which is the
// designed legacy tolerance.

/** The full frame union, discriminated on `type`. */
export const RelayFrame = S.Union(
  RelayHelloFrame,
  RelayWelcomeFrame,
  RelayCommandFrame,
  RelayAckFrame,
  RelayStatusFrame,
  RelayEnqueueFrame,
  RelayEnqueueAckFrame,
  RelayStatusPushFrame,
  RelayPresenceFrame,
  RelayPingFrame,
  RelayPongFrame,
);
export type TRelayFrame = S.Schema.Type<typeof RelayFrame>;
