import { Schema as S } from "effect";

/** Public selection input only; concrete provider requests still require a model. */
export const OptionalMediaModel = S.optional(S.String).pipe(
  S.annotate({
    description:
      "Optional model ID. Omit for automatic default-chain selection; never send an empty-string placeholder. Preserve an explicitly selected nonempty ID exactly.",
  }),
);

export const MediaModelSelection = S.Struct({ model: OptionalMediaModel });
export const decodeMediaModelSelection =
  S.decodeUnknownSync(MediaModelSelection);

const VideoReferenceList = S.Array(S.String.check(S.isMinLength(1)));
/** Empty reference lists carry no guidance; invalid entries and wrong types still fail. */
export const OptionalVideoReferences = S.optional(VideoReferenceList);
