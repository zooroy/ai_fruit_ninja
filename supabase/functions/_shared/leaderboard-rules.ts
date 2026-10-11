// 前端與 Edge Function 共用的留名與成績規則。資料庫 RPC 另有相同的最後檢查。

export const DEFAULT_NAME = "不知名的勇者";
export const MAX_NAME_LENGTH = 20;
export const SCORE_STEP = 5;
export const BOARD_SIZE = 10;
export const MAX_INT = 2147483647;

export type NameCheck =
  | { ok: true; name: string }
  | { ok: false; reason: "too_long" | "control" };

// 控制字元（Cc）與孤立代理字元（無法存成合法 UTF-8）。
const forbidden = /[\p{Cc}\p{Cs}]/u;

export function normalizeName(raw: string): NameCheck {
  const name = raw.trim();
  if (!name) return { ok: true, name: DEFAULT_NAME };
  if (forbidden.test(name)) return { ok: false, reason: "control" };
  if ([...name].length > MAX_NAME_LENGTH) return { ok: false, reason: "too_long" };
  return { ok: true, name };
}

export type RoundStats = {
  score: number;
  fruits: number;
  bombs: number;
  maxCombo: number;
};

export function isCount(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= MAX_INT;
}

// 合理性檢查，不是回放驗證：每顆水果最多 10 分加 5 分連切獎勵。
export function plausibleStats(s: RoundStats) {
  return (
    isCount(s.score) &&
    isCount(s.fruits) &&
    isCount(s.bombs) &&
    isCount(s.maxCombo) &&
    s.score % SCORE_STEP === 0 &&
    s.score <= 15 * s.fruits &&
    (s.maxCombo === 0 || (s.maxCombo >= 3 && s.maxCombo <= s.fruits))
  );
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
