import { inject } from "vitest";
import pg from "pg";

export type Role = "anon" | "authenticated" | "service_role" | "postgres";

// 每個 client 都是獨立連線；非 postgres 角色以 SET ROLE 模擬 Supabase API 角色。
export async function connect(role: Role = "service_role") {
  const { host, port } = inject("pg");
  const client = new pg.Client({ host, port, user: "postgres", database: "postgres" });
  await client.connect();
  if (role !== "postgres") await client.query(`set role ${role}`);
  return client;
}

export async function reset() {
  const admin = await connect("postgres");
  await admin.query(
    "truncate public.leaderboard_entries, leaderboard_private.rate_limits",
  );
  await admin.end();
}

export type Entry = {
  submissionId: string;
  name?: unknown;
  score: unknown;
  fruits: unknown;
  bombs: unknown;
  maxCombo: unknown;
};

let serial = 0;
export function entry(score: number, extra: Partial<Entry> = {}): Entry {
  serial++;
  return {
    submissionId: `00000000-0000-4000-8000-${String(serial).padStart(12, "0")}`,
    name: `玩家${serial}`,
    score,
    fruits: Math.ceil(score / 10) + 1,
    bombs: 0,
    maxCombo: 0,
    ...extra,
  };
}

export async function submit(client: pg.Client, value: unknown) {
  const { rows } = await client.query(
    "select public.leaderboard_submit($1::jsonb) as r",
    [JSON.stringify(value)],
  );
  return rows[0].r;
}

export async function top(client: pg.Client) {
  const { rows } = await client.query("select public.leaderboard_top() as r");
  return rows[0].r as { rank: number; id: string; name: string; score: number }[];
}

export async function rows(client: pg.Client) {
  const admin = await connect("postgres");
  try {
    const r = await admin.query(
      "select * from public.leaderboard_entries order by accepted_order",
    );
    return r.rows;
  } finally {
    await admin.end();
  }
}

// 以 PostgREST 的具名參數呼叫方式執行 RPC，供 Edge handler 整合測試使用。
export function rpcFor(client: pg.Client) {
  return async (fn: string, args: Record<string, unknown>) => {
    const names = Object.keys(args);
    const sql = `select public.${fn}(${names
      .map((n, i) => `${n} => $${i + 1}`)
      .join(", ")}) as r`;
    const values = names.map((n) =>
      typeof args[n] === "object" && args[n] !== null
        ? JSON.stringify(args[n])
        : args[n],
    );
    const { rows } = await client.query(sql, values);
    return rows[0].r;
  };
}
