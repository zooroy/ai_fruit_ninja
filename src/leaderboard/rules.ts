// 排名、資格與結算提示的純函式。前端判斷只決定是否邀請留名，
// 最終是否入榜由伺服器在交易內決定。
import { BOARD_SIZE } from "../../supabase/functions/_shared/leaderboard-rules.ts";
import type { Entry } from "./client";

export type Standing =
  | { kind: "qualified"; rank: number } // 未滿十筆，或嚴格高於第十名
  | { kind: "below"; cutoff: number }; // 滿榜且不高於第十名

export const qualifies = (s: Standing) => s.kind === "qualified";

/** 既有同分紀錄排在本局之前。 */
export const estimatedRank = (entries: readonly Entry[], score: number) =>
  1 + entries.filter((e) => e.score >= score).length;

export function standing(entries: readonly Entry[], score: number): Standing {
  if (entries.length < BOARD_SIZE) return { kind: "qualified", rank: estimatedRank(entries, score) };
  const cutoff = Math.min(...entries.map((e) => e.score));
  if (score > cutoff) return { kind: "qualified", rank: estimatedRank(entries, score) };
  return { kind: "below", cutoff };
}

export function invitation(s: Standing): string {
  return s.kind === "qualified" ? `可排第 ${s.rank} 名` : `需超過 ${s.cutoff} 分才能入榜`;
}

export const lines = {
  loading: "載入中…",
  unconfigured: "排行榜未啟用，本局成績不會保存",
  unconfiguredHome: "排行榜未啟用",
  loadError: "無法載入排行榜",
  submitError: "送出失敗，請重試",
  conflict: "本局已用不同內容送出，無法再次送出",
  invalid: "成績資料無效，無法送出",
  submitted: "已登上排行榜",
  pushedOut: "已保存，但未在前十名",
  lost: "資格已失效",
  rateLimited: (seconds: number) => `送出太頻繁，請 ${seconds} 秒後再試`,
  emptyBoard: "尚無紀錄",
};

// 超長與控制字元都以同一則訊息說明兩項限制。
export const nameError = "名字最多 20 字，且不可含控制字元";
