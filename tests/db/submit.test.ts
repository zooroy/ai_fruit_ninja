import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import { connect, entry, reset, rows, submit, top } from "./helpers";

let db: pg.Client;
beforeAll(async () => {
  db = await connect("service_role");
});
afterAll(() => db.end());
beforeEach(reset);

async function fill(scores: number[]) {
  for (const score of scores) {
    const r = await submit(db, entry(score));
    expect(r.outcome).toBe("accepted");
  }
}

describe("leaderboard_submit admission", () => {
  it("returns an empty board and accepts the first entry", async () => {
    expect(await top(db)).toEqual([]);
    const r = await submit(db, entry(0, { name: "首位" }));
    expect(r).toMatchObject({ outcome: "accepted", created: true });
    expect(r.entries).toEqual([
      { rank: 1, id: r.entryId, name: "首位", score: 0 },
    ]);
  });

  it("accepts any score while fewer than ten entries exist", async () => {
    await fill([500, 400, 300, 200, 150, 120, 110, 105, 100]);
    const r = await submit(db, entry(0));
    expect(r.outcome).toBe("accepted");
    expect(r.entries).toHaveLength(10);
    expect(r.entries[9]).toMatchObject({ rank: 10, score: 0 });
  });

  it("rejects a tie with the tenth place on a full board without writing", async () => {
    await fill([500, 400, 300, 200, 150, 120, 110, 105, 100, 100]);
    const before = await rows(db);
    const r = await submit(db, entry(100));
    expect(r.outcome).toBe("not_qualified");
    expect(r.entries).toHaveLength(10);
    expect(await rows(db)).toHaveLength(before.length);
  });

  it("rejects a lower score on a full board", async () => {
    await fill([500, 400, 300, 200, 150, 120, 110, 105, 100, 100]);
    expect((await submit(db, entry(80))).outcome).toBe("not_qualified");
  });

  it("admits a higher score and keeps the pushed-out entry stored", async () => {
    await fill([500, 400, 300, 200, 150, 120, 110, 105, 100, 95]);
    const r = await submit(db, entry(105, { name: "新人" }));
    expect(r).toMatchObject({ outcome: "accepted", created: true });
    expect(r.entries.map((e: { score: number }) => e.score)).toEqual([
      500, 400, 300, 200, 150, 120, 110, 105, 105, 100,
    ]);
    // 同分時較早接受者在前：既有 105 排第 8，新的 105 排第 9。
    expect(r.entries[8]).toMatchObject({ rank: 9, name: "新人" });
    const all = await rows(db);
    expect(all).toHaveLength(11);
    expect(all.some((row) => row.score === 95)).toBe(true);
    expect(r.entries.some((e: { score: number }) => e.score === 95)).toBe(false);
  });

  it("orders by score desc then server acceptance order, without shared ranks", async () => {
    const a = await submit(db, entry(150, { name: "同名" }));
    const b = await submit(db, entry(150, { name: "同名" }));
    await submit(db, entry(200));
    const board = await top(db);
    expect(board.map((e) => [e.rank, e.score])).toEqual([
      [1, 200],
      [2, 150],
      [3, 150],
    ]);
    expect(board[1].id).toBe(a.entryId);
    expect(board[2].id).toBe(b.entryId);
    const all = await rows(db);
    expect(all.map((row) => Number(row.accepted_order))).toEqual([1, 2, 3]);
    expect(all[0].accepted_at.getTime()).toBeLessThanOrEqual(
      all[1].accepted_at.getTime(),
    );
  });

  it("publishes only rank, id, name and score", async () => {
    await submit(db, entry(50));
    const [first] = await top(db);
    expect(Object.keys(first).sort()).toEqual(["id", "name", "rank", "score"]);
  });

  it("refuses to run under REPEATABLE READ", async () => {
    await db.query("begin isolation level repeatable read");
    await expect(submit(db, entry(10))).rejects.toThrow(/READ COMMITTED/);
    await db.query("rollback");
  });
});
