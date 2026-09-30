import { Schema as S } from "effect";

/** A successful installer still needs a subsequent CLI presence probe. */
export const VENDOR_CLI_DETECTION_GRACE_MS = 2 * 60_000;
/** Old persisted progress is not evidence that an installer is still running. */
export const VENDOR_CLI_INSTALL_STALE_MS = 30 * 60_000;

/** Metadata for vendor installers started by OpenLLM, not external installs. */
export const VendorCliInstall = S.Struct({
  attempt_id: S.String.pipe(S.minLength(1), S.maxLength(128)),
  stage: S.Literal("installing", "awaiting_detection", "failed", "interrupted"),
  started_at_ms: S.NonNegativeInt,
  updated_at_ms: S.NonNegativeInt,
  reason: S.optional(
    S.Literal("installer_failed", "interrupted", "detection_timeout"),
  ),
});
export type TVendorCliInstall = S.Schema.Type<typeof VendorCliInstall>;
