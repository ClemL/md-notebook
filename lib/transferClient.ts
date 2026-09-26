/**
 * Browser side of Send/Receive. Everything goes through the app's own `/api/transfer` routes —
 * the Upstash REST token lives on the server and must never reach this bundle.
 *
 * Each failure mode gets its own message, so a blocked network, an unconfigured deployment and a
 * code that was already claimed never read the same in the toast.
 */

import {
  CODE_LENGTH,
  isValidCode,
  normalizeCode,
  type TransferErrorBody,
  type TransferErrorCode,
} from "./transfer";

export type SendResult = { ok: true; code: string } | { ok: false; message: string };
export type ReceiveResult = { ok: true; entries: string[] } | { ok: false; message: string };

async function errorBody(res: Response): Promise<TransferErrorBody | null> {
  try {
    const body: unknown = await res.json();
    if (body && typeof body === "object" && typeof (body as TransferErrorBody).error === "string") {
      return body as TransferErrorBody;
    }
  } catch {
    /* fall through to the status-based message */
  }
  return null;
}

function describe(
  code: TransferErrorCode | null,
  fallback: string,
  message?: string,
  status?: number,
): string {
  // A static copy of the app (Azure Storage, IIS, a file:// folder) has no API routes at all.
  if (status === 404 && !code) {
    return "Transfer needs the hosted app — this copy has no server.";
  }
  switch (code) {
    case "not_configured":
      return "Transfer is not set up on this deployment (missing Upstash env vars).";
    case "upstream":
      return "The transfer store is unavailable — try again in a moment.";
    case "too_large":
      return "That entry is too large to send.";
    case "not_found":
      return message ?? "That code has expired or was already used.";
    case "bad_code":
    case "bad_request":
      return message ?? fallback;
    default:
      return fallback;
  }
}

export async function sendEntries(entries: string[]): Promise<SendResult> {
  if (!entries.length || entries.every((e) => e.trim() === "")) {
    return { ok: false, message: "Nothing to send — this entry is empty." };
  }

  let res: Response;
  try {
    res = await fetch("/api/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries }),
    });
  } catch {
    return { ok: false, message: "Send failed — no connection to the server." };
  }

  if (!res.ok) {
    const body = await errorBody(res);
    return {
      ok: false,
      message: describe(body?.error ?? null, `Send failed (${res.status}).`, body?.message, res.status),
    };
  }

  try {
    const body: unknown = await res.json();
    const code = (body as { code?: unknown })?.code;
    if (typeof code === "string" && code) return { ok: true, code };
  } catch {
    /* fall through */
  }
  return { ok: false, message: "Send failed — the server sent no code back." };
}

export async function receiveCode(raw: string): Promise<ReceiveResult> {
  const code = normalizeCode(raw);
  if (!code) return { ok: false, message: "Enter a transfer code first." };
  if (!isValidCode(code)) {
    return { ok: false, message: `"${code}" is not a code — they are ${CODE_LENGTH} letters and digits.` };
  }

  let res: Response;
  try {
    res = await fetch(`/api/transfer/${code}`, { cache: "no-store" });
  } catch {
    return { ok: false, message: "Receive failed — no connection to the server." };
  }

  if (!res.ok) {
    const body = await errorBody(res);
    return {
      ok: false,
      message: describe(body?.error ?? null, `Receive failed (${res.status}).`, body?.message, res.status),
    };
  }

  try {
    const body: unknown = await res.json();
    const entries = (body as { entries?: unknown })?.entries;
    if (Array.isArray(entries) && entries.every((e) => typeof e === "string")) {
      if (!entries.length) return { ok: false, message: "That transfer was empty." };
      return { ok: true, entries: entries as string[] };
    }
  } catch {
    /* fall through */
  }
  return { ok: false, message: "Receive failed — the server sent something unreadable." };
}
