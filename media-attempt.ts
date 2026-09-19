/**
 * Media chain advance vs terminal — no chat-style timeout/5xx retry.
 */

export const MEDIA_ADVANCE_ERROR_CODES = [
  "missing_credential",
  "model_unavailable",
  "auth_error",
  "quota_exhausted",
  "rate_limited",
] as const;
export type TMediaAdvanceErrorCode = (typeof MEDIA_ADVANCE_ERROR_CODES)[number];

export type TMediaAdvanceReason = TMediaAdvanceErrorCode;
export type TMediaTerminalReason =
  | "cancelled"
  | "timeout_after_submit"
  | "network_after_submit"
  | "uncertain_server_failure"
  | "accepted_success"
  | "output_delivered"
  | "persistence_after_success"
  | "caller_error";

export type TMediaAttemptFacts = {
  readonly dispatched: boolean;
  readonly cancelled?: boolean;
  readonly timeout?: boolean;
  readonly networkReset?: boolean;
  readonly httpStatus?: number;
  readonly errorCode?: string;
  readonly accepted?: boolean;
  readonly outputDelivered?: boolean;
  readonly persistenceFailed?: boolean;
};

export type TMediaAdvanceDecision =
  | { readonly action: "advance"; readonly reason: TMediaAdvanceReason }
  | { readonly action: "terminal"; readonly reason: TMediaTerminalReason };

const isAdvanceCode = (code: string | undefined): code is TMediaAdvanceReason =>
  code !== undefined &&
  (MEDIA_ADVANCE_ERROR_CODES as ReadonlyArray<string>).includes(code);

export const decideMediaChainAdvance = (
  facts: TMediaAttemptFacts,
): TMediaAdvanceDecision => {
  if (facts.cancelled === true) {
    return { action: "terminal", reason: "cancelled" };
  }
  if (facts.outputDelivered === true) {
    return { action: "terminal", reason: "output_delivered" };
  }
  const accepted =
    facts.accepted === true ||
    (facts.httpStatus !== undefined &&
      facts.httpStatus >= 200 &&
      facts.httpStatus < 300);
  if (accepted) {
    return {
      action: "terminal",
      reason:
        facts.persistenceFailed === true
          ? "persistence_after_success"
          : "accepted_success",
    };
  }
  if (facts.dispatched && facts.timeout === true) {
    return { action: "terminal", reason: "timeout_after_submit" };
  }
  if (facts.dispatched && facts.networkReset === true) {
    return { action: "terminal", reason: "network_after_submit" };
  }
  if (
    facts.dispatched &&
    facts.httpStatus !== undefined &&
    facts.httpStatus >= 500
  ) {
    return { action: "terminal", reason: "uncertain_server_failure" };
  }
  if (isAdvanceCode(facts.errorCode)) {
    if (facts.errorCode === "missing_credential" && facts.dispatched) {
      return { action: "terminal", reason: "caller_error" };
    }
    return { action: "advance", reason: facts.errorCode };
  }
  return { action: "terminal", reason: "caller_error" };
};
