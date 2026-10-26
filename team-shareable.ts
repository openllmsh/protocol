/**
 * Vendor-terms hook for team sharing (docs/plan/2026-10-26-teams.md §8).
 *
 * Checked at origin (catalog + share selection) and again on the contributor
 * daemon at grant admit. v1 returns true for every provider; terms rules plug
 * in later without a protocol change. Shared here so api and daemon cannot
 * drift.
 */
export const teamShareable = (_provider: string): boolean => true;
