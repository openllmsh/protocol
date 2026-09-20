import { Schema as S } from "effect";
import { VideoInputMode, VideoReferenceInputs } from "./models";

export const VIDEO_INPUT_ERROR =
  "Invalid video input. Use only canonical video fields; input_image is a starting frame, reference_images are subject references, and reference_voices are voice IDs. Unknown fields (including input_reference) are not supported.";

const ReferenceCount = S.Number.pipe(S.int(), S.nonNegative());
/** Metadata only: counts of inputs, never URLs, bytes, or browser media IDs. */
export const VideoInputReceipt = S.Struct({
  mode: VideoInputMode,
  starting_images: ReferenceCount,
  subject_images: ReferenceCount,
  voices: ReferenceCount,
});
export type TVideoInputReceipt = S.Schema.Type<typeof VideoInputReceipt>;

export const videoInputReceiptFromCounts = (
  counts: Omit<TVideoInputReceipt, "mode">,
): TVideoInputReceipt => {
  const {
    starting_images: startingImages,
    subject_images: subjectImages,
    voices,
  } = counts;
  const mode = S.decodeUnknownSync(VideoInputMode)(
    [
      startingImages > 0 ? "starting_image" : "",
      subjectImages > 0 ? "subject_images" : "",
      voices > 0 ? "voices" : "",
    ]
      .filter(Boolean)
      .join("+") || "text",
  );
  return {
    mode,
    starting_images: startingImages,
    subject_images: subjectImages,
    voices,
  };
};

export const videoInputRequirements = (
  body: Pick<
    TVideoGenerationInput,
    "input_image" | "reference_images" | "reference_voices"
  >,
): TVideoInputReceipt =>
  videoInputReceiptFromCounts({
    starting_images: body.input_image === undefined ? 0 : 1,
    subject_images: body.reference_images?.length ?? 0,
    voices: body.reference_voices?.length ?? 0,
  });

/** Clip duration in seconds. Providers validate unsupported values. */
export const VideoSeconds = S.String.annotations({
  description:
    "Requested duration in seconds as a numeric string. Values are not clamped; the provider validates durations accepted by the selected model.",
});
export type TVideoSeconds = S.Schema.Type<typeof VideoSeconds>;

/** Output resolution as "WIDTHxHEIGHT" (e.g. "720x1280"). */
export const VideoSize = S.String.annotations({
  description:
    "Requested output dimensions as WIDTHxHEIGHT (for example 1280x720 or 720x1280). Adapters preserve aspect ratio and resolution intent; the provider validates model-specific sizes.",
});
export type TVideoSize = S.Schema.Type<typeof VideoSize>;

/** Canonical reference semantics are preserved or rejected, never silently dropped. */
export const VideoGenerationRequest = S.Struct({
  model: S.String,
  prompt: S.String,
  seconds: S.optional(VideoSeconds),
  size: S.optional(VideoSize),
  ...VideoReferenceInputs.fields,
}).annotations({ parseOptions: { onExcessProperty: "error" } });
export type TVideoGenerationRequest = S.Schema.Type<
  typeof VideoGenerationRequest
>;

const { model: _videoGenerationModel, ...videoGenerationInputFields } =
  VideoGenerationRequest.fields;
export const VideoGenerationInput = S.Struct({
  ...videoGenerationInputFields,
  model: S.optional(S.String),
}).annotations({ parseOptions: { onExcessProperty: "error" } });
export type TVideoGenerationInput = S.Schema.Type<typeof VideoGenerationInput>;

const decodeVideoInput = S.decodeUnknownEither(VideoGenerationInput);
/** Safe diagnostics intentionally never include Effect's raw actual values. */
export const parseVideoGenerationInput = (
  body: unknown,
): TVideoGenerationInput => {
  const result = decodeVideoInput(body);
  if (result._tag === "Left") throw new Error(VIDEO_INPUT_ERROR);
  return result.right;
};

/** Privacy-safe provider diagnostics; preserve corrective text, never attachment material. */
export const redactVideoErrorText = (
  message: string,
  sensitive: ReadonlyArray<string>,
): string => {
  let clean = message;
  for (const secret of sensitive) {
    if (secret.length === 0) continue;
    clean = clean.split(secret).join("[redacted]");
    const encoded = secret.match(/^data:[^,]+,(.*)$/s)?.[1];
    if (encoded) clean = clean.split(encoded).join("[redacted]");
  }
  return clean
    .replace(/https?:\/\/[^\s<>"']+/gi, "[redacted-url]")
    .replace(/data:[^\s"']+/gi, "[redacted-image]")
    .replace(/\b[A-Za-z0-9+/]{128,}={0,2}/g, "[redacted-bytes]");
};

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
  /** Inputs actually forwarded on accepted creation; absent means unknown. */
  input_receipt: S.optional(VideoInputReceipt),
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
