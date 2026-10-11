import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient, LeaderboardError, leaderboardUrl, type SubmitPayload } from "../src/leaderboard/client";

const URL_ = "https://example.supabase.co/functions/v1/leaderboard";
const entries = [{ rank: 1, id: "e1", name: "阿明", score: 150 }];
const payload: SubmitPayload = {
  submissionId: "3f2b8e4a-1c2d-4e5f-8a9b-0c1d2e3f4a5b",
  name: "阿明",
  score: 120,
  fruits: 12,
  bombs: 0,
  maxCombo: 3,
};
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

async function failure(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (e) {
    expect(e).toBeInstanceOf(LeaderboardError);
    return e as LeaderboardError;
  }
  throw Error("expected failure");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("leaderboard client", () => {
  it("GETs the public board with no credentials or keys", async () => {
    const fetch = vi.fn(async () => json(200, { entries }));
    expect(await createClient(URL_, { fetch }).list()).toEqual(entries);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(URL_);
    expect(init).toMatchObject({ method: "GET", cache: "no-store", credentials: "omit" });
    expect(JSON.stringify(init.headers ?? {})).not.toMatch(/authorization|apikey/i);
  });

  it("POSTs the snapshot and distinguishes created from replayed", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json(201, { outcome: "accepted", entryId: "e1", entries }))
      .mockResolvedValueOnce(json(200, { outcome: "accepted", entryId: "e1", entries }));
    const client = createClient(URL_, { fetch });
    expect(await client.submit(payload)).toEqual({ created: true, entryId: "e1", entries });
    expect((await client.submit(payload)).created).toBe(false);
    const init = fetch.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual(payload);
  });

  it("strips unexpected fields from entries", async () => {
    const fetch = vi.fn(async () => json(200, { entries: [{ ...entries[0], submissionId: "x" }] }));
    expect(await createClient(URL_, { fetch }).list()).toEqual(entries);
  });

  it.each([
    ["missing entries", {}],
    ["entries not an array", { entries: "x" }],
    ["more than ten", { entries: Array.from({ length: 11 }, (_, i) => ({ ...entries[0], rank: i + 1 })) }],
    ["bad entry", { entries: [{ rank: 1, id: 1, name: "x", score: 1 }] }],
    ["negative score", { entries: [{ ...entries[0], score: -5 }] }],
  ])("treats %s as malformed", async (_l, body) => {
    const fetch = vi.fn(async () => json(200, body));
    expect((await failure(createClient(URL_, { fetch }).list())).kind).toBe("malformed");
  });

  it("treats a non-JSON success as malformed", async () => {
    const fetch = vi.fn(async () => new Response("<html>", { status: 200 }));
    expect((await failure(createClient(URL_, { fetch }).list())).kind).toBe("malformed");
  });

  it("maps 4xx error codes with entries and retry time", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json(409, { error: { code: "not_qualified" }, entries }))
      .mockResolvedValueOnce(json(429, { error: { code: "rate_limited" }, retryAfter: 42 }))
      .mockResolvedValueOnce(json(429, { error: { code: "rate_limited" } }, { "Retry-After": "7" }))
      .mockResolvedValueOnce(json(400, { error: { code: "invalid_name" } }));
    const client = createClient(URL_, { fetch });
    const conflict = await failure(client.submit(payload));
    expect(conflict).toMatchObject({ kind: "rejected", status: 409, code: "not_qualified", entries });
    expect(await failure(client.submit(payload))).toMatchObject({ status: 429, retryAfter: 42 });
    expect(await failure(client.submit(payload))).toMatchObject({ status: 429, retryAfter: 7 });
    expect(await failure(client.submit(payload))).toMatchObject({ status: 400, code: "invalid_name" });
  });

  it("maps 5xx, even with an HTML body, to unavailable", async () => {
    const fetch = vi.fn(async () => new Response("bad gateway", { status: 502 }));
    expect((await failure(createClient(URL_, { fetch }).submit(payload))).kind).toBe("unavailable");
  });

  it("maps fetch failures to network", async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect((await failure(createClient(URL_, { fetch }).list())).kind).toBe("network");
  });

  it("times out slow requests", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_, reject) =>
          init.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))),
        ),
    );
    const pending = failure(createClient(URL_, { fetch: fetch as unknown as typeof globalThis.fetch, timeoutMs: 100 }).submit(payload));
    await vi.advanceTimersByTimeAsync(150);
    expect((await pending).kind).toBe("timeout");
  });

  it("reports caller cancellation as aborted, not as a failure", async () => {
    const fetch = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_, reject) =>
          init.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))),
        ),
    );
    const controller = new AbortController();
    const pending = failure(createClient(URL_, { fetch: fetch as unknown as typeof globalThis.fetch }).list(controller.signal));
    controller.abort();
    expect((await pending).kind).toBe("aborted");
  });
});

describe("leaderboard endpoint configuration", () => {
  it("is unconfigured when the public URL is empty or invalid", () => {
    vi.stubEnv("VITE_LEADERBOARD_URL", "");
    expect(leaderboardUrl()).toBeNull();
    vi.stubEnv("VITE_LEADERBOARD_URL", "   ");
    expect(leaderboardUrl()).toBeNull();
    vi.stubEnv("VITE_LEADERBOARD_URL", "not a url");
    expect(leaderboardUrl()).toBeNull();
    vi.stubEnv("VITE_LEADERBOARD_URL", "javascript:alert(1)");
    expect(leaderboardUrl()).toBeNull();
  });

  it("uses the configured public URL", () => {
    vi.stubEnv("VITE_LEADERBOARD_URL", ` ${URL_} `);
    expect(leaderboardUrl()).toBe(URL_);
  });
});
