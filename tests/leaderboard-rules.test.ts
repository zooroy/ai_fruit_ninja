import { describe, expect, it } from "vitest";
import { estimatedRank, invitation, qualifies, standing } from "../src/leaderboard/rules";
import { normalizeName, plausibleStats } from "../supabase/functions/_shared/leaderboard-rules";
import type { Entry } from "../src/leaderboard/client";

const board = (scores: number[]): Entry[] =>
  scores.map((score, i) => ({ rank: i + 1, id: `e${i}`, name: `p${i}`, score }));
const full = board([500, 400, 300, 200, 150, 140, 130, 120, 110, 100]);

describe("leaderboard standing and dialogue", () => {
  it("invites the first hero on an empty board", () => {
    const s = standing([], 0);
    expect(s).toEqual({ kind: "empty", rank: 1 });
    expect(qualifies(s)).toBe(true);
    expect(invitation(s)).toBe("森林的英雄榜等著第一位勇者，留下你的大名吧！");
  });

  it("lets a zero score qualify on an incomplete board, with an estimated rank", () => {
    const s = standing(board([300, 200, 100, 50, 40, 30, 20, 10, 0]), 0);
    expect(s).toEqual({ kind: "open", rank: 10 });
    expect(qualifies(s)).toBe(true);
    expect(invitation(s)).toBe("英雄榜還有位置！你有機會登上第 10 名，留下大名吧。");
  });

  it("calls a strictly higher score a new record", () => {
    const s = standing(full, 505);
    expect(s).toEqual({ kind: "record", rank: 1 });
    expect(invitation(s)).toBe("森林的新紀錄就在眼前！留下大名，送出這漂亮的一刀。");
  });

  it("does not call a tie with first place a new record", () => {
    expect(standing(full, 500)).toEqual({ kind: "qualified", rank: 2 });
    expect(standing(board([500, 300]), 500)).toEqual({ kind: "open", rank: 2 });
  });

  it("estimates ordinary qualified ranks with existing ties ahead", () => {
    const s = standing(full, 200);
    expect(s).toEqual({ kind: "qualified", rank: 5 });
    expect(invitation(s)).toBe("漂亮的身手！有機會登上第 5 名，留下勇者的大名吧！");
    expect(estimatedRank(full, 250)).toBe(4);
    expect(invitation(standing(full, 250))).toContain("第 4 名");
  });

  it("does not qualify a tie with tenth place on a full board", () => {
    const s = standing(full, 100);
    expect(s).toEqual({ kind: "tied", cutoff: 100 });
    expect(qualifies(s)).toBe(false);
    expect(invitation(s)).toBe("已追平第十名！再得 5 分，就能超越這道紀錄。");
  });

  it("shows tie and beat gaps for 80 against a 100 cutoff", () => {
    const s = standing(full, 80);
    expect(s).toEqual({ kind: "short", cutoff: 100, tieGap: 20, beatGap: 25 });
    expect(qualifies(s)).toBe(false);
    expect(invitation(s)).toBe("距離第十名還差 20 分，超越還需 25 分，再挑戰一次吧！");
  });

  it("qualifies one step above the cutoff", () => {
    expect(standing(full, 105)).toEqual({ kind: "qualified", rank: 10 });
  });
});

describe("shared name and stats rules", () => {
  it.each([
    ["", "不知名的勇者"],
    ["   ", "不知名的勇者"],
    ["  阿明 ", "阿明"],
    ["🍉".repeat(20), "🍉".repeat(20)],
  ])("normalizes %j", (raw, name) => {
    expect(normalizeName(raw)).toEqual({ ok: true, name });
  });

  it.each([
    ["一".repeat(21), "too_long"],
    ["🍉".repeat(21), "too_long"],
    ["a\nb", "control"],
    ["a\u0000", "control"],
  ])("rejects %j", (raw, reason) => {
    expect(normalizeName(raw)).toEqual({ ok: false, reason });
  });

  it("checks stats plausibility", () => {
    expect(plausibleStats({ score: 45, fruits: 3, bombs: 0, maxCombo: 3 })).toBe(true);
    expect(plausibleStats({ score: 0, fruits: 0, bombs: 4, maxCombo: 0 })).toBe(true);
    expect(plausibleStats({ score: 50, fruits: 3, bombs: 0, maxCombo: 3 })).toBe(false);
    expect(plausibleStats({ score: 10, fruits: 1, bombs: 0, maxCombo: 1 })).toBe(false);
  });
});
