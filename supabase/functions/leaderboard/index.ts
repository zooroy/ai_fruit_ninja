// Supabase Edge Function 入口（Deno）。設定見 supabase/README.md。
import { createHandler, type Rpc } from "./handler.ts";

declare const Deno: {
  env: { get(key: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): unknown;
};

const env = (key: string) => Deno.env.get(key)?.trim() || undefined;
const supabaseUrl = env("SUPABASE_URL");
const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
const log = (message: string) => console.error(`[leaderboard] ${message}`);

// 只呼叫 handler 指定的固定 RPC；伺服器金鑰不寫入任何回應或 log。
const rpc: Rpc = async (fn, args) => {
  if (!supabaseUrl || !serviceKey) throw Error("missing Supabase credentials");
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw Error(`status ${res.status}`);
  return res.json();
};

const positive = (key: string, fallback: number) => {
  const n = Number(env(key));
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

let handle: (req: Request) => Promise<Response>;
try {
  handle = createHandler({
    rpc,
    allowedOrigins: (env("ALLOWED_ORIGINS") ?? "https://zooroy.github.io")
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean),
    rateLimitSecret: env("RATE_LIMIT_SECRET") ?? "",
    ipHeader: env("RATE_LIMIT_IP_HEADER"),
    perSourceLimit: positive("RATE_LIMIT_PER_MINUTE", 10),
    sharedLimit: positive("RATE_LIMIT_SHARED_PER_MINUTE", 30),
    windowSeconds: 60,
    log,
  });
} catch (e) {
  log(`configuration error: ${e instanceof Error ? e.message : String(e)}`);
  handle = async () =>
    new Response(
      JSON.stringify({
        error: { code: "service_unavailable", message: "排行榜暫時無法使用，請稍後再試。" },
      }),
      { status: 503, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } },
    );
}

Deno.serve((req) => handle(req));
