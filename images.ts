import { Schema as S } from "effect";

export const ImageSize = S.String;
export type TImageSize = S.Schema.Type<typeof ImageSize>;

export const ImageGenerationRequest = S.Struct({
  model: S.String,
  prompt: S.String,
  n: S.optional(S.Number),
  size: S.optional(ImageSize),
  quality: S.optional(S.String),
  style: S.optional(S.Literal("vivid", "natural")),
  response_format: S.optional(S.Literal("url", "b64_json")),
  background: S.optional(S.Literal("transparent", "opaque", "auto")),
  user: S.optional(S.String),
});
export type TImageGenerationRequest = S.Schema.Type<
  typeof ImageGenerationRequest
>;

const ImageData = S.Struct({
  url: S.optional(S.String),
  b64_json: S.optional(S.String),
  revised_prompt: S.optional(S.String),
});

export const ImageGenerationResponse = S.Struct({
  created: S.Number,
  data: S.Array(ImageData),
});
export type TImageGenerationResponse = S.Schema.Type<
  typeof ImageGenerationResponse
>;
