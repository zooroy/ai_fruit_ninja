// 以 initdb 建立只走 unix socket 的拋棄式 PostgreSQL 叢集，套用 Supabase 角色骨架與
// supabase/migrations。不連線、不修改本機既有資料庫。
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";

const candidates = [
  "/opt/homebrew/opt/postgresql@16/bin",
  "/usr/local/opt/postgresql@16/bin",
  "/opt/homebrew/opt/postgresql@17/bin",
  "/usr/lib/postgresql/17/bin",
  "/usr/lib/postgresql/16/bin",
];

export function pgBin() {
  if (process.env.PG_BIN) return process.env.PG_BIN;
  try {
    return execFileSync("pg_config", ["--bindir"], { encoding: "utf8" }).trim();
  } catch {
    const found = candidates.find((dir) => existsSync(join(dir, "initdb")));
    if (found) return found;
    throw Error(
      "找不到 PostgreSQL 執行檔：請安裝 PostgreSQL 16 並設定 PG_BIN（含 initdb、pg_ctl 的目錄）。",
    );
  }
}

// 對應 Supabase 預設：三個 API 角色可使用 public schema，且新表與函式預設授權給它們。
// migration 必須自行撤銷，測試才能證明權限真的被收緊。
const supabaseRoles = `
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

export type Cluster = { host: string; port: number; stop(): void };

export async function startCluster(): Promise<Cluster> {
  const bin = pgBin();
  const dir = mkdtempSync(join(tmpdir(), "pglb-"));
  const data = join(dir, "data");
  const port = 50000 + Math.floor(Math.random() * 10000);
  execFileSync(join(bin, "initdb"), [
    "-D", data, "-U", "postgres", "--auth=trust", "-E", "UTF8",
    "--locale=en_US.UTF-8", "--no-instructions",
  ], { stdio: "ignore" });
  execFileSync(join(bin, "pg_ctl"), [
    "-D", data, "-w", "-l", join(dir, "log"),
    "-o", `-p ${port} -k ${dir} -c listen_addresses=''`, "start",
  ], { stdio: "ignore" });
  const stop = () => {
    try {
      execFileSync(join(bin, "pg_ctl"), ["-D", data, "-m", "immediate", "stop"], { stdio: "ignore" });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
  try {
    const client = new pg.Client({ host: dir, port, user: "postgres", database: "postgres" });
    await client.connect();
    await client.query(supabaseRoles);
    const migrations = join(import.meta.dirname, "../../supabase/migrations");
    for (const file of readdirSync(migrations).filter((f) => f.endsWith(".sql")).sort())
      await client.query(readFileSync(join(migrations, file), "utf8"));
    await client.end();
  } catch (error) {
    stop();
    throw error;
  }
  return { host: dir, port, stop };
}
