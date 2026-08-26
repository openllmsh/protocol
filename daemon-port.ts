/** Parse a daemon port from an env-file compatible scalar. */
export const parseOpenllmDaemonPort = (
  raw: string,
  fallback: number,
): number => {
  const trimmed = raw.trim();
  // Strip an inline `# comment` suffix BEFORE outer quotes so a quoted value
  // followed by a comment (`"59321" # local`) unwraps to its number rather than
  // failing on the trailing quote.
  const decommented = trimmed.replace(/^(.*)\s#.*$/, "$1").trim();
  const unquoted =
    decommented.startsWith('"') &&
    decommented.endsWith('"') &&
    decommented.length >= 2
      ? decommented.slice(1, -1)
      : decommented.startsWith("'") &&
          decommented.endsWith("'") &&
          decommented.length >= 2
        ? decommented.slice(1, -1)
        : decommented;
  const stripped = unquoted.trim();
  if (!/^\d+$/.test(stripped)) return fallback;
  const parsed = Number.parseInt(stripped, 10);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 65535
    ? parsed
    : fallback;
};
