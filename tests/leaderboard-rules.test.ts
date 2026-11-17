import { describe, expect, it } from "vitest";
import { estimatedRank, invitation, qualifies, standing } from "../src/leaderboard/rules";
import { normalizeName, plausibleStats } from "../supabase/functions/_shared/leaderboard-rules";
import type { Entry } from "../src/leaderboard/client";

const board = (scores: number[]): Entry[] =>
  scores.map((score, i) => ({ rank: i + 1, id: `e${i}`, name: `p${i}`, score }));
const full = board([500, 400, 300, 200, 150, 140, 130, 120, 110, 100]);

describe("leaderboard standing and result status", () => {
  it("qualifies the first entry on an empty board as rank 1", () => {
    const s = standing([], 0);
    expect(s).toEqual({ kind: "qualified", rank: 1 });
    expect(qualifies(s)).toBe(true);
    expect(invitation(s)).toBe("可排第 1 名");
  });

  it("lets a zero score qualify on an incomplete board, with an estimated rank", () => {
    const s = standing(board([300, 200, 100, 50, 40, 30, 20, 10, 0]), 0);
    expect(s).toEqual({ kind: "qualified", rank: 10 });
    expect(invitation(s)).toBe("可排第 10 名");
  });

  it("uses the same format for a new highest score as for other qualified results", () => {
    expect(invitation(standing(full, 505))).toBe("可排第 1 名");
    expect(standing(full, 500)).toEqual({ kind: "qualified", rank: 2 });
  });

  it("estimates qualified ranks with existing ties ahead", () => {
    expect(standing(full, 200)).toEqual({ kind: "qualified", rank: 5 });
    expect(estimatedRank(full, 250)).toBe(4);
    expect(invitation(standing(full, 250))).toBe("可排第 4 名");
  });

  it("gives a tie at tenth place and a lower score the same threshold message", () => {
    const tie = standing(full, 100);
    const below = standing(full, 80);
    expect(tie).toEqual({ kind: "below", cutoff: 100 });
    expect(below).toEqual({ kind: "below", cutoff: 100 });
    expect(qualifies(tie)).toBe(false);
    expect(invitation(tie)).toBe("需超過 100 分才能入榜");
    expect(invitation(below)).toBe(invitation(tie));
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
