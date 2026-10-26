import { isLocalProvider } from "./local-provider";

/**
 * Team shareability gate (docs/plan/2026-10-26-teams.md §8).
 *
 * Checked at origin (catalog + share selection + upsert) and again on the
 * contributor daemon at grant admit. Shared here so api and daemon cannot
 * drift.
 *
 * v1 allows only daemon-only classes — oauth subscription and local server
 * providers (`isLocalProvider`). API-key / custom endpoint sharing is
 * deferred (plan §15 Later). Vendor-terms rules plug in later as an
 * additional conjunct without a protocol change.
 */
export const teamShareable = (provider: string): boolean =>
  isLocalProvider(provider);
