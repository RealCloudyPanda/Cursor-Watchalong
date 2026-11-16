import type { z } from "zod";
import { MAX_MESSAGE_BYTES } from "./constants";

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** Size-check, JSON-parse and schema-validate an untrusted wire message. */
export function parseWire<T>(schema: z.ZodType<T>, raw: string): ParseResult<T> {
  // UTF-16 length is a lower bound on UTF-8 bytes; only encode when it could matter.
  if (raw.length > MAX_MESSAGE_BYTES) return { ok: false, error: "too-large" };
  if (raw.length * 3 > MAX_MESSAGE_BYTES && utf8Length(raw) > MAX_MESSAGE_BYTES) {
    return { ok: false, error: "too-large" };
  }
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, error: "invalid-json" };
  }
  const result = schema.safeParse(data);
  return result.success ? { ok: true, value: result.data } : { ok: false, error: "invalid-shape" };
}

const encoder = new TextEncoder();
function utf8Length(s: string): number {
  return encoder.encode(s).length;
}
