import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import { connect, reset } from "./helpers";

// 直接以 postgres 寫入，驗證資料表約束本身（不經 RPC）。
let admin: pg.Client;
let n = 0;
const insert = (values: Partial<Record<string, unknown>> = {}) => {
  n++;
  const row = {
    submission_id: `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    display_name: "勇者",
    score: 100,
    fruits: 10,
    bombs: 0,
    max_combo: 0,
    accepted_at: new Date(),
    accepted_order: n,
    ...values,
  };
  const keys = Object.keys(row);
  return admin.query(
    `insert into public.leaderboard_entries (${keys.join(",")}) values (${keys
      .map((_, i) => `$${i + 1}`)
      .join(",")})`,
    Object.values(row),
  );
};

beforeAll(async () => {
  admin = await connect("postgres");
});
afterAll(() => admin.end());
beforeEach(reset);

describe("leaderboard_entries schema", () => {
  it("applies to a clean database with ranking index and unique keys", async () => {
    const { rows } = await admin.query(
      "select indexname, indexdef from pg_indexes where tablename = 'leaderboard_entries' order by indexname",
    );
    const defs = Object.fromEntries(rows.map((r) => [r.indexname, r.indexdef]));
    expect(defs.leaderboard_entries_rank_idx).toMatch(
      /\(score DESC, accepted_order\)/,
    );
    expect(defs.leaderboard_entries_submission_id_key).toMatch(/UNIQUE/);
    expect(defs.leaderboard_entries_accepted_order_key).toMatch(/UNIQUE/);
    const rls = await admin.query(
      "select relrowsecurity from pg_class where oid = 'public.leaderboard_entries'::regclass",
    );
    expect(rls.rows[0].relrowsecurity).toBe(true);
  });

  it("keeps separate rows for the same display name", async () => {
    await insert({ display_name: "阿明", score: 150 });
    await insert({ display_name: "阿明", score: 150 });
    const { rows } = await admin.query(
      "select count(*)::int as c from public.leaderboard_entries where display_name = '阿明'",
    );
    expect(rows[0].c).toBe(2);
  });

  it("rejects a duplicate submission_id", async () => {
    await insert({ submission_id: "20000000-0000-4000-8000-000000000001" });
    await expect(
      insert({ submission_id: "20000000-0000-4000-8000-000000000001" }),
    ).rejects.toThrow(/leaderboard_entries_submission_id_key/);
  });

  it.each([
    ["empty name", { display_name: "" }],
    ["21 code points", { display_name: "一".repeat(21) }],
    ["control character", { display_name: "a\u0007b" }],
    ["untrimmed name", { display_name: " 勇者" }],
    ["negative score", { score: -5 }],
    ["score not in 5-point units", { score: 12 }],
    ["score above 15 per fruit", { score: 155, fruits: 10 }],
    ["combo of 2", { max_combo: 2 }],
    ["combo above fruits", { max_combo: 11, fruits: 10 }],
    ["negative bombs", { bombs: -1 }],
    ["zero accepted order", { accepted_order: 0 }],
  ])("rejects %s", async (_label, values) => {
    await expect(insert(values)).rejects.toThrow(/violates check constraint/);
  });

  it("accepts 20 code points including emoji and the maximum plausible score", async () => {
    await insert({ display_name: "🍉".repeat(20) });
    await insert({ score: 150, fruits: 10, max_combo: 10 });
    const { rows } = await admin.query(
      "select count(*)::int as c from public.leaderboard_entries",
    );
    expect(rows[0].c).toBe(2);
  });
});
