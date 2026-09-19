import { Schema as S } from "effect";

/**
 * Metadata-only signed plan for an existing video job (poll/content/cancel).
 * Carries the job's stored provider + model only — never the prompt, never
 * aliases, never cooldown/default derivation.
 */
export const VIDEO_JOB_PLAN_QUERY_KEY = "video_job";
export const VIDEO_JOB_PLAN_JSON_MAX_BYTES = 512;

export const VideoJobPlanRequest = S.Struct({
  model: S.String.pipe(S.minLength(1), S.maxLength(128)),
  provider: S.String.pipe(S.minLength(1), S.maxLength(64)),
});
export type TVideoJobPlanRequest = S.Schema.Type<typeof VideoJobPlanRequest>;

const decodeRequest = S.decodeUnknownEither(VideoJobPlanRequest);

const utf8ByteLength = (value: string): number =>
  new TextEncoder().encode(value).byteLength;

export const encodeVideoJobPlanQuery = (
  request: TVideoJobPlanRequest,
): string | null => {
  const decoded = decodeRequest(request);
  if (decoded._tag === "Left") return null;
  const json = JSON.stringify(decoded.right);
  if (utf8ByteLength(json) > VIDEO_JOB_PLAN_JSON_MAX_BYTES) return null;
  return `${VIDEO_JOB_PLAN_QUERY_KEY}=${encodeURIComponent(json)}`;
};

export const decodeVideoJobPlanQuery = (
  params: URLSearchParams,
): TVideoJobPlanRequest | null => {
  const raw = params.get(VIDEO_JOB_PLAN_QUERY_KEY);
  if (raw === null || raw.length === 0) return null;
  if (utf8ByteLength(raw) > VIDEO_JOB_PLAN_JSON_MAX_BYTES) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const decoded = decodeRequest(parsed);
  if (decoded._tag === "Left") return null;
  return decoded.right;
};
