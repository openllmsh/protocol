/**
 * Classifiers and validation for custom upstream URLs.
 *
 * `isLocalEndpoint` is intentionally a pure, synchronous classifier: browser
 * routing and daemon-local code need to answer whether a literal URL names the
 * local network without doing DNS. Hosted code must use
 * `isSafeRemoteEndpoint` immediately before connecting; it resolves public
 * names and rejects answers in non-public address space.
 */

/** `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`. */
const isRfc1918 = (o: ReadonlyArray<number>): boolean => {
  const [a, b] = o as [number, number, number, number];
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
};

const parseIpv4 = (host: string): ReadonlyArray<number> | null => {
  const parts = host.split(".");
  if (parts.length !== 4) return null;
  const octets: Array<number> = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    octets.push(n);
  }
  return octets;
};

/**
 * Remove trailing slashes and an optional trailing `/v1` segment.
 */
const normalizeHostRoot = (raw: string): string => {
  const hostRoot = raw.replace(/\/+$/, "");
  return hostRoot.replace(/\/v1$/, "");
};

/**
 * Same as `normalizeHostRoot`, plus optional `/v1beta` stripping for image
 * endpoints that may use Google-compatible discovery paths.
 */
const normalizeHostRootForImage = (raw: string): string =>
  raw
    .replace(/\/+$/, "")
    .replace(/\/v1beta$/, "")
    .replace(/\/v1$/, "");

/**
 * Options for custom base URL normalization.
 */
type TNormalizeBaseUrlOptions = {
  readonly trimWhitespace?: boolean;
};

/**
 * Normalize a user-pasted custom base URL for OpenAI-style custom endpoints.
 */
export const normalizeBaseUrl = (
  raw: string,
  options: TNormalizeBaseUrlOptions = {},
): string => {
  const normalized = options.trimWhitespace === true ? raw.trim() : raw;
  return normalizeHostRoot(normalized);
};

/**
 * Normalize a user-pasted custom base URL for image-style custom endpoints.
 */
export const normalizeImageBaseUrl = (
  raw: string,
  options: TNormalizeBaseUrlOptions = {},
): string => {
  const normalized = options.trimWhitespace === true ? raw.trim() : raw;
  return normalizeHostRootForImage(normalized);
};

/**
 * WHATWG URL keeps IPv6 brackets in `hostname`. Lower-case it and remove the
 * single root-label dot that denotes the same DNS name (`localhost.`).
 */
const normalizeHost = (raw: string): string => {
  const lower = raw.trim().toLowerCase();
  const bare =
    lower.startsWith("[") && lower.endsWith("]") ? lower.slice(1, -1) : lower;
  return bare.endsWith(".") ? bare.slice(0, -1) : bare;
};

const isLocalIpv4 = (o: ReadonlyArray<number>): boolean => {
  const [a, b] = o as [number, number, number, number];
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  return isRfc1918(o);
};

const isForbiddenIpv4 = (o: ReadonlyArray<number>): boolean => {
  const [a, b, c] = o as [number, number, number, number];
  if (isLocalIpv4(o)) return true;
  // Carrier-grade NAT, benchmark, documentation, multicast, and reserved
  // ranges are not public Internet targets and must not be SSRF destinations.
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 192 && (b === 0 || b === 88)) return true;
  if (a === 192 && b === 0 && c === 2) return true;
  if (a === 198 && (b === 18 || b === 19 || b === 51)) return true;
  if (a === 203 && b === 0 && c === 113) return true;
  return a >= 224;
};

const isLocalIpv6 = (host: string): boolean => {
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(host);
  if (mapped !== null) {
    const embedded = parseIpv4(mapped[1] as string);
    return embedded !== null && isLocalIpv4(embedded);
  }
  const mappedHex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(host);
  if (mappedHex !== null) {
    const hi = Number.parseInt(mappedHex[1] as string, 16);
    const lo = Number.parseInt(mappedHex[2] as string, 16);
    return isLocalIpv4([hi >> 8, hi & 0xff, lo >> 8, lo & 0xff]);
  }
  if (host === "::1" || host === "::") return true;
  if (/^fe[89ab][0-9a-f]:/.test(host)) return true;
  if (/^f[cd][0-9a-f]{0,2}:/.test(host)) return true;
  return false;
};

const isForbiddenIpv6 = (host: string): boolean => {
  if (isLocalIpv6(host)) return true;
  const mappedHex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(host);
  if (mappedHex !== null) {
    const hi = Number.parseInt(mappedHex[1] as string, 16);
    const lo = Number.parseInt(mappedHex[2] as string, 16);
    return isForbiddenIpv4([hi >> 8, hi & 0xff, lo >> 8, lo & 0xff]);
  }
  // IPv4-compatible addresses are obsolete, but still permit a textual v4
  // tail in some resolvers. Treat them conservatively.
  if (/^::(?:[0-9a-f]{1,4}:)?[0-9a-f]+:[0-9a-f]+$/.test(host)) return true;
  // IPv6 documentation space (2001:db8::/32) is reserved.
  return host.startsWith("2001:db8:");
};

/** True when `host` names local/private/link-local network space. */
export const isLocalHostname = (rawHost: string): boolean => {
  const host = normalizeHost(rawHost);
  if (host.length === 0) return true;
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host === "local" || host.endsWith(".local")) return true;
  const v4 = parseIpv4(host);
  if (v4 !== null) return isLocalIpv4(v4);
  if (host.includes(":")) return isLocalIpv6(host);
  return false;
};

/**
 * True when `url` is unparseable, or its literal host is loopback / private /
 * link-local / mDNS. This intentionally does not resolve DNS.
 */
export const isLocalEndpoint = (url: string): boolean => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return true;
  }
  return isLocalHostname(parsed.hostname);
};

const isForbiddenResolvedAddress = (address: string): boolean => {
  const normalized = normalizeHost(address);
  const v4 = parseIpv4(normalized);
  if (v4 !== null) return isForbiddenIpv4(v4);
  return normalized.includes(":") ? isForbiddenIpv6(normalized) : true;
};

/**
 * Resolve a syntactically non-local URL and accept it only when every DNS
 * answer is globally routable. DNS is loaded lazily so browser/edge consumers
 * can keep using the pure classifier; absence of Node DNS fails closed.
 *
 * This validation must be invoked directly before each hosted fetch. Standard
 * Fetch (undici / Bun) does not expose a portable DNS-pin primitive that
 * connects to the resolved address while preserving Host + TLS SNI, so the
 * established defence is: preflight DNS here, then `redirect: "manual"` with
 * revalidation of every Location before the next hop
 * (`fetchSafeUpstream` in `packages/core/runner/base.ts`). A true
 * connect-to-resolved-IP path would require a custom dispatcher and is out of
 * scope for the portable fetch surface this codebase targets.
 */
export const isSafeRemoteEndpoint = async (url: string): Promise<boolean> => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  if (parsed.username.length > 0 || parsed.password.length > 0) return false;
  if (isLocalHostname(parsed.hostname)) return false;

  const literal = normalizeHost(parsed.hostname);
  if (parseIpv4(literal) !== null || literal.includes(":")) {
    return !isForbiddenResolvedAddress(literal);
  }

  try {
    const dns = await import("node:dns/promises");
    const answers = await dns.lookup(literal, { all: true, verbatim: true });
    return (
      answers.length > 0 &&
      answers.every((answer) => !isForbiddenResolvedAddress(answer.address))
    );
  } catch {
    // Node DNS is unavailable in edge/browser runtimes and a failed lookup
    // cannot establish that an upstream is safe. Hosted callers fail closed.
    return false;
  }
};

/** Error code every refusal path returns, so clients can branch on it. */
export const LOCAL_ENDPOINT_ERROR_CODE = "local_endpoint_requires_daemon";

export const localEndpointMessage = (url: string): string =>
  `"${url}" points at a local or private network address. The hosted gateway runs on Vercel — its localhost is not your machine, so it can never reach this endpoint. Local models (Ollama, LM Studio, llama.cpp) are served by the OpenLLM daemon running on your own machine; register and use them with the daemon running and the request never leaves the box.`;
