// 排名、資格、差距與情境對白的純函式。前端判斷只決定是否邀請留名，
// 最終是否入榜由伺服器在交易內決定。
import { BOARD_SIZE, SCORE_STEP } from "../../supabase/functions/_shared/leaderboard-rules.ts";
import type { Entry } from "./client";

export type Standing =
  | { kind: "empty"; rank: 1 }
  | { kind: "record"; rank: 1 } // 非空榜且嚴格高於第一名
  | { kind: "open"; rank: number } // 未滿十筆
  | { kind: "qualified"; rank: number } // 滿榜且嚴格高於第十名
  | { kind: "tied"; cutoff: number } // 滿榜且等於第十名
  | { kind: "short"; cutoff: number; tieGap: number; beatGap: number };

export const qualifies = (s: Standing) =>
  s.kind === "empty" || s.kind === "record" || s.kind === "open" || s.kind === "qualified";

/** 既有同分紀錄排在本局之前。 */
export const estimatedRank = (entries: readonly Entry[], score: number) =>
  1 + entries.filter((e) => e.score >= score).length;

export function standing(entries: readonly Entry[], score: number): Standing {
  if (!entries.length) return { kind: "empty", rank: 1 };
  if (score > Math.max(...entries.map((e) => e.score))) return { kind: "record", rank: 1 };
  if (entries.length < BOARD_SIZE) return { kind: "open", rank: estimatedRank(entries, score) };
  const cutoff = Math.min(...entries.map((e) => e.score));
  if (score > cutoff) return { kind: "qualified", rank: estimatedRank(entries, score) };
  if (score === cutoff) return { kind: "tied", cutoff };
  return {
    kind: "short",
    cutoff,
    tieGap: cutoff - score,
    beatGap: cutoff + SCORE_STEP - score,
  };
}

export function invitation(s: Standing): string {
  switch (s.kind) {
    case "empty":
      return "森林的英雄榜等著第一位勇者，留下你的大名吧！";
    case "record":
      return "森林的新紀錄就在眼前！留下大名，送出這漂亮的一刀。";
    case "open":
      return `英雄榜還有位置！你有機會登上第 ${s.rank} 名，留下大名吧。`;
    case "qualified":
      return `漂亮的身手！有機會登上第 ${s.rank} 名，留下勇者的大名吧！`;
    case "tied":
      return `已追平第十名！再得 ${SCORE_STEP} 分，就能超越這道紀錄。`;
    case "short":
      return `距離第十名還差 ${s.tieGap} 分，超越還需 ${s.beatGap} 分，再挑戰一次吧！`;
  }
}

export const lines = {
  loading: "森林信使正在取回英雄榜…",
  unconfigured: "森林英雄榜還沒開張，這局成績不會保存。",
  unconfiguredHome: "森林英雄榜還沒開張，敬請期待。",
  loadError: "森林信使暫時迷路了，重試看看吧！",
  submitError: "森林信使暫時迷路了，重試看看吧！",
  conflict: "這局成績已用不同內容送出過，無法再次留名。",
  invalid: "成績資料無法送出，這局就先留在心裡吧。",
  submitted: "你的名字已刻上森林英雄榜！",
  pushedOut: "紀錄已保存，榜單又有新高手了！",
  lost: "又有高手刷新紀錄了！這次未能入榜，再挑戰一次吧。",
  rateLimited: (seconds: number) => `森林信使忙不過來，請 ${seconds} 秒後再試。`,
  emptyBoard: "英雄榜還空著，等你寫下第一筆紀錄。",
};

export const nameErrors = {
  too_long: "名字最多 20 個字。",
  control: "名字不能包含控制字元。",
  invalid: "名字需為 20 字以內，且不可包含控制字元。",
};
