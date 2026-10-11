import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import { connect, entry, reset, rows, submit, top, type Role } from "./helpers";

const visitors: Role[] = ["anon", "authenticated"];
const clients = new Map<Role, pg.Client>();
beforeAll(async () => {
  for (const role of [...visitors, "service_role" as const])
    clients.set(role, await connect(role));
});
afterAll(async () => {
  for (const c of clients.values()) await c.end();
});
beforeEach(async () => {
  await reset();
  await submit(clients.get("service_role")!, entry(100, { name: "既有" }));
});

const denied = /permission denied/;

describe.each(visitors)("%s visitor", (role) => {
  const db = () => clients.get(role)!;

  it("cannot read, insert, update or delete the table directly", async () => {
    await expect(db().query("select * from public.leaderboard_entries")).rejects.toThrow(denied);
    await expect(
      db().query("select submission_id from public.leaderboard_entries"),
    ).rejects.toThrow(denied);
    await expect(
      db().query(
        `insert into public.leaderboard_entries
          (submission_id, display_name, score, fruits, bombs, max_combo, accepted_at, accepted_order)
         values (gen_random_uuid(), 'x', 9995, 9999, 0, 0, now(), 999)`,
      ),
    ).rejects.toThrow(denied);
    await expect(
      db().query("update public.leaderboard_entries set score = 99995"),
    ).rejects.toThrow(denied);
    await expect(db().query("delete from public.leaderboard_entries")).rejects.toThrow(denied);
    await expect(
      db().query("truncate public.leaderboard_entries"),
    ).rejects.toThrow(denied);
  });

  it("cannot execute any leaderboard RPC or touch the rate limit table", async () => {
    await expect(top(db())).rejects.toThrow(denied);
    await expect(submit(db(), entry(50))).rejects.toThrow(denied);
    await expect(
      db().query("select public.leaderboard_take_submit_token('shared', 10, 60)"),
    ).rejects.toThrow(denied);
    await expect(
      db().query("select * from leaderboard_private.rate_limits"),
    ).rejects.toThrow(denied);
    await expect(
      db().query("select leaderboard_private.purge_rate_limits()"),
    ).rejects.toThrow(denied);
  });

  it("leaves data unchanged after the attempts", async () => {
    await db().query("select 1");
    const all = await rows(db());
    expect(all).toHaveLength(1);
    expect(all[0].score).toBe(100);
  });
});

describe("service_role", () => {
  const db = () => clients.get("service_role")!;

  it("executes the fixed RPCs", async () => {
    expect((await submit(db(), entry(150))).outcome).toBe("accepted");
    expect(await top(db())).toHaveLength(2);
    const { rows } = await db().query(
      "select public.leaderboard_take_submit_token('shared', 10, 60) as r",
    );
    expect(rows[0].r.allowed).toBe(true);
  });

  it("only receives public fields from the read RPC", async () => {
    const board = await top(db());
    const json = JSON.stringify(board);
    expect(json).not.toMatch(/submission|fruits|bombs|combo|accepted/);
  });
});

describe("function hardening", () => {
  it("pins search_path and uses security invoker on every leaderboard function", async () => {
    const admin = clients.get("service_role")!;
    const { rows } = await admin.query(`
      select p.proname, p.prosecdef, p.proconfig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where (n.nspname = 'public' and p.proname like 'leaderboard%')
         or n.nspname = 'leaderboard_private'`);
    expect(rows.length).toBe(5);
    for (const r of rows) {
      expect(r.prosecdef, r.proname).toBe(false);
      expect(r.proconfig, r.proname).toContain('search_path=""');
    }
  });
});
