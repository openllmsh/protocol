import { Option, Schema as S } from "effect";

/** Public selection input only; concrete provider requests still require a model. */
export const OptionalMediaModel = S.optionalToOptional(
  S.UndefinedOr(S.String),
  S.String,
  {
    decode: Option.filter(
      (value: string | undefined): value is string =>
        value !== undefined && value.trim() !== "",
    ),
    encode: (value) => value,
  },
).annotations({
  description:
    "Optional model ID. Omit for automatic default-chain selection; never send an empty-string placeholder. Preserve an explicitly selected nonempty ID exactly.",
});

export const MediaModelSelection = S.Struct({ model: OptionalMediaModel });
export const decodeMediaModelSelection =
  S.decodeUnknownSync(MediaModelSelection);

const VideoReferenceList = S.Array(S.String.pipe(S.minLength(1)));
/** Empty reference lists carry no guidance; invalid entries and wrong types still fail. */
export const OptionalVideoReferences = S.optionalToOptional(
  VideoReferenceList,
  VideoReferenceList,
  {
    decode: Option.filter(
      (value: readonly string[]): boolean => value.length > 0,
    ),
    encode: (value) => value,
  },
);
