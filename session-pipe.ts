/** Bounded message framing for the local Windows named-pipe session transport. */

export type TSessionPipeFrame =
  | { readonly kind: "text"; readonly payload: string }
  | { readonly kind: "binary"; readonly payload: Uint8Array };

export const SESSION_PIPE_MAX_FRAME_BYTES = 8 * 1024 * 1024;
export const SESSION_PIPE_DRAIN_ACK = '{"t":"pipe-drain-ack"}';

export const encodeSessionPipeFrame = (
  frame: TSessionPipeFrame,
): Uint8Array => {
  const payload =
    frame.kind === "text"
      ? new TextEncoder().encode(frame.payload)
      : frame.payload;
  const size = payload.byteLength + 1;
  if (size > SESSION_PIPE_MAX_FRAME_BYTES)
    throw new RangeError("session pipe frame exceeds the size limit");
  const encoded = new Uint8Array(size + 4);
  const view = new DataView(encoded.buffer);
  view.setUint32(0, size, true);
  encoded[4] = frame.kind === "text" ? 0 : 1;
  encoded.set(payload, 5);
  return encoded;
};

/** Incremental decoder; malformed or oversized frames permanently fail closed. */
export class SessionPipeFrameDecoder {
  private pending = new Uint8Array();
  private failed = false;

  push(chunk: Uint8Array): readonly TSessionPipeFrame[] {
    if (this.failed) throw new Error("session pipe decoder is closed");
    const pending = new Uint8Array(this.pending.byteLength + chunk.byteLength);
    pending.set(this.pending);
    pending.set(chunk, this.pending.byteLength);
    const frames: TSessionPipeFrame[] = [];
    let offset = 0;
    try {
      while (pending.byteLength - offset >= 4) {
        const size = new DataView(
          pending.buffer,
          pending.byteOffset + offset,
          4,
        ).getUint32(0, true);
        if (size < 1 || size > SESSION_PIPE_MAX_FRAME_BYTES)
          throw new Error("invalid session pipe frame size");
        if (pending.byteLength - offset < size + 4) break;
        const kind = pending[offset + 4];
        const payload = pending.slice(offset + 5, offset + 4 + size);
        if (kind === 0)
          frames.push({
            kind: "text",
            payload: new TextDecoder().decode(payload),
          });
        else if (kind === 1) frames.push({ kind: "binary", payload });
        else throw new Error("invalid session pipe frame kind");
        offset += size + 4;
      }
    } catch (error) {
      this.failed = true;
      this.pending = new Uint8Array();
      throw error;
    }
    this.pending = pending.slice(offset);
    return frames;
  }
}
