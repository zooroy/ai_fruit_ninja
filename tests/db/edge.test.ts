import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import { createHandler } from "../../supabase/functions/leaderboard/handler";
import { connect, entry, reset, rows, rpcFor, submit } from "./helpers";

const ORIGIN = "https://zooroy.github.io";
const URL_ = "https://example.supabase.co/functions/v1/leaderboard";
let db: pg.Client;
beforeAll(async () => {
  db = await connect("service_role");
});
afterAll(() => db.end());
beforeEach(reset);

const handlerOn = (client: pg.Client, extra = {}) =>
  createHandler({
    rpc: rpcFor(client),
    allowedOrigins: [ORIGIN],
    rateLimitSecret: "integration-secret",
    ipHeader: "x-real-ip",
    ...extra,
  });

let n = 0;
const body = (score: number, extra: Record<string, unknown> = {}) => {
  n++;
  return {
    submissionId: `30000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    name: `勇者${n}`,
    score,
    fruits: Math.ceil(score / 10) + 1,
    bombs: 0,
    maxCombo: 0,
    ...extra,
  };
};
const post = (value: unknown, ip = "203.0.113.1") =>
  new Request(URL_, {
    method: "POST",
    headers: { Origin: ORIGIN, "Content-Type": "application/json", "X-Real-IP": ip },
    body: JSON.stringify(value),
  });

describe("edge handler against the real database", () => {
  it("reads an empty board, accepts, replays and rejects like the contract", async () => {
    const handle = handlerOn(db);
    const empty = await handle(new Request(URL_, { headers: { Origin: ORIGIN } }));
    expect(await empty.json()).toEqual({ entries: [] });

    const payload = body(100, { name: "  " });
    const first = await handle(post(payload));
    expect(first.status).toBe(201);
    const accepted = await first.json();
    expect(accepted.entries).toEqual([
      { rank: 1, id: accepted.entryId, name: "不知名的勇者", score: 100 },
    ]);

    const replay = await handle(post(payload, "203.0.113.2"));
    expect(replay.status).toBe(200);
    expect((await replay.json()).entryId).toBe(accepted.entryId);

    const conflict = await handle(post({ ...payload, name: "改名" }, "203.0.113.3"));
    expect(conflict.status).toBe(409);
    expect((await conflict.json()).error.code).toBe("submission_conflict");

    for (let i = 0; i < 9; i++) await submit(db, entry(200));
    const low = await handle(post(body(100), "203.0.113.4"));
    expect(low.status).toBe(409);
    const lowBody = await low.json();
    expect(lowBody.error.code).toBe("not_qualified");
    expect(lowBody.entries).toHaveLength(10);
    expect(await rows(db)).toHaveLength(10);
  });

  it("never returns submission ids or private stats", async () => {
    const handle = handlerOn(db);
    const payload = body(55, { fruits: 7, bombs: 2, maxCombo: 3 });
    const text = await (await handle(post(payload))).text();
    const read = await (await handle(new Request(URL_, { headers: { Origin: ORIGIN } }))).text();
    for (const t of [text, read]) {
      expect(t).not.toContain(payload.submissionId);
      expect(t).not.toMatch(/fruits|bombs|combo|accepted_|submission/i);
      expect(t).not.toContain("203.0.113.1");
    }
  });

  it("stores nothing for invalid requests", async () => {
    const handle = handlerOn(db);
    for (const bad of [
      body(-5),
      body(12),
      body(150, { fruits: 2 }),
      body(30, { maxCombo: 2 }),
      body(30, { name: "一".repeat(21) }),
      body(30, { name: "a\u0001" }),
    ])
      expect((await handle(post(bad))).status).toBe(400);
    expect(await rows(db)).toEqual([]);
  });
});

describe("SQL boundary validation (direct RPC)", () => {
  const invalid = async (value: unknown, code: string) => {
    const r = await submit(db, value);
    expect(r).toEqual({ outcome: "invalid", code });
  };

  it.each([
    ["not an object", [1, 2], "invalid_request"],
    ["missing id", { score: 0, fruits: 0, bombs: 0, maxCombo: 0 }, "invalid_request"],
    ["bad id", { ...entry(0), submissionId: "nope" }, "invalid_request"],
    ["numeric name", { ...entry(0), name: 5 }, "invalid_name"],
    ["21 code points", { ...entry(0), name: "🍉".repeat(21) }, "invalid_name"],
    ["control character", { ...entry(0), name: "a\u001fb" }, "invalid_name"],
    ["negative score", { ...entry(0), score: -5 }, "invalid_stats"],
    ["fractional score", { ...entry(0), score: 2.5 }, "invalid_stats"],
    ["string score", { ...entry(0), score: "5" }, "invalid_stats"],
    ["score not multiple of 5", { ...entry(0), score: 7, fruits: 1 }, "invalid_stats"],
    ["score above 15 per fruit", { ...entry(0), score: 20, fruits: 1 }, "invalid_stats"],
    ["combo 1", { ...entry(0), maxCombo: 1 }, "invalid_stats"],
    ["combo above fruits", { ...entry(0), fruits: 3, maxCombo: 4 }, "invalid_stats"],
    ["above integer range", { ...entry(0), bombs: 2147483648 }, "invalid_stats"],
    ["missing bombs", { ...entry(0), bombs: undefined }, "invalid_stats"],
  ])("rejects %s", async (_l, value, code) => {
    await invalid(value, code);
    expect(await rows(db)).toEqual([]);
  });

  it.each([
    ["Chinese", "森林刀客"],
    ["English", "Ninja"],
    ["20 emoji", "🍉".repeat(20)],
    ["ZWJ emoji", "👨‍👩‍👧"],
  ])("accepts %s names", async (_l, name) => {
    const r = await submit(db, entry(0, { name: ` ${name}\t` }));
    expect(r.outcome).toBe("accepted");
    expect(r.entries[0].name).toBe(name);
  });
});

// 以一小時視窗測試，避免恰好跨越分鐘邊界造成計數分裂。
const hour = { windowSeconds: 3600 };
describe("database rate limit", () => {
  it("shares the limit across separate function instances and connections", async () => {
    const other = await connect("service_role");
    try {
      const a = handlerOn(db, hour);
      const b = handlerOn(other, hour);
      const statuses: number[] = [];
      for (let i = 0; i < 12; i++)
        statuses.push((await (i % 2 ? a : b)(post(body(5), "198.51.100.1"))).status);
      expect(statuses.filter((s) => s === 201)).toHaveLength(10);
      expect(statuses.slice(10)).toEqual([429, 429]);
      const limited = await a(post(body(5), "198.51.100.1"));
      const retryAfter = Number(limited.headers.get("Retry-After"));
      expect(retryAfter).toBeGreaterThanOrEqual(1);
      expect(retryAfter).toBeLessThanOrEqual(3600);
      // 另一個來源有獨立額度。
      expect((await a(post(body(10), "198.51.100.2"))).status).toBe(201);
    } finally {
      await other.end();
    }
  });

  it("cannot be bypassed by parallel requests on separate connections", async () => {
    const clients = await Promise.all(Array.from({ length: 20 }, () => connect("service_role")));
    try {
      const results = await Promise.all(
        clients.map((c) => handlerOn(c, hour)(post(body(5), "198.51.100.9"))),
      );
      const statuses = results.map((r) => r.status);
      expect(statuses.filter((s) => s === 201)).toHaveLength(10);
      expect(statuses.filter((s) => s === 429)).toHaveLength(10);
    } finally {
      await Promise.all(clients.map((c) => c.end()));
    }
  });

  it("stores only HMAC buckets and purges windows older than 24 hours", async () => {
    const admin = await connect("postgres");
    try {
      await admin.query(
        "insert into leaderboard_private.rate_limits values ('shared', now() - interval '25 hours', 3), ('shared', now() - interval '23 hours', 3)",
      );
      await handlerOn(db)(post(body(5), "192.0.2.77"));
      const { rows: left } = await admin.query(
        "select bucket, window_start > now() - interval '24 hours' as fresh from leaderboard_private.rate_limits",
      );
      expect(left.every((r) => r.fresh)).toBe(true);
      expect(left).toHaveLength(2);
      expect(JSON.stringify(left)).not.toContain("192.0.2.77");
      expect(left.some((r) => /^ip:[0-9a-f]{64}$/.test(r.bucket))).toBe(true);
    } finally {
      await admin.end();
    }
  });

  it("rejects malformed bucket arguments", async () => {
    await expect(
      db.query("select public.leaderboard_take_submit_token('1.2.3.4', 10, 60)"),
    ).rejects.toThrow(/invalid rate limit/);
  });
});
