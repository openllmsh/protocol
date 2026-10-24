/**
 * Loopback device-control surface — the TOFU-free way to pin a daemon's
 * device-control key and read its X25519 identity.
 *
 * The desktop app (or a local CLI) reaches these on `127.0.0.1` with the
 * boot's local control capability, the same admission as `/local/agent`.
 * Because the caller is on the machine, neither value crosses the cloud, so
 * neither is trust-on-first-use:
 *
 * - `GET  /local/identity`       → the daemon's X25519 key (`dpk`) for the
 *   browser to attest with its control key;
 * - `POST /local/device-control` → pin the account control public key
 *   directly (`via: "local"`, an anchored pin).
 */
import { Schema as S } from "effect";

export const IDENTITY_LOCAL_PATH = "/local/identity";
export const DEVICE_CONTROL_LOCAL_PATH = "/local/device-control";
export const DEVICE_CONTROL_LOCAL_MAX_BODY_BYTES = 1024;

/** The daemon's device-control pin as reported locally / in `DaemonStatus`. */
export const DeviceAccessPinReport = S.Struct({
  fp: S.String.pipe(S.maxLength(64)),
  kind: S.Literal("control", "legacy"),
  via: S.optional(S.Literal("anchor", "tofu", "local", "rotation")),
});
export type TDeviceAccessPinReport = S.Schema.Type<
  typeof DeviceAccessPinReport
>;

/**
 * `DaemonStatus.device_sessions` — the remote device (agent) session switch
 * and the daemon's proof of its X25519 key.
 *
 * - `anchored`: the pin descends from a local trust root (install anchor,
 *   loopback). False → agent sessions fail closed with
 *   `device_not_anchored`; offer "Set up device sessions".
 * - `enabled`: remote device sessions are on (fresh installs: off).
 * - `locked`: installed with `--lock-device-sessions` — a remote enable is
 *   refused; only `openllm device enable` on the machine turns it on.
 * - `dpk_proof`: `HMAC-SHA256(pair_secret, "openllm-dpk-proof-v1" ||
 *   key_id || pubkey)`, base64url. Verify with `@openllm/vault`
 *   `verifyDpkProof` BEFORE using `DaemonStatus.pubkey` as `dpk`. Absent when
 *   the daemon holds no anchor for the key it runs on.
 */
export const DeviceSessionsReport = S.Struct({
  anchored: S.Boolean,
  enabled: S.Boolean,
  locked: S.Boolean,
  dpk_proof: S.optional(S.String.pipe(S.maxLength(64))),
});
export type TDeviceSessionsReport = S.Schema.Type<typeof DeviceSessionsReport>;

/** `GET /local/identity` response. */
export const LocalIdentityResponse = S.Struct({
  /** This daemon's X25519 public key (SPKI DER, base64) — `DaemonStatus.pubkey`. */
  pubkey: S.String,
  /** `keyFingerprint(pubkey)` — what `openllm daemon identity` prints. */
  fingerprint: S.String,
  device_access_pin: S.NullOr(DeviceAccessPinReport),
  /** Same as `DaemonStatus.device_sessions`. Absent on older daemons. */
  device_sessions: S.optional(DeviceSessionsReport),
});
export type TLocalIdentityResponse = S.Schema.Type<
  typeof LocalIdentityResponse
>;

/** `POST /local/device-control` body. */
export const LocalDeviceControlRequest = S.Struct({
  /** The account control public key (Ed25519 SPKI DER, base64). */
  device_control_pubkey: S.String.pipe(S.minLength(1), S.maxLength(64)),
  /** Its generation (`users.device_control_version`), when known. */
  version: S.optional(
    S.NullOr(S.Number.pipe(S.int(), S.greaterThanOrEqualTo(1))),
  ),
});
export type TLocalDeviceControlRequest = S.Schema.Type<
  typeof LocalDeviceControlRequest
>;
