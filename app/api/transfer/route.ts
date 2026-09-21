import {
  MAX_ENTRIES,
  MAX_PAYLOAD_BYTES,
  TRANSFER_TTL_SECONDS,
  makeCode,
  payloadBytes,
  transferKey,
} from "@/lib/transfer";
import { setIfAbsent } from "@/lib/upstash";
import { fail, failFromThrown } from "./errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A fresh code almost never collides; a couple of retries cover the case where one does. */
const CODE_ATTEMPTS = 5;

function readEntries(body: unknown): string[] | null {
  if (!body || typeof body !== "object") return null;
  const entries = (body as { entries?: unknown }).entries;
  if (!Array.isArray(entries)) return null;
  if (!entries.every((e): e is string => typeof e === "string")) return null;
  return entries;
}

/** Send: store one or more markdown entries under a short code and hand the code back. */
export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("bad_request", "Expected a JSON body of { entries: string[] }.", 400);
  }

  const entries = readEntries(body);
  if (!entries) {
    return fail("bad_request", "Expected a JSON body of { entries: string[] }.", 400);
  }
  if (!entries.length || entries.every((e) => e.trim() === "")) {
    return fail("bad_request", "There is nothing to send.", 400);
  }
  if (entries.length > MAX_ENTRIES) {
    return fail("bad_request", `A transfer holds at most ${MAX_ENTRIES} entries.`, 400);
  }
  if (payloadBytes(entries) > MAX_PAYLOAD_BYTES) {
    return fail("too_large", "That is too much text for one transfer.", 413);
  }

  const value = JSON.stringify(entries);
  try {
    for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
      const code = makeCode();
      if (await setIfAbsent(transferKey(code), value, TRANSFER_TTL_SECONDS)) {
        return Response.json({ code }, { headers: { "Cache-Control": "no-store" } });
      }
    }
  } catch (err) {
    return failFromThrown(err);
  }
  return fail("upstream", "Could not reserve a transfer code — try again.", 502);
}
