import { Schema as S } from "effect";

/** Clip duration in seconds. Providers clamp unsupported values. */
export const VideoSeconds = S.String;
export type TVideoSeconds = S.Schema.Type<typeof VideoSeconds>;

/** Output resolution as "WIDTHxHEIGHT" (e.g. "720x1280"). */
export const VideoSize = S.String;
export type TVideoSize = S.Schema.Type<typeof VideoSize>;

/** Provider-dependent image/reference inputs are ignored by unsupported providers. */
export const VideoGenerationRequest = S.Struct({
  model: S.String,
  prompt: S.String,
  seconds: S.optional(VideoSeconds),
  size: S.optional(VideoSize),
  input_image: S.optional(S.String),
  reference_images: S.optional(S.Array(S.String)),
  reference_voices: S.optional(S.Array(S.String)),
});
export type TVideoGenerationRequest = S.Schema.Type<
  typeof VideoGenerationRequest
>;

export const VideoJobStatus = S.Literal(
  "queued",
  "in_progress",
  "completed",
  "failed",
);
export type TVideoJobStatus = S.Schema.Type<typeof VideoJobStatus>;

const VideoJobError = S.Struct({
  code: S.optional(S.String),
  message: S.optional(S.String),
});

export const VideoDeleted = S.Struct({
  id: S.String,
  object: S.Literal("video.deleted"),
  deleted: S.Boolean,
});
export type TVideoDeleted = S.Schema.Type<typeof VideoDeleted>;

export const VideoJob = S.Struct({
  id: S.String,
  object: S.Literal("video"),
  created_at: S.Number,
  status: VideoJobStatus,
  model: S.String,
  progress: S.optional(S.Number),
  seconds: S.optional(VideoSeconds),
  size: S.optional(VideoSize),
  error: S.optional(S.NullOr(VideoJobError)),
});
export type TVideoJob = S.Schema.Type<typeof VideoJob>;

export type TVideoIdPayload = {
  readonly p: string;
  readonly u: string;
  readonly m: string;
  readonly c: number;
};

export const encodeVideoId = (payload: TVideoIdPayload): string =>
  `video_${Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")}`;

export const decodeVideoId = (id: string): TVideoIdPayload | null => {
  if (!id.startsWith("video_")) return null;
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(id.slice("video_".length), "base64url").toString("utf8"),
    );
    if (parsed === null || typeof parsed !== "object") return null;
    const o = parsed as Record<string, unknown>;
    if (
      typeof o.p !== "string" ||
      typeof o.u !== "string" ||
      typeof o.m !== "string" ||
      typeof o.c !== "number"
    ) {
      return null;
    }
    return { p: o.p, u: o.u, m: o.m, c: o.c };
  } catch {
    return null;
  }
};
