// 單一局結算的排行榜狀態。每局建立一個 session；離開結算畫面即 dispose，
// 之後才返回的回應一律忽略，不會改寫新畫面。
import { normalizeName } from "../../supabase/functions/_shared/leaderboard-rules.ts";
import {
  LeaderboardError,
  type Entry,
  type LeaderboardClient,
  type SubmitPayload,
} from "./client";
import { nameErrors, qualifies, standing, type Standing } from "./rules";

export type Snapshot = Readonly<{
  submissionId: string;
  score: number;
  fruits: number;
  bombs: number;
  maxCombo: number;
}>;

export type SubmitFailure =
  | "network" // 結果不明，以原內容重試
  | "rate_limited"
  | "conflict" // 終止，不再提供送出
  | "invalid"; // 400 非姓名錯誤，終止

export type SessionState =
  | { status: "loading" }
  | { status: "unconfigured" }
  | { status: "load-error" }
  | {
      status: "ready";
      entries: Entry[];
      standing: Standing;
      qualified: boolean;
      /** 送出後伺服器判定資格已失效 */
      lost: boolean;
      fieldError: string;
    }
  | { status: "submitting"; entries: Entry[]; standing: Standing; payload: SubmitPayload }
  | { status: "submitted"; entries: Entry[]; entryId: string; onBoard: boolean }
  | {
      status: "submit-error";
      entries: Entry[];
      standing: Standing;
      failure: SubmitFailure;
      payload: SubmitPayload | null;
      retryAt: number;
    };

export class ResultSession {
  state: SessionState;
  private payload: SubmitPayload | null = null;
  private controller: AbortController | null = null;
  private disposed = false;

  constructor(
    readonly snapshot: Snapshot,
    private client: LeaderboardClient | null,
    private onChange: (state: SessionState) => void = () => {},
    private now: () => number = Date.now,
  ) {
    this.state = client ? { status: "loading" } : { status: "unconfigured" };
  }

  private set(state: SessionState) {
    if (this.disposed) return;
    this.state = state;
    this.onChange(state);
  }

  private ready(entries: Entry[], lost = false, fieldError = ""): SessionState {
    const s = standing(entries, this.snapshot.score);
    return { status: "ready", entries, standing: s, qualified: qualifies(s), lost, fieldError };
  }

  /** 首次讀榜與讀取失敗後重試。 */
  async load() {
    if (!this.client || this.disposed) return;
    if (this.state.status !== "loading" && this.state.status !== "load-error") return;
    this.controller?.abort();
    const controller = (this.controller = new AbortController());
    this.set({ status: "loading" });
    try {
      const entries = await this.client.list(controller.signal);
      if (controller.signal.aborted) return;
      this.set(this.ready(entries));
    } catch (e) {
      if (controller.signal.aborted || (e instanceof LeaderboardError && e.kind === "aborted")) return;
      this.set({ status: "load-error" });
    }
  }

  /** 留名送出；結果不明時重試會沿用第一次送出的內容，忽略新輸入的名字。 */
  async submit(rawName: string) {
    if (!this.client || this.disposed) return;
    const st = this.state;
    let entries: Entry[];
    if (st.status === "ready" && st.qualified) entries = st.entries;
    else if (st.status === "submit-error" && (st.failure === "network" || st.failure === "rate_limited")) {
      if (this.now() < st.retryAt) return;
      entries = st.entries;
    } else return;

    if (!this.payload) {
      const name = normalizeName(rawName);
      if (!name.ok) {
        this.set(this.ready(entries, false, nameErrors[name.reason]));
        return;
      }
      this.payload = Object.freeze({ ...this.snapshot, name: name.name });
    }
    const payload = this.payload;
    const s = standing(entries, this.snapshot.score);
    const controller = (this.controller = new AbortController());
    this.set({ status: "submitting", entries, standing: s, payload });
    try {
      const result = await this.client.submit(payload, controller.signal);
      if (controller.signal.aborted) return;
      this.set({
        status: "submitted",
        entries: result.entries,
        entryId: result.entryId,
        onBoard: result.entries.some((e) => e.id === result.entryId),
      });
    } catch (e) {
      if (controller.signal.aborted) return;
      const err = e instanceof LeaderboardError ? e : new LeaderboardError("network");
      if (err.kind === "aborted") return;
      const latest = err.entries ?? entries;
      if (err.kind === "rejected" && err.status === 409 && err.code === "not_qualified") {
        // 確定未寫入：更新榜單，依最新門檻重新判斷。
        this.payload = null;
        this.set(this.ready(latest, true));
      } else if (err.kind === "rejected" && err.status === 400) {
        // 確定未寫入，才允許修改內容。
        this.payload = null;
        if (err.code === "invalid_name") this.set(this.ready(latest, false, nameErrors.invalid));
        else this.fail(latest, "invalid", null);
      } else if (err.kind === "rejected" && err.status === 409) {
        this.fail(latest, "conflict", payload);
      } else if (err.kind === "rejected" && err.status === 429) {
        this.fail(latest, "rate_limited", payload, this.now() + err.retryAfter * 1000);
      } else {
        this.fail(latest, "network", payload);
      }
    }
  }

  private fail(entries: Entry[], failure: SubmitFailure, payload: SubmitPayload | null, retryAt = 0) {
    this.set({
      status: "submit-error",
      entries,
      standing: standing(entries, this.snapshot.score),
      failure,
      payload,
      retryAt,
    });
  }

  dispose() {
    this.disposed = true;
    this.controller?.abort();
  }
}
