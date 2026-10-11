import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import { connect, entry, reset, rows, submit } from "./helpers";

let db: pg.Client;
beforeAll(async () => {
  db = await connect("service_role");
});
afterAll(() => db.end());
beforeEach(reset);

describe("leaderboard_submit idempotency", () => {
  it("returns the original success when a committed submission is retried", async () => {
    const payload = entry(120, { name: "  重試者 " });
    const first = await submit(db, payload);
    // 模擬回應遺失：用戶端沒看到 first，以完全相同 payload 再送一次。
    const retry = await submit(db, payload);
    expect(first).toMatchObject({ outcome: "accepted", created: true });
    expect(retry).toMatchObject({
      outcome: "accepted",
      created: false,
      entryId: first.entryId,
    });
    const all = await rows(db);
    expect(all).toHaveLength(1);
    expect(all[0].display_name).toBe("重試者");
  });

  it("returns the original success even after the entry fell out of the top ten", async () => {
    const payload = entry(10, { name: "早期玩家" });
    const first = await submit(db, payload);
    for (let i = 0; i < 10; i++) await submit(db, entry(500 - i * 5));
    const retry = await submit(db, payload);
    // 已滿榜且 10 分不足以入榜，但重試不重新套用門檻。
    expect(retry).toMatchObject({
      outcome: "accepted",
      created: false,
      entryId: first.entryId,
    });
    expect(retry.entries.some((e: { id: string }) => e.id === first.entryId)).toBe(false);
    expect(
      (await rows(db)).filter((r) => r.submission_id === payload.submissionId),
    ).toHaveLength(1);
  });

  it("treats a blank name and the default name as the same payload", async () => {
    const payload = entry(30, { name: "   " });
    const first = await submit(db, payload);
    const retry = await submit(db, { ...payload, name: "不知名的勇者" });
    expect(retry).toMatchObject({ outcome: "accepted", entryId: first.entryId });
  });

  it.each([
    ["name", { name: "別人" }],
    ["score", { score: 125 }],
    ["fruits", { fruits: 99 }],
    ["bombs", { bombs: 1 }],
    ["max combo", { maxCombo: 3 }],
  ])("rejects a different %s for the same submission without overwriting", async (_l, change) => {
    const payload = entry(120, { name: "原名" });
    await submit(db, payload);
    const conflict = await submit(db, { ...payload, ...change });
    expect(conflict.outcome).toBe("submission_conflict");
    const all = await rows(db);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({
      display_name: "原名",
      score: 120,
      fruits: payload.fruits,
      bombs: 0,
      max_combo: 0,
    });
  });

  it("does not store a rejected submission, so the same id may qualify later", async () => {
    for (let i = 0; i < 10; i++) await submit(db, entry(100));
    const payload = entry(100);
    expect((await submit(db, payload)).outcome).toBe("not_qualified");
    expect(
      (await rows(db)).some((r) => r.submission_id === payload.submissionId),
    ).toBe(false);
  });
});
