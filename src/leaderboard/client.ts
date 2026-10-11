// 排行榜 API client。只需要公開端點網址，不持有任何金鑰。

export type Entry = { rank: number; id: string; name: string; score: number };

export type SubmitPayload = Readonly<{
  submissionId: string;
  name: string;
  score: number;
  fruits: number;
  bombs: number;
  maxCombo: number;
}>;

export type Accepted = { created: boolean; entryId: string; entries: Entry[] };

export type FailureKind =
  | "aborted" // 呼叫端取消，結果應忽略
  | "timeout" // 送出結果不明
  | "network" // 送出結果不明
  | "unavailable" // 503 或其他 5xx，送出結果不明
  | "malformed" // 回應格式不符，送出結果不明
  | "rejected"; // 伺服器明確回應 4xx，見 status / code

export class LeaderboardError extends Error {
  constructor(
    readonly kind: FailureKind,
    readonly status = 0,
    readonly code = "",
    readonly entries: Entry[] | null = null,
    readonly retryAfter = 0,
  ) {
    super(`${kind}${code ? `:${code}` : ""}`);
  }
}

export type LeaderboardClient = {
  list(signal?: AbortSignal): Promise<Entry[]>;
  submit(payload: SubmitPayload, signal?: AbortSignal): Promise<Accepted>;
};

declare global {
  interface Window {
    /** 開發模式限定：E2E 以此覆寫端點，空字串代表未設定。 */
    __leaderboardUrl?: string;
  }
}

export function leaderboardUrl(): string | null {
  const raw =
    import.meta.env.DEV && typeof window !== "undefined" && "__leaderboardUrl" in window
      ? window.__leaderboardUrl
      : import.meta.env.VITE_LEADERBOARD_URL;
  const value = raw?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

function isEntry(e: unknown): e is Entry {
  const v = e as Entry;
  return (
    typeof v === "object" &&
    v !== null &&
    Number.isInteger(v.rank) &&
    v.rank >= 1 &&
    typeof v.id === "string" &&
    typeof v.name === "string" &&
    Number.isInteger(v.score) &&
    v.score >= 0
  );
}

function parseEntries(value: unknown): Entry[] | null {
  if (!Array.isArray(value) || value.length > 10 || !value.every(isEntry)) return null;
  return value.map(({ rank, id, name, score }) => ({ rank, id, name, score }));
}

export function createClient(
  url: string,
  options: { fetch?: typeof fetch; timeoutMs?: number } = {},
): LeaderboardClient {
  const doFetch = options.fetch ?? fetch.bind(globalThis);
  const timeoutMs = options.timeoutMs ?? 8000;

  async function request(init: RequestInit, signal?: AbortSignal) {
    if (signal?.aborted) throw new LeaderboardError("aborted");
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const forward = () => controller.abort();
    signal?.addEventListener("abort", forward);
    try {
      const res = await doFetch(url, {
        ...init,
        cache: "no-store",
        credentials: "omit",
        signal: controller.signal,
      });
      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        if (res.status < 500) throw new LeaderboardError("malformed", res.status);
      }
      return { res, body: body as Record<string, unknown> | null };
    } catch (e) {
      if (e instanceof LeaderboardError) throw e;
      if (signal?.aborted) throw new LeaderboardError("aborted");
      throw new LeaderboardError(timedOut ? "timeout" : "network");
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", forward);
    }
  }

  function failure(res: Response, body: Record<string, unknown> | null): never {
    if (res.status >= 500) throw new LeaderboardError("unavailable", res.status);
    const error = body?.error as { code?: unknown } | undefined;
    const code = typeof error?.code === "string" ? error.code : "";
    if (res.status < 400 || !code) throw new LeaderboardError("malformed", res.status);
    const retryAfter =
      res.status === 429
        ? Math.max(1, Math.ceil(Number(body?.retryAfter ?? res.headers.get("Retry-After")) || 30))
        : 0;
    throw new LeaderboardError(
      "rejected",
      res.status,
      code,
      parseEntries(body?.entries),
      retryAfter,
    );
  }

  return {
    async list(signal) {
      const { res, body } = await request({ method: "GET" }, signal);
      if (res.status !== 200) failure(res, body);
      const entries = parseEntries(body?.entries);
      if (!entries) throw new LeaderboardError("malformed", res.status);
      return entries;
    },
    async submit(payload, signal) {
      const { res, body } = await request(
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
        signal,
      );
      if (res.status !== 200 && res.status !== 201) failure(res, body);
      const entries = parseEntries(body?.entries);
      if (body?.outcome !== "accepted" || typeof body.entryId !== "string" || !entries)
        throw new LeaderboardError("malformed", res.status);
      return { created: res.status === 201, entryId: body.entryId, entries };
    },
  };
}
