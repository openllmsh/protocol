/** Parse a daemon port from an env-file compatible scalar. */
export const parseOpenllmDaemonPort = (
  raw: string,
  fallback: number,
): number => {
  const trimmed = raw.trim();
  const unquoted =
    trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2
      ? trimmed.slice(1, -1)
      : trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2
        ? trimmed.slice(1, -1)
        : trimmed;
  const stripped = unquoted.replace(/^(.*)\s#.*$/, "$1").trim();
  if (!/^\d+$/.test(stripped)) return fallback;
  const parsed = Number.parseInt(stripped, 10);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 65535
    ? parsed
    : fallback;
};
