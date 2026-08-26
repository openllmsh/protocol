/**
 * The public syntax of OpenLLM keys minted by the vault.
 *
 * A key is `sk-llm-` plus a 10-byte base64url identifier (14 characters), a
 * literal dot, and a 32-byte base64url secret (43 characters). This is only a
 * local shape check; callers must still authenticate the key with the gateway.
 */
export const OPENLLM_API_KEY_PREFIX = "sk-llm-";
export const OPENLLM_API_KEY_ID_LENGTH = 14;
export const OPENLLM_API_KEY_SECRET_LENGTH = 43;

const BASE64URL = "[A-Za-z0-9_-]";

export const openllmApiKeyPattern = new RegExp(
  `^${OPENLLM_API_KEY_PREFIX}${BASE64URL}{${OPENLLM_API_KEY_ID_LENGTH}}\\.${BASE64URL}{${OPENLLM_API_KEY_SECRET_LENGTH}}$`,
);

/** Returns whether a value has the exact syntax of a minted OpenLLM API key. */
export const isOpenllmApiKeySyntax = (value: string): boolean =>
  openllmApiKeyPattern.test(value);
