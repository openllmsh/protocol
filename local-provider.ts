import { Schema as S } from "effect";

/**
 * The two daemon-only provider variants. Both are served only by a local
 * daemon (never by the hosted gateway); they differ in how the device
 * authenticates and talks upstream:
 *  - `oauth` — today's subscription providers (vendor-CLI login)
 *  - `local` — loopback model servers (Ollama, LM Studio, …)
 */
export const LocalProviderVariant = S.Literals(["oauth", "local"]);
export type TLocalProviderVariant = S.Schema.Type<typeof LocalProviderVariant>;

/**
 * Closed set of OAuth / subscription-provider slugs a control command may
 * address — the ONLY values that can ever reach a daemon delegate or the
 * isolated-CLI installer. The daemon's `TCliProvider` derives from this.
 */
export const OAuthProviderSlug = S.Literals([
  "claude_code",
  "chatgpt",
  "kimi_code",
  // xAI Grok ("Grok Build", x.ai/cli) — SuperGrok / X Premium+ subscription
  // OAuth, delegated to the official `grok` CLI by the daemon.
  "grok",
  // Cursor subscription, delegated to the official `cursor-agent` CLI.
  "cursor",
  // Meta Muse Code subscription — daemon bridge to the official `muse`
  // CLI / SDK only. No direct Meta Model API-key fallback on this slug.
  "muse",
  // Google Antigravity subscription — daemon bridge to Google's official
  // `agy_acp_server` ACP agent and its own Google sign-in. Never a metered
  // Gemini API key; the BYOK `google` provider is a separate slug.
  "antigravity",
]);
export type TOAuthProviderSlug = S.Schema.Type<typeof OAuthProviderSlug>;

/** Well-known local model-server preset slugs (`local_<product>`). */
export const LocalServerPresetSlug = S.Literals([
  "local_ollama",
  "local_lmstudio",
  "local_llamacpp",
  "local_localai",
  "local_vllm",
  "local_jan",
  "local_textgen",
]);
export type TLocalServerPresetSlug = S.Schema.Type<
  typeof LocalServerPresetSlug
>;

export type TLocalServerPreset = {
  readonly slug: TLocalServerPresetSlug;
  readonly label: string;
  /** Vendor-documented default loopback port. */
  readonly defaultPort: number;
  readonly docsUrl: string;
};

/**
 * Popular local OpenAI-compatible servers and their default ports.
 * A port that answers but matches no preset falls back to
 * {@link localPortSlug}.
 */
export const LOCAL_SERVER_PRESETS: ReadonlyArray<TLocalServerPreset> = [
  {
    slug: "local_ollama",
    label: "Ollama",
    defaultPort: 11434,
    docsUrl: "https://docs.ollama.com",
  },
  {
    slug: "local_lmstudio",
    label: "LM Studio",
    defaultPort: 1234,
    docsUrl: "https://lmstudio.ai/docs/developer/rest/quickstart",
  },
  {
    slug: "local_llamacpp",
    label: "llama.cpp",
    defaultPort: 8080,
    docsUrl: "https://github.com/ggerganov/llama.cpp",
  },
  {
    slug: "local_localai",
    label: "LocalAI",
    defaultPort: 8080,
    docsUrl: "https://localai.io",
  },
  {
    slug: "local_vllm",
    label: "vLLM",
    defaultPort: 8000,
    docsUrl: "https://docs.vllm.ai",
  },
  {
    slug: "local_jan",
    label: "Jan",
    defaultPort: 1337,
    docsUrl: "https://jan.ai/docs/desktop/api-server",
  },
  {
    slug: "local_textgen",
    label: "text-generation-webui",
    defaultPort: 5000,
    docsUrl: "https://github.com/oobabooga/text-generation-webui",
  },
] as const;

const LOCAL_PORT_SLUG_RE = /^local_port_(\d{1,5})$/;

/** Fallback slug for a discovered port that matched no preset. */
export const localPortSlug = (port: number): string => `local_port_${port}`;

/** Parse `local_port_<port>`; returns null when the slug is not that shape. */
export const parseLocalPortSlug = (slug: string): number | null => {
  const match = LOCAL_PORT_SLUG_RE.exec(slug);
  if (match === null) return null;
  const port = Number(match[1]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return port;
};

export const isLocalPortSlug = (slug: string): boolean =>
  parseLocalPortSlug(slug) !== null;

/**
 * Stable overview-group provider for ephemeral `local_port_<n>` rows.
 * Custom-port / test servers each mint a unique slug; collapsing them here
 * lets Recent requests stack as `tiny N×` instead of one row per port.
 */
export const LOCAL_PORT_GROUP_PROVIDER = "local_port" as const;

/** Overview grouping provider: ephemeral ports share {@link LOCAL_PORT_GROUP_PROVIDER}. */
export const requestGroupProvider = (provider: string): string =>
  isLocalPortSlug(provider) ? LOCAL_PORT_GROUP_PROVIDER : provider;

/**
 * Overview grouping model id for a request row. Ephemeral local ports keep the
 * `local_port/<leaf>` shape so `shortName` still shows the leaf model.
 */
export const requestGroupModel = (
  provider: string,
  model: string | null,
): string | null => {
  if (!isLocalPortSlug(provider)) return model;
  if (model === null || model.length === 0) return model;
  const slash = model.lastIndexOf("/");
  const leaf = slash >= 0 ? model.slice(slash + 1) : model;
  if (leaf.length === 0) return model;
  return `${LOCAL_PORT_GROUP_PROVIDER}/${leaf}`;
};

export const isLocalServerPresetSlug = (
  slug: string,
): slug is TLocalServerPresetSlug =>
  (LocalServerPresetSlug.literals as ReadonlyArray<string>).includes(slug);

/** True for a preset slug or a `local_port_<n>` fallback. */
export const isLocalServerSlug = (slug: string): boolean =>
  isLocalServerPresetSlug(slug) || isLocalPortSlug(slug);

export const isOAuthProviderSlug = (
  provider: string,
): provider is TOAuthProviderSlug =>
  (OAuthProviderSlug.literals as ReadonlyArray<string>).includes(provider);

/**
 * Daemon-only providers: OAuth subscription slugs ∪ local server slugs.
 * Replaces `isSubscriptionProvider` at routing / plan / walker sites that
 * mean "cloud never serves this hop".
 */
export const isLocalProvider = (slug: string): boolean =>
  isOAuthProviderSlug(slug) || isLocalServerSlug(slug);

/** Variant for a daemon-only slug, or null when the slug is neither. */
export const localProviderVariant = (
  slug: string,
): TLocalProviderVariant | null => {
  if (isOAuthProviderSlug(slug)) return "oauth";
  if (isLocalServerSlug(slug)) return "local";
  return null;
};

export const localServerPresetBySlug = (
  slug: string,
): TLocalServerPreset | null =>
  LOCAL_SERVER_PRESETS.find((preset) => preset.slug === slug) ?? null;

export const localServerPresetByPort = (
  port: number,
): TLocalServerPreset | null => {
  const matches = LOCAL_SERVER_PRESETS.filter(
    (preset) => preset.defaultPort === port,
  );
  // Colliding defaults (8080 ×2) are ambiguous — caller fingerprints instead.
  return matches.length === 1 ? (matches[0] ?? null) : null;
};

/** OAuth hop with no online daemon — keep the historical wire string. */
export const SUBSCRIPTION_REQUIRES_DAEMON_ERROR_CODE =
  "subscription_requires_daemon";

/** Local-server hop with no online daemon that lists the model. */
export const LOCAL_REQUIRES_DAEMON_ERROR_CODE = "local_requires_daemon";
