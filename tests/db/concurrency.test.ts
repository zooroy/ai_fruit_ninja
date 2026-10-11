import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import { connect, entry, reset, rows, submit } from "./helpers";

// 每個案例使用不同資料庫連線，並用 pg_stat_activity 確認後到者確實在等待鎖，
// 而不是剛好依序執行。
let a: pg.Client, b: pg.Client, observer: pg.Client;
beforeEach(async () => {
  await reset();
  [a, b, observer] = await Promise.all([
    connect("service_role"),
    connect("service_role"),
    connect("postgres"),
  ]);
});
afterEach(async () => {
  await Promise.all([a.end(), b.end(), observer.end()]);
});

async function pid(client: pg.Client) {
  const { rows } = await client.query("select pg_backend_pid() as pid");
  return rows[0].pid as number;
}

async function waitUntilBlocked(target: number) {
  for (let i = 0; i < 200; i++) {
    const { rows } = await observer.query(
      "select wait_event_type, wait_event from pg_stat_activity where pid = $1",
      [target],
    );
    if (rows[0]?.wait_event_type === "Lock" && rows[0]?.wait_event === "advisory")
      return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw Error("second submission never waited on the leaderboard lock");
}

async function fill(scores: number[]) {
  for (const s of scores) expect((await submit(a, entry(s))).outcome).toBe("accepted");
}

describe("concurrent submissions", () => {
  it("gives the last open slot only to the first accepted of two tied candidates", async () => {
    await fill([900, 800, 700, 600, 500, 400, 300, 200, 100]);
    const first = entry(50, { name: "先" });
    const second = entry(50, { name: "後" });
    const bPid = await pid(b);
    await a.query("begin");
    const ra = await submit(a, first);
    expect(ra).toMatchObject({ outcome: "accepted", created: true });
    const pending = submit(b, second);
    await waitUntilBlocked(bPid);
    await a.query("commit");
    const rb = await pending;
    expect(rb.outcome).toBe("not_qualified");
    const all = await rows(a);
    expect(all).toHaveLength(10);
    expect(all.filter((r) => r.score === 50).map((r) => r.display_name)).toEqual(["先"]);
  });

  it("stores only one row when the same submission is sent twice at once", async () => {
    const payload = entry(70);
    const bPid = await pid(b);
    await a.query("begin");
    const ra = await submit(a, payload);
    const pending = submit(b, payload);
    await waitUntilBlocked(bPid);
    await a.query("commit");
    const rb = await pending;
    expect(ra).toMatchObject({ outcome: "accepted", created: true });
    expect(rb).toMatchObject({ outcome: "accepted", created: false, entryId: ra.entryId });
    expect(await rows(a)).toHaveLength(1);
  });

  it("re-reads the cutoff after the lock instead of an older snapshot", async () => {
    await fill([900, 800, 700, 600, 500, 400, 300, 200, 100, 60]);
    const bPid = await pid(b);
    // b 的交易在 a 提高門檻之前就已開始並讀過榜單。
    await b.query("begin");
    const { rows: early } = await b.query(
      "select min(score)::int as cutoff from (select score from public.leaderboard_entries order by score desc, accepted_order limit 10) t",
    );
    expect(early[0].cutoff).toBe(60);
    await a.query("begin");
    expect((await submit(a, entry(150))).outcome).toBe("accepted");
    const pending = submit(b, entry(90));
    await waitUntilBlocked(bPid);
    await a.query("commit");
    // 若沿用舊快照，90 > 60 會被誤收；正確門檻已是 100。
    const rb = await pending;
    await b.query("commit");
    expect(rb.outcome).toBe("not_qualified");
    expect(rb.entries[9].score).toBe(100);
    expect((await rows(a)).some((r) => r.score === 90)).toBe(false);
  });

  it("serializes many parallel submissions into ten unique, gap-free acceptance orders", async () => {
    const clients = await Promise.all(
      Array.from({ length: 12 }, () => connect("service_role")),
    );
    try {
      const results = await Promise.all(
        clients.map((c, i) => submit(c, entry(10 + (i % 3) * 5))),
      );
      expect(results.every((r) => r.outcome === "accepted" || r.outcome === "not_qualified")).toBe(true);
      const all = await rows(a);
      expect(all.length).toBeGreaterThanOrEqual(10);
      expect(all.map((r) => Number(r.accepted_order))).toEqual(
        all.map((_, i) => i + 1),
      );
    } finally {
      await Promise.all(clients.map((c) => c.end()));
    }
  });
});
