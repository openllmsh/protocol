import { Schema as S } from "effect";

// ─── Subscription auth lifecycle (daemon ↔ relay ↔ dashboard) ─────────
//
// Explicit login / session events. Distinct from `CommandState` /
// `command_lifecycle` (those are the command RECEIPT — enqueue finished,
// not "Connected"). Success is `auth.login.succeeded`, not a status
// snapshot with `connected: true`. Cancel is `auth.login.failed` with
// `code: "user_cancelled"`, never a sixth event.
//
// `flow_id` is the browser `req_id` minted at enqueue — do not invent a
// second id. `auth.session.lost` has no flow: it is the falling edge of a
// previously-connected provider.
//
// See `docs/audit/2026-08-21-subscription-auth-login-trigger-finalize.md` §6.

export const AuthLoginFailedCode = S.Literal(
  "not_installed",
  "spawn_denied",
  "prompt_timeout",
  "cli_crash",
  "poll_expired",
  "relay_disconnected",
  "user_cancelled",
);
export type TAuthLoginFailedCode = S.Schema.Type<typeof AuthLoginFailedCode>;

export const AuthLoginMode = S.Literal("browser", "device_code", "paste_code");
export type TAuthLoginMode = S.Schema.Type<typeof AuthLoginMode>;

export const AuthSessionLostReason = S.Literal(
  "logout",
  "credential_gone",
  "vendor_revoked",
);
export type TAuthSessionLostReason = S.Schema.Type<
  typeof AuthSessionLostReason
>;

/** After the vendor CLI spawn succeeded. */
export const AuthLoginStarted = S.Struct({
  event: S.Literal("auth.login.started"),
  flow_id: S.String,
  key_id: S.String,
  slug: S.String,
  mode: AuthLoginMode,
});
export type TAuthLoginStarted = S.Schema.Type<typeof AuthLoginStarted>;

/** Origin-only payload: verification URL + optional device/paste code. */
export const AuthLoginPrompt = S.Struct({
  event: S.Literal("auth.login.prompt"),
  flow_id: S.String,
  key_id: S.String,
  slug: S.String,
  url: S.String,
  code: S.optional(S.String),
  mode: AuthLoginMode,
});
export type TAuthLoginPrompt = S.Schema.Type<typeof AuthLoginPrompt>;

/** Credential readable for THIS flow. */
export const AuthLoginSucceeded = S.Struct({
  event: S.Literal("auth.login.succeeded"),
  flow_id: S.String,
  key_id: S.String,
  slug: S.String,
  account_hash: S.optional(S.String),
});
export type TAuthLoginSucceeded = S.Schema.Type<typeof AuthLoginSucceeded>;

/**
 * Terminal failure. There is no `auth.login.cancelled` event — cancel is
 * this variant with `code: "user_cancelled"`.
 */
export const AuthLoginFailed = S.Struct({
  event: S.Literal("auth.login.failed"),
  flow_id: S.String,
  key_id: S.String,
  slug: S.String,
  code: AuthLoginFailedCode,
  message: S.String,
  retryable: S.Boolean,
});
export type TAuthLoginFailed = S.Schema.Type<typeof AuthLoginFailed>;

/** Falling edge after a prior connected. Not a login attempt — no `flow_id`. */
export const AuthSessionLost = S.Struct({
  event: S.Literal("auth.session.lost"),
  key_id: S.String,
  slug: S.String,
  reason: AuthSessionLostReason,
  account_hash: S.optional(S.String),
});
export type TAuthSessionLost = S.Schema.Type<typeof AuthSessionLost>;

/** Discriminated on `event`. */
export const AuthEvent = S.Union(
  AuthLoginStarted,
  AuthLoginPrompt,
  AuthLoginSucceeded,
  AuthLoginFailed,
  AuthSessionLost,
);
export type TAuthEvent = S.Schema.Type<typeof AuthEvent>;
