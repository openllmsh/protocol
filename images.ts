import { Schema as S } from "effect";
import { OptionalMediaModel } from "./media-input";
import { TUNNEL_MEDIA_MAX_BODY_BYTES } from "./mux";

/** Image-edit request body bound; matches tunneled media HTTP max. */
export const IMAGE_EDIT_MAX_BODY_BYTES = TUNNEL_MEDIA_MAX_BODY_BYTES;

export const ImageSize = S.String;
export type TImageSize = S.Schema.Type<typeof ImageSize>;

export const ImageGenerationRequest = S.Struct({
  model: S.String,
  prompt: S.String,
  n: S.optional(S.Number.pipe(S.int(), S.positive())),
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

const { model: _imageGenerationModel, ...imageGenerationInputFields } =
  ImageGenerationRequest.fields;
export const ImageGenerationInput = S.Struct({
  ...imageGenerationInputFields,
  model: OptionalMediaModel,
});
export type TImageGenerationInput = S.Schema.Type<typeof ImageGenerationInput>;

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

/**
 * Canonical single-reference image edit. Generation (`ImageGenerationRequest`)
 * must not be used as a silent stand-in — edits require an explicit image
 * and reject masks / extra references.
 */
export const ImageEditReference = S.Struct({
  url: S.String,
});
export type TImageEditReference = S.Schema.Type<typeof ImageEditReference>;

export const ImageEditRequest = S.Struct({
  model: S.String,
  prompt: S.String,
  image: ImageEditReference,
  n: S.optional(S.Number.pipe(S.int(), S.positive())),
  size: S.optional(ImageSize),
  quality: S.optional(S.String),
  response_format: S.optional(S.Literal("url", "b64_json")),
});
export type TImageEditRequest = S.Schema.Type<typeof ImageEditRequest>;

const { model: _imageEditModel, ...imageEditInputFields } =
  ImageEditRequest.fields;
export const ImageEditInput = S.Struct({
  ...imageEditInputFields,
  model: OptionalMediaModel,
});
export type TImageEditInput = S.Schema.Type<typeof ImageEditInput>;

export const ImageEditParseErrorCode = S.Literal(
  "image_edit_mask_unsupported",
  "image_edit_multi_reference_unsupported",
  "image_edit_invalid",
);
export type TImageEditParseErrorCode = S.Schema.Type<
  typeof ImageEditParseErrorCode
>;

export type TImageEditParseFailure = {
  readonly code: TImageEditParseErrorCode;
  readonly message: string;
};

export type TImageEditParseResult =
  | { readonly ok: true; readonly request: TImageEditRequest }
  | { readonly ok: false; readonly error: TImageEditParseFailure };

export const decodeImageEditRequest = S.decodeUnknownEither(ImageEditRequest);
