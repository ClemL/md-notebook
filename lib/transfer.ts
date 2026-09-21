/**
 * Shared vocabulary for the Send/Receive transfer feature. Nothing here touches the network or
 * reads a secret, so both the browser bundle and the API routes can import it.
 *
 * A transfer is write-once and read-once: Send writes one key, Receive reads it with `GETDEL`,
 * and the 24h TTL only exists so a code nobody claims does not live forever.
 */

/** Crockford-flavored: no `0`/`O`, no `1`/`I`/`L`, so a code read off a screen types back cleanly. */
export const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export const CODE_LENGTH = 7;

/** 24 hours, in seconds — the safety net for a transfer nobody receives. */
export const TRANSFER_TTL_SECONDS = 24 * 60 * 60;

/** A single push is a handful of scratchpad entries, not a notebook dump. */
export const MAX_ENTRIES = 50;

/** Upstash rejects very large REST bodies; refuse early with a message instead. */
export const MAX_PAYLOAD_BYTES = 512 * 1024;

const CODE_RE = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

export function makeCode(length = CODE_LENGTH): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return out;
}

/**
 * What the user typed, turned into what the API expects: upper-cased, with the spaces and hyphens
 * people add when reading a code aloud removed. Anything left over fails `isValidCode`.
 */
export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s-]+/g, "");
}

export function isValidCode(code: string): boolean {
  return CODE_RE.test(code);
}

export function transferKey(code: string): string {
  return `transfer:${code}`;
}

export function payloadBytes(entries: string[]): number {
  return new TextEncoder().encode(JSON.stringify(entries)).length;
}

/** Machine-readable failure reasons; the client maps each to its own toast. */
export type TransferErrorCode =
  | "bad_request"
  | "bad_code"
  | "too_large"
  | "not_configured"
  | "not_found"
  | "upstream";

export type TransferErrorBody = { error: TransferErrorCode; message: string };
