import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CODE_ALPHABET,
  CODE_LENGTH,
  MAX_ENTRIES,
  TRANSFER_TTL_SECONDS,
  isValidCode,
  makeCode,
  normalizeCode,
  transferKey,
} from "@/lib/transfer";

// The routes are exercised against a fake store: no Upstash credentials, no network. The real
// error classes are kept so the routes' `instanceof` mapping is what is under test.
const { getDel, setIfAbsent } = vi.hoisted(() => ({
  getDel: vi.fn<(key: string) => Promise<string | null>>(),
  setIfAbsent: vi.fn<(key: string, value: string, ttl: number) => Promise<boolean>>(),
}));

vi.mock("@/lib/upstash", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/upstash")>()),
  getDel,
  setIfAbsent,
}));

const { NotConfiguredError, UpstreamError } = await import("@/lib/upstash");
const { POST } = await import("@/app/api/transfer/route");
const { GET } = await import("@/app/api/transfer/[code]/route");
const { receiveCode, sendEntries } = await import("@/lib/transferClient");

function post(body: unknown, raw?: string): Promise<Response> {
  return POST(
    new Request("http://localhost/api/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: raw ?? JSON.stringify(body),
    }),
  );
}

function get(code: string): Promise<Response> {
  return GET(new Request(`http://localhost/api/transfer/${code}`), {
    params: Promise.resolve({ code }),
  });
}

beforeEach(() => {
  getDel.mockReset();
  setIfAbsent.mockReset();
});

describe("code helpers", () => {
  it("generates codes from the unambiguous alphabet", () => {
    for (let i = 0; i < 200; i += 1) {
      const code = makeCode();
      expect(code).toHaveLength(CODE_LENGTH);
      expect(isValidCode(code)).toBe(true);
      expect([...code].every((ch) => CODE_ALPHABET.includes(ch))).toBe(true);
    }
  });

  it("does not mint codes containing look-alike characters", () => {
    expect(CODE_ALPHABET).not.toMatch(/[01OIL]/);
  });

  it("normalizes what a person types back", () => {
    expect(normalizeCode("  7k2-qm 9x ")).toBe("7K2QM9X");
    expect(isValidCode(normalizeCode("7k2qm9x"))).toBe(true);
    expect(isValidCode(normalizeCode("7k2qm9"))).toBe(false);
    expect(isValidCode(normalizeCode("7K2QM90"))).toBe(false);
  });

  it("namespaces the redis key", () => {
    expect(transferKey("7K2QM9X")).toBe("transfer:7K2QM9X");
  });
});

describe("POST /api/transfer", () => {
  it("stores the entries under a fresh code with a 24h TTL", async () => {
    setIfAbsent.mockResolvedValue(true);
    const res = await post({ entries: ["# one", "two"] });
    expect(res.status).toBe(200);

    const { code } = (await res.json()) as { code: string };
    expect(isValidCode(code)).toBe(true);
    expect(setIfAbsent).toHaveBeenCalledTimes(1);
    expect(setIfAbsent).toHaveBeenCalledWith(
      `transfer:${code}`,
      JSON.stringify(["# one", "two"]),
      TRANSFER_TTL_SECONDS,
    );
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("retries with a new code when one is already taken", async () => {
    setIfAbsent.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const res = await post({ entries: ["hello"] });
    expect(res.status).toBe(200);
    expect(setIfAbsent).toHaveBeenCalledTimes(2);
    const [first] = setIfAbsent.mock.calls[0];
    const [second] = setIfAbsent.mock.calls[1];
    expect(first).not.toBe(second);
  });

  it("gives up rather than overwriting a pending transfer", async () => {
    setIfAbsent.mockResolvedValue(false);
    const res = await post({ entries: ["hello"] });
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("upstream");
  });

  it.each([
    ["a non-object body", JSON.stringify("nope")],
    ["entries of the wrong type", JSON.stringify({ entries: [1, 2] })],
    ["a missing entries key", JSON.stringify({})],
    ["a body that is not JSON", "{"],
  ])("rejects %s with 400", async (_label, raw) => {
    const res = await post(undefined, raw);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("bad_request");
    expect(setIfAbsent).not.toHaveBeenCalled();
  });

  it("refuses an empty send", async () => {
    expect((await post({ entries: [] })).status).toBe(400);
    expect((await post({ entries: ["   ", "\n"] })).status).toBe(400);
    expect(setIfAbsent).not.toHaveBeenCalled();
  });

  it("caps the entry count and the payload size", async () => {
    setIfAbsent.mockResolvedValue(true);
    const tooMany = await post({ entries: Array.from({ length: MAX_ENTRIES + 1 }, () => "x") });
    expect(tooMany.status).toBe(400);

    const tooBig = await post({ entries: ["x".repeat(600 * 1024)] });
    expect(tooBig.status).toBe(413);
    expect((await tooBig.json()).error).toBe("too_large");
    expect(setIfAbsent).not.toHaveBeenCalled();
  });

  it("reports missing credentials as 503 and an upstream fault as 502", async () => {
    setIfAbsent.mockRejectedValueOnce(new NotConfiguredError());
    const unconfigured = await post({ entries: ["hello"] });
    expect(unconfigured.status).toBe(503);
    expect((await unconfigured.json()).error).toBe("not_configured");

    setIfAbsent.mockRejectedValueOnce(new UpstreamError("boom"));
    const broken = await post({ entries: ["hello"] });
    expect(broken.status).toBe(502);
    expect((await broken.json()).error).toBe("upstream");
  });
});

describe("GET /api/transfer/[code]", () => {
  it("returns the entries and consumes the key", async () => {
    getDel.mockResolvedValue(JSON.stringify(["first", "second"]));
    const res = await get("7K2QM9X");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ entries: ["first", "second"] });
    expect(getDel).toHaveBeenCalledWith("transfer:7K2QM9X");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("accepts a lower-cased or hyphenated code", async () => {
    getDel.mockResolvedValue(JSON.stringify(["x"]));
    await get("7k2-qm9x");
    expect(getDel).toHaveBeenCalledWith("transfer:7K2QM9X");
  });

  it("404s a code that expired or was already received", async () => {
    getDel.mockResolvedValue(null);
    const res = await get("7K2QM9X");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not_found");
    expect(body.message).toMatch(/expired or was already used/);
  });

  it("400s a malformed code without touching the store", async () => {
    const res = await get("nope");
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("bad_code");
    expect(getDel).not.toHaveBeenCalled();
  });

  it("502s a stored value it cannot read", async () => {
    getDel.mockResolvedValue("not json");
    expect((await get("7K2QM9X")).status).toBe(502);

    getDel.mockResolvedValue(JSON.stringify({ entries: "wrong shape" }));
    expect((await get("7K2QM9X")).status).toBe(502);
  });

  it("reports missing credentials as 503 and an upstream fault as 502", async () => {
    getDel.mockRejectedValueOnce(new NotConfiguredError());
    expect((await get("7K2QM9X")).status).toBe(503);

    getDel.mockRejectedValueOnce(new UpstreamError("boom"));
    expect((await get("7K2QM9X")).status).toBe(502);
  });
});

describe("browser client error messages", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const json = (body: unknown, status: number) =>
    Promise.resolve(new Response(JSON.stringify(body), { status }));

  it("returns the code on success", async () => {
    fetchMock.mockReturnValue(json({ code: "7K2QM9X" }, 200));
    await expect(sendEntries(["hello"])).resolves.toEqual({ ok: true, code: "7K2QM9X" });
  });

  it("distinguishes no network, no credentials and a broken store", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const offline = await sendEntries(["hello"]);
    expect(offline).toMatchObject({ ok: false });
    expect(!offline.ok && offline.message).toMatch(/no connection/i);

    fetchMock.mockReturnValueOnce(json({ error: "not_configured", message: "…" }, 503));
    const unconfigured = await sendEntries(["hello"]);
    expect(!unconfigured.ok && unconfigured.message).toMatch(/not set up/i);

    fetchMock.mockReturnValueOnce(json({ error: "upstream", message: "…" }, 502));
    const broken = await sendEntries(["hello"]);
    expect(!broken.ok && broken.message).toMatch(/unavailable/i);
  });

  it("refuses an empty send before reaching the network", async () => {
    const res = await sendEntries(["   "]);
    expect(!res.ok && res.message).toMatch(/nothing to send/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a malformed code before reaching the network", async () => {
    const res = await receiveCode("nope");
    expect(!res.ok && res.message).toMatch(/is not a code/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("passes the server's expired-or-used wording through", async () => {
    fetchMock.mockReturnValueOnce(
      json({ error: "not_found", message: "Code 7K2QM9X has expired or was already used." }, 404),
    );
    const res = await receiveCode("7k2qm9x");
    expect(fetchMock).toHaveBeenCalledWith("/api/transfer/7K2QM9X", { cache: "no-store" });
    expect(!res.ok && res.message).toBe("Code 7K2QM9X has expired or was already used.");
  });

  it("returns the received entries", async () => {
    fetchMock.mockReturnValueOnce(json({ entries: ["a", "b"] }, 200));
    await expect(receiveCode("7K2QM9X")).resolves.toEqual({ ok: true, entries: ["a", "b"] });
  });
});
