/**
 * The only server-side state this app has: a thin Upstash Redis REST client for Send/Receive.
 *
 * Imported exclusively by the `/api/transfer` route handlers. The REST token is a server secret —
 * nothing under `app/` that carries `"use client"` may import this module, or the token would be
 * inlined into the browser bundle.
 *
 * Upstash's REST endpoint takes a command as a JSON array (`["SET", key, value, …]`) and answers
 * `{ "result": … }` or `{ "error": … }`, so no SDK dependency is needed.
 */

/** The env vars are missing or blank — the deployment was never configured for transfers. */
export class NotConfiguredError extends Error {
  constructor() {
    super("Transfer is not configured: set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.");
    this.name = "NotConfiguredError";
  }
}

/** Upstash was reachable but unhappy, or the request never got there. */
export class UpstreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UpstreamError";
  }
}

const REQUEST_TIMEOUT_MS = 8000;

type Credentials = { url: string; token: string };

function credentials(): Credentials {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) throw new NotConfiguredError();
  return { url: url.replace(/\/+$/, ""), token };
}

async function command(args: (string | number)[]): Promise<unknown> {
  const { url, token } = credentials();
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(args.map(String)),
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new UpstreamError("Could not reach the transfer store.");
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new UpstreamError(`Transfer store returned a non-JSON response (${res.status}).`);
  }

  if (body && typeof body === "object" && "error" in body) {
    throw new UpstreamError(String((body as { error: unknown }).error));
  }
  if (!res.ok) {
    throw new UpstreamError(`Transfer store returned ${res.status}.`);
  }
  return (body as { result?: unknown })?.result ?? null;
}

/**
 * `SET key value EX ttl NX`. Returns false when the key already exists, which lets the caller
 * retry with a fresh code rather than overwrite somebody else's pending transfer.
 */
export async function setIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean> {
  const result = await command(["SET", key, value, "EX", ttlSeconds, "NX"]);
  return result === "OK";
}

/** `GETDEL key` — read and delete in one round trip, so a code can never be consumed twice. */
export async function getDel(key: string): Promise<string | null> {
  const result = await command(["GETDEL", key]);
  return typeof result === "string" ? result : null;
}
