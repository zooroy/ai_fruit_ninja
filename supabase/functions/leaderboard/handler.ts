// 公開排行榜 API。只做 HTTP、CORS、驗證、節流與錯誤映射；
// 資格判斷與寫入一致性由資料庫 RPC 在單一交易內完成。
import {
  normalizeName,
  plausibleStats,
  UUID,
  type RoundStats,
} from "../_shared/leaderboard-rules.ts";

export type RpcName =
  | "leaderboard_top"
  | "leaderboard_submit"
  | "leaderboard_take_submit_token";
export type Rpc = (fn: RpcName, args: Record<string, unknown>) => Promise<unknown>;

export type HandlerConfig = {
  rpc: Rpc;
  allowedOrigins: string[];
  rateLimitSecret: string;
  /** 由部署平台設定、客戶端無法偽造的來源 IP header；未設定時所有請求共用一個 bucket。 */
  ipHeader?: string;
  perSourceLimit?: number;
  sharedLimit?: number;
  windowSeconds?: number;
  log?: (message: string) => void;
};

export type PublicEntry = { rank: number; id: string; name: string; score: number };

export const MAX_BODY_BYTES = 4096;

const messages: Record<string, string> = {
  invalid_request: "請求格式不正確。",
  invalid_name: "名字需為 20 字以內，且不可包含控制字元。",
  invalid_stats: "成績資料不正確。",
  payload_too_large: "請求內容過大。",
  not_qualified: "這次成績未達前十名。",
  submission_conflict: "這局已用不同內容提交過。",
  rate_limited: "提交太頻繁，請稍後再試。",
  service_unavailable: "排行榜暫時無法使用，請稍後再試。",
  origin_not_allowed: "不允許的來源。",
  method_not_allowed: "不支援的請求方法。",
};

const submitKeys = new Set(["submissionId", "name", "score", "fruits", "bombs", "maxCombo"]);

class Unavailable extends Error {}

export function createHandler(config: HandlerConfig) {
  const {
    rpc,
    allowedOrigins,
    rateLimitSecret,
    ipHeader,
    perSourceLimit = 10,
    sharedLimit = 30,
    windowSeconds = 60,
    log = () => {},
  } = config;
  if (!rateLimitSecret) throw Error("rateLimitSecret is required");
  const origins = new Set(allowedOrigins);
  const keyPromise = crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(rateLimitSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  function respond(
    status: number,
    body: unknown,
    origin: string | null,
    headers: Record<string, string> = {},
  ) {
    const h = new Headers({
      "Cache-Control": "no-store",
      Vary: "Origin",
      ...headers,
    });
    if (origin) {
      h.set("Access-Control-Allow-Origin", origin);
      h.set("Access-Control-Expose-Headers", "Retry-After");
    }
    if (body === null) return new Response(null, { status, headers: h });
    h.set("Content-Type", "application/json; charset=utf-8");
    return new Response(JSON.stringify(body), { status, headers: h });
  }

  const error = (
    status: number,
    code: string,
    origin: string | null,
    extra: Record<string, unknown> = {},
    headers: Record<string, string> = {},
  ) => respond(status, { error: { code, message: messages[code] }, ...extra }, origin, headers);

  async function call(fn: RpcName, args: Record<string, unknown> = {}) {
    try {
      return await rpc(fn, args);
    } catch (e) {
      log(`rpc ${fn} failed: ${e instanceof Error ? e.message : String(e)}`);
      throw new Unavailable();
    }
  }

  function entries(value: unknown): PublicEntry[] {
    if (!Array.isArray(value)) throw new Unavailable();
    // 白名單輸出，即使 RPC 日後多回傳欄位也不外洩。
    return value.slice(0, 10).map((e) => ({
      rank: e.rank,
      id: e.id,
      name: e.name,
      score: e.score,
    }));
  }

  async function bucket(req: Request) {
    const raw = ipHeader ? req.headers.get(ipHeader) : null;
    // 多段時取最右側，也就是最靠近平台、由可信代理附加的一段。
    const source = raw?.split(",").pop()?.trim();
    if (!source) return { bucket: "shared", limit: sharedLimit };
    const mac = await crypto.subtle.sign("HMAC", await keyPromise, new TextEncoder().encode(source));
    const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
    return { bucket: `ip:${hex}`, limit: perSourceLimit };
  }

  async function readBody(req: Request): Promise<string | null> {
    const declared = Number(req.headers.get("Content-Length"));
    if (declared > MAX_BODY_BYTES) return null;
    if (!req.body) return "";
    const reader = req.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      bytes.set(c, offset);
      offset += c.byteLength;
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  }

  async function get(origin: string) {
    return respond(200, { entries: entries(await call("leaderboard_top")) }, origin);
  }

  async function post(req: Request, origin: string) {
    if (!/^application\/json\b/i.test(req.headers.get("Content-Type") ?? ""))
      return error(400, "invalid_request", origin);

    // 每個 POST 都計數（包含無效請求與重試）。
    const source = await bucket(req);
    const token = (await call("leaderboard_take_submit_token", {
      p_bucket: source.bucket,
      p_limit: source.limit,
      p_window_seconds: windowSeconds,
    })) as { allowed?: boolean; retryAfter?: number } | null;
    if (!token || typeof token.allowed !== "boolean") throw new Unavailable();
    if (!token.allowed) {
      const retryAfter = Math.max(1, Math.ceil(Number(token.retryAfter) || windowSeconds));
      return error(429, "rate_limited", origin, { retryAfter }, { "Retry-After": String(retryAfter) });
    }

    let text: string | null;
    try {
      text = await readBody(req);
    } catch {
      return error(400, "invalid_request", origin);
    }
    if (text === null) return error(400, "payload_too_large", origin);
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(text);
    } catch {
      return error(400, "invalid_request", origin);
    }
    if (
      typeof body !== "object" ||
      body === null ||
      Array.isArray(body) ||
      Object.keys(body).some((k) => !submitKeys.has(k)) ||
      typeof body.submissionId !== "string" ||
      !UUID.test(body.submissionId)
    )
      return error(400, "invalid_request", origin);
    if (body.name !== undefined && body.name !== null && typeof body.name !== "string")
      return error(400, "invalid_name", origin);
    const name = normalizeName((body.name as string | null | undefined) ?? "");
    if (!name.ok) return error(400, "invalid_name", origin);
    const stats = body as unknown as RoundStats;
    if (!plausibleStats(stats)) return error(400, "invalid_stats", origin);

    const result = (await call("leaderboard_submit", {
      p_entry: {
        submissionId: (body.submissionId as string).toLowerCase(),
        name: name.name,
        score: stats.score,
        fruits: stats.fruits,
        bombs: stats.bombs,
        maxCombo: stats.maxCombo,
      },
    })) as Record<string, unknown> | null;

    switch (result?.outcome) {
      case "accepted":
        return respond(
          result.created ? 201 : 200,
          { outcome: "accepted", entryId: result.entryId, entries: entries(result.entries) },
          origin,
        );
      case "not_qualified":
      case "submission_conflict":
        return error(409, result.outcome, origin, { entries: entries(result.entries) });
      case "invalid": {
        const code = ["invalid_name", "invalid_stats"].includes(result.code as string)
          ? (result.code as string)
          : "invalid_request";
        return error(400, code, origin);
      }
      default:
        throw new Unavailable();
    }
  }

  return async function handle(req: Request): Promise<Response> {
    const origin = req.headers.get("Origin");
    if (!origin || !origins.has(origin)) return error(403, "origin_not_allowed", null);
    const allow = "GET, POST, OPTIONS";
    if (req.method === "OPTIONS")
      return respond(204, null, origin, {
        "Access-Control-Allow-Methods": allow,
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "600",
      });
    try {
      if (req.method === "GET") return await get(origin);
      if (req.method === "POST") return await post(req, origin);
      return error(405, "method_not_allowed", origin, {}, { Allow: allow });
    } catch (e) {
      if (!(e instanceof Unavailable))
        log(`unexpected error: ${e instanceof Error ? e.message : String(e)}`);
      return error(503, "service_unavailable", origin);
    }
  };
}
