/**
 * Pure registry-pointer identity validation — shared by the gateway
 * (`@openllm/registry` re-exports these) and the daemon's integration
 * executor. String-only: no crypto, fs, or fetch, so it stays inside the
 * daemon's protocol+wire dependency budget.
 */

export const REGISTRY_REPOSITORY = "openllmsh/registry";
export const SHA256_RE = /^[0-9a-f]{64}$/;
export const FULL_COMMIT_SHA_RE = /^[0-9a-f]{40}$/;

export type TRegistryPointerFilename = "install.sh" | "pointer.json";

export type TRegistryPointerLocation = {
  readonly commit: string;
  readonly area: "setup";
  readonly slug: string;
  readonly filename: TRegistryPointerFilename;
};

export const registryRawUrl = (
  commit: string,
  area: "setup",
  slug: string,
  filename: TRegistryPointerFilename,
): string => {
  if (!FULL_COMMIT_SHA_RE.test(commit)) {
    throw new Error(`registry commit must be a full lowercase SHA: ${commit}`);
  }
  if (!/^[a-z0-9-]+$/.test(slug)) {
    throw new Error(`invalid registry slug: ${slug}`);
  }
  return `https://raw.githubusercontent.com/${REGISTRY_REPOSITORY}/${commit}/${area}/${slug}/${filename}`;
};

export const validateRegistryRawUrl = (
  value: string,
  expected: {
    readonly area: "setup";
    readonly slug: string;
    readonly filename: TRegistryPointerFilename;
  },
): TRegistryPointerLocation => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("registry URL is malformed");
  }

  if (url.protocol !== "https:") throw new Error("registry URL must use HTTPS");
  if (url.hostname !== "raw.githubusercontent.com") {
    throw new Error("registry URL host is not approved");
  }
  if (
    url.username !== "" ||
    url.password !== "" ||
    url.port !== "" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error("registry URL contains forbidden authority or suffix data");
  }

  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length !== 6) throw new Error("registry URL path is invalid");
  const [owner, repo, commit, area, slug, filename] = segments;
  if (`${owner}/${repo}` !== REGISTRY_REPOSITORY) {
    throw new Error("registry URL repository is not approved");
  }
  if (!FULL_COMMIT_SHA_RE.test(commit)) {
    throw new Error("registry URL must contain a full lowercase commit SHA");
  }
  if (
    area !== expected.area ||
    slug !== expected.slug ||
    filename !== expected.filename
  ) {
    throw new Error(
      "registry URL identity does not match the requested integration",
    );
  }

  return { commit, area: expected.area, slug, filename: expected.filename };
};
