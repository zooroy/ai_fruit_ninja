import { describe, expect, it, vi } from "vitest";
import {
  createHandler,
  MAX_BODY_BYTES,
  type HandlerConfig,
  type Rpc,
} from "../supabase/functions/leaderboard/handler";

const ORIGIN = "https://zooroy.github.io";
const URL_ = "https://example.supabase.co/functions/v1/leaderboard";
const ID = "3f2b8e4a-1c2d-4e5f-8a9b-0c1d2e3f4a5b";
const board = [{ rank: 1, id: "e1", name: "阿明", score: 150 }];

function setup(overrides: Partial<HandlerConfig> = {}, results: Record<string, unknown> = {}) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const rpc: Rpc = vi.fn(async (fn, args) => {
    calls.push({ fn, args });
    if (fn in results) {
      const r = results[fn];
      if (r instanceof Error) throw r;
      return typeof r === "function" ? r(args) : r;
    }
    if (fn === "leaderboard_top") return board;
    if (fn === "leaderboard_take_submit_token") return { allowed: true, remaining: 9 };
    return { outcome: "accepted", created: true, entryId: "new", entries: board };
  });
  const logs: string[] = [];
  const handle = createHandler({
    rpc,
    allowedOrigins: [ORIGIN, "http://localhost:5188"],
    rateLimitSecret: "test-secret",
    log: (m) => logs.push(m),
    ...overrides,
  });
  return { handle, calls, logs };
}

const valid = { submissionId: ID, name: "阿明", score: 120, fruits: 12, bombs: 1, maxCombo: 3 };
const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request(URL_, {
    method: "POST",
    headers: { Origin: ORIGIN, "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
const get = (origin: string | null = ORIGIN) =>
  new Request(URL_, { headers: origin ? { Origin: origin } : {} });

describe("leaderboard edge handler: HTTP surface", () => {
  it("serves the public top ten without login, with no-store and CORS", async () => {
    const { handle, calls } = setup();
    const res = await handle(get());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ entries: board });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
    expect(res.headers.get("Vary")).toBe("Origin");
    expect(calls).toEqual([{ fn: "leaderboard_top", args: {} }]);
  });

  it("answers CORS preflight for allowed origins", async () => {
    const { handle, calls } = setup();
    const res = await handle(
      new Request(URL_, { method: "OPTIONS", headers: { Origin: "http://localhost:5188" } }),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:5188");
    expect(res.headers.get("Access-Control-Allow-Methods")).toBe("GET, POST, OPTIONS");
    expect(res.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type");
    expect(calls).toEqual([]);
  });

  it.each([["https://evil.example"], ["https://zooroy.github.io.evil.example"], [null]])(
    "rejects unknown origin %s without touching the database",
    async (origin) => {
      const { handle, calls } = setup();
      const res = await handle(get(origin));
      expect(res.status).toBe(403);
      expect((await res.json()).error.code).toBe("origin_not_allowed");
      expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
      expect(calls).toEqual([]);
    },
  );

  it.each(["PUT", "PATCH", "DELETE"])("rejects %s with 405", async (method) => {
    const { handle, calls } = setup();
    const res = await handle(new Request(URL_, { method, headers: { Origin: ORIGIN } }));
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("GET, POST, OPTIONS");
    expect((await res.json()).error.code).toBe("method_not_allowed");
    expect(calls).toEqual([]);
  });

  it("maps database failures to 503 without leaking details", async () => {
    const { handle, logs } = setup({}, {
      leaderboard_top: Error('relation "leaderboard_entries" does not exist; key=sb_secret_123'),
    });
    const res = await handle(get());
    expect(res.status).toBe(503);
    const text = await res.text();
    expect(JSON.parse(text).error.code).toBe("service_unavailable");
    expect(text).not.toMatch(/relation|sb_secret|leaderboard_entries/);
    expect(logs[0]).toMatch(/rpc leaderboard_top failed/);
  });

  it("maps malformed RPC results to 503", async () => {
    const { handle } = setup({}, { leaderboard_submit: { outcome: "weird" } });
    expect((await handle(post(valid))).status).toBe(503);
  });

  it("requires a rate limit secret", () => {
    expect(() => setup({ rateLimitSecret: "" })).toThrow(/rateLimitSecret/);
  });
});

describe("leaderboard edge handler: submission contract", () => {
  it("returns 201 for a first acceptance with only the fixed RPCs called", async () => {
    const { handle, calls } = setup();
    const res = await handle(post({ ...valid, submissionId: ID.toUpperCase() }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ outcome: "accepted", entryId: "new", entries: board });
    expect(calls.map((c) => c.fn)).toEqual(["leaderboard_take_submit_token", "leaderboard_submit"]);
    expect(calls[1].args).toEqual({ p_entry: { ...valid, submissionId: ID } });
  });

  it("returns 200 for an idempotent retry", async () => {
    const { handle } = setup({}, {
      leaderboard_submit: { outcome: "accepted", created: false, entryId: "old", entries: board },
    });
    const res = await handle(post(valid));
    expect(res.status).toBe(200);
    expect((await res.json()).entryId).toBe("old");
  });

  it.each(["not_qualified", "submission_conflict"])("maps %s to 409 with the latest board", async (outcome) => {
    const { handle } = setup({}, { leaderboard_submit: { outcome, entries: board } });
    const res = await handle(post(valid));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe(outcome);
    expect(body.error.message).toBeTruthy();
    expect(body.entries).toEqual(board);
  });

  it("maps database-side validation to 400", async () => {
    const { handle } = setup({}, { leaderboard_submit: { outcome: "invalid", code: "invalid_name" } });
    const res = await handle(post(valid));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("invalid_name");
  });

  it("returns 429 with Retry-After when throttled and never submits", async () => {
    const { handle, calls } = setup({}, {
      leaderboard_take_submit_token: { allowed: false, retryAfter: 37 },
    });
    const res = await handle(post(valid));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("37");
    expect(res.headers.get("Access-Control-Expose-Headers")).toBe("Retry-After");
    expect(await res.json()).toMatchObject({ error: { code: "rate_limited" }, retryAfter: 37 });
    expect(calls.map((c) => c.fn)).toEqual(["leaderboard_take_submit_token"]);
  });

  it("strips anything beyond public fields from returned entries", async () => {
    const leaky = [{ rank: 1, id: "e1", name: "x", score: 10, submission_id: ID, fruits: 3, ip: "1.2.3.4" }];
    const { handle } = setup({}, {
      leaderboard_top: leaky,
      leaderboard_submit: { outcome: "accepted", created: true, entryId: "e1", entries: leaky, submissionId: ID },
    });
    for (const res of [await handle(get()), await handle(post(valid))]) {
      const text = await res.text();
      expect(text).not.toMatch(new RegExp(`${ID}|fruits|1\\.2\\.3\\.4|submission`));
    }
  });
});

describe("leaderboard edge handler: input validation", () => {
  const rejects = async (body: unknown, code: string, headers?: Record<string, string>) => {
    const { handle, calls } = setup();
    const res = await handle(post(body, headers));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe(code);
    expect(calls.some((c) => c.fn === "leaderboard_submit")).toBe(false);
  };
  const accepts = async (body: unknown) => {
    const { handle, calls } = setup();
    const res = await handle(post(body));
    expect(res.status).toBe(201);
    return calls.find((c) => c.fn === "leaderboard_submit")!.args.p_entry as Record<string, unknown>;
  };

  it.each([
    ["missing name", undefined],
    ["null name", null],
    ["empty name", ""],
    ["whitespace name", "  　 \t"],
  ])("uses the default name for %s", async (_l, name) => {
    const entry = await accepts({ ...valid, name });
    expect(entry.name).toBe("不知名的勇者");
  });

  it.each([
    ["Chinese", "森林裡最快的刀客"],
    ["English", "Ninja Cat"],
    ["20 emoji", "🍉".repeat(20)],
    ["emoji ZWJ sequence", "👨‍👩‍👧 一家人"],
    ["HTML-looking text", "<b onclick=x>勇者</b>"],
  ])("accepts %s names, trimmed", async (_l, name) => {
    const entry = await accepts({ ...valid, name: `  ${name} ` });
    expect(entry.name).toBe(name);
  });

  it.each([
    ["21 code points", "一".repeat(21)],
    ["21 emoji", "🍉".repeat(21)],
    ["control character", "a\u0000b"],
    ["bell character", "勇\u0007者"],
    ["lone surrogate", "a\ud800b"],
    ["non-string", 123],
  ])("rejects %s names", async (_l, name) => {
    await rejects({ ...valid, name }, "invalid_name");
  });

  it.each([
    ["negative score", { score: -5 }],
    ["fractional score", { score: 12.5 }],
    ["string score", { score: "120" }],
    ["score not multiple of 5", { score: 121 }],
    ["score above 15 per fruit", { score: 195, fruits: 12 }],
    ["combo of 2", { maxCombo: 2 }],
    ["combo above fruits", { maxCombo: 13 }],
    ["negative bombs", { bombs: -1 }],
    ["fractional fruits", { fruits: 12.5 }],
    ["beyond integer range", { score: 2147483650, fruits: 2147483647 }],
    ["missing maxCombo", { maxCombo: undefined }],
  ])("rejects %s", async (_l, change) => {
    await rejects({ ...valid, ...change }, "invalid_stats");
  });

  it.each([
    ["non-JSON body", "not json"],
    ["array body", [valid]],
    ["missing submissionId", { ...valid, submissionId: undefined }],
    ["malformed submissionId", { ...valid, submissionId: "abc" }],
    ["unknown field", { ...valid, rank: 1 }],
  ])("rejects %s", async (_l, body) => {
    await rejects(body, "invalid_request");
  });

  it("rejects non-JSON content types", async () => {
    await rejects(valid, "invalid_request", { "Content-Type": "text/plain" });
  });

  it("rejects bodies over 4 KiB even without Content-Length", async () => {
    const big = JSON.stringify({ ...valid, name: "x".repeat(MAX_BODY_BYTES) });
    const { handle, calls } = setup();
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode(big));
        c.close();
      },
    });
    const req = new Request(URL_, {
      method: "POST",
      headers: { Origin: ORIGIN, "Content-Type": "application/json" },
      body: stream,
      duplex: "half",
    } as RequestInit);
    const res = await handle(req);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("payload_too_large");
    expect(calls.some((c) => c.fn === "leaderboard_submit")).toBe(false);
  });

  it("counts invalid requests against the rate limit", async () => {
    const { handle, calls } = setup();
    await handle(post({ ...valid, score: -5 }));
    expect(calls.map((c) => c.fn)).toEqual(["leaderboard_take_submit_token"]);
  });
});

describe("leaderboard edge handler: rate limit source", () => {
  const tokenArgs = async (overrides: Partial<HandlerConfig>, headers: Record<string, string>) => {
    const { handle, calls } = setup(overrides);
    await handle(post(valid, headers));
    return calls[0].args;
  };

  it("uses one conservative shared bucket when no trusted header is configured", async () => {
    const args = await tokenArgs({}, { "X-Forwarded-For": "1.2.3.4" });
    expect(args).toEqual({ p_bucket: "shared", p_limit: 30, p_window_seconds: 60 });
  });

  it("uses an HMAC of the trusted header, never the raw address", async () => {
    const config = { ipHeader: "x-real-ip" };
    const a = await tokenArgs(config, { "X-Real-IP": "203.0.113.9" });
    const b = await tokenArgs(config, { "X-Real-IP": "203.0.113.9" });
    const c = await tokenArgs(config, { "X-Real-IP": "198.51.100.7" });
    expect(a.p_bucket).toMatch(/^ip:[0-9a-f]{64}$/);
    expect(a.p_limit).toBe(10);
    expect(a.p_bucket).toBe(b.p_bucket);
    expect(a.p_bucket).not.toBe(c.p_bucket);
    expect(JSON.stringify(a)).not.toContain("203.0.113.9");
    const other = await tokenArgs({ ...config, rateLimitSecret: "different" }, { "X-Real-IP": "203.0.113.9" });
    expect(other.p_bucket).not.toBe(a.p_bucket);
  });

  it("takes the right-most proxy-appended value from a list header", async () => {
    const config = { ipHeader: "x-forwarded-for" };
    const spoofed = await tokenArgs(config, { "X-Forwarded-For": "6.6.6.6, 203.0.113.9" });
    const plain = await tokenArgs(config, { "X-Forwarded-For": "203.0.113.9" });
    expect(spoofed.p_bucket).toBe(plain.p_bucket);
  });

  it("falls back to the shared bucket when the trusted header is missing", async () => {
    const args = await tokenArgs({ ipHeader: "x-real-ip" }, {});
    expect(args.p_bucket).toBe("shared");
  });
});
