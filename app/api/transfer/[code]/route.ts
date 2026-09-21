import { isValidCode, normalizeCode, transferKey } from "@/lib/transfer";
import { getDel } from "@/lib/upstash";
import { fail, failFromThrown } from "../errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Receive: read the transfer and delete it in the same round trip.
 *
 * `GETDEL` is what makes this read-once — there is no window in which a second reader could pick
 * up the same payload, and nothing is left behind for the TTL to clean up.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
): Promise<Response> {
  const code = normalizeCode((await params).code ?? "");
  if (!isValidCode(code)) {
    return fail("bad_code", "That is not a transfer code.", 400);
  }

  let stored: string | null;
  try {
    stored = await getDel(transferKey(code));
  } catch (err) {
    return failFromThrown(err);
  }

  if (stored === null) {
    return fail("not_found", `Code ${code} has expired or was already used.`, 404);
  }

  let entries: unknown;
  try {
    entries = JSON.parse(stored);
  } catch {
    return fail("upstream", "The stored transfer could not be read.", 502);
  }
  if (!Array.isArray(entries) || !entries.every((e) => typeof e === "string")) {
    return fail("upstream", "The stored transfer could not be read.", 502);
  }

  return Response.json({ entries }, { headers: { "Cache-Control": "no-store" } });
}
