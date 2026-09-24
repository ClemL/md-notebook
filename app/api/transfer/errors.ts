import { NotConfiguredError, UpstreamError } from "@/lib/upstash";
import type { TransferErrorCode } from "@/lib/transfer";

/** Every error body carries a stable `error` code so the client can pick a distinct toast. */
export function fail(error: TransferErrorCode, message: string, status: number): Response {
  return Response.json({ error, message }, { status, headers: { "Cache-Control": "no-store" } });
}

/** Turns a thrown Upstash client error into the response the browser expects. */
export function failFromThrown(err: unknown): Response {
  if (err instanceof NotConfiguredError) {
    return fail("not_configured", err.message, 503);
  }
  if (err instanceof UpstreamError) {
    return fail("upstream", err.message, 502);
  }
  return fail("upstream", "The transfer store failed unexpectedly.", 502);
}
