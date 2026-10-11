import { it, expect } from "vitest";
import {
  Gestures,
  extended,
  mapPoint,
  type Landmark,
} from "../src/tracking/gestures";
function hand(x = 0.3, open = true): Landmark[] {
  const l = Array.from({ length: 21 }, () => ({ x, y: 0.7, z: 0 }));
  for (let i = 5; i <= 8; i++) l[i] = { x, y: 0.65 - (i - 5) * 0.09, z: 0 };
  if (!open) l[8] = { x, y: 0.65, z: 0 };
  return l;
}
const result = (hands: Landmark[][], names = ["Left", "Right"]) => ({
  landmarks: hands,
  handedness: names.map((categoryName) => [{ categoryName, score: 0.99 }]),
});
it("detects index without requiring other fingers", () => {
  expect(extended(hand(), false)).toBe(true);
  expect(extended(hand(0.3, false), true)).toBe(false);
});
it("keeps a partly bent index active, including when starting a blade", () => {
  const l = hand();
  l[7] = { x: 0.35, y: 0.49, z: 0 };
  l[8] = { x: 0.4, y: 0.44, z: 0 };
  expect(extended(l, false)).toBe(true);
  expect(extended(l, true)).toBe(true);
});
it.each([0, Math.PI / 4, Math.PI / 2, Math.PI])(
  "distinguishes pointing and fully folded fingers at rotation %s",
  (rotation) => {
    const rotate = (l: Landmark[]) =>
      l.map((p) => ({
        x: p.x,
        y: 0.65 + (p.y - 0.65) * Math.cos(rotation),
        z: (p.y - 0.65) * Math.sin(rotation),
      }));
    for (const was of [false, true]) {
      expect(extended(rotate(hand()), was)).toBe(true);
      expect(extended(rotate(hand(0.3, false)), was)).toBe(false);
    }
  },
);
it("uses world pose to recognize pointing even with overlapping image landmarks", () => {
  const g = new Gestures();
  const projected = hand().map((p) => ({ ...p, y: 0.65, z: 0 }));
  const world = hand().map((p) => ({ x: p.x, y: 0.65, z: p.y - 0.65 }));
  const detection = { ...result([projected]), worldLandmarks: [world] };
  expect(g.update(detection, 0, 12, 8)[0].active).toBe(true);
  expect(g.update(detection, 40, 12, 8)[0].from).toBeDefined();
  detection.worldLandmarks = [hand(0.3, false)];
  expect(g.update(detection, 80, 12, 8)[0].active).toBe(false);
});
it("does not activate invalid or collapsed finger landmarks", () => {
  const l = hand();
  l[8].x = NaN;
  expect(extended(l, true)).toBe(false);
  expect(
    extended(
      Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 })),
      true,
    ),
  ).toBe(false);
});
it.each([
  [12, 8],
  [4, 8],
])("maps mirror and full preview at %s x %s", (w, h) => {
  expect(mapPoint({ x: 0, y: 0 }, w, h)).toEqual({ x: w / 2, y: h / 2 });
  expect(mapPoint({ x: 1, y: 1 }, w, h)).toEqual({ x: -w / 2, y: -h / 2 });
});
it("two hands keep identities after result ordering changes", () => {
  const g = new Gestures();
  g.update(result([hand(0.2), hand(0.8)]), 0, 12, 8);
  const next = g.update(
    result([hand(0.79), hand(0.21)], ["Right", "Left"]),
    40,
    12,
    8,
  );
  expect(next.map((b) => b.id)).toEqual([1, 0]);
  expect(next.every((b) => b.from)).toBe(true);
});
it("loss and reacquisition do not connect", () => {
  const g = new Gestures();
  g.update(result([hand()]), 0, 12, 8);
  g.update(result([]), 40, 12, 8);
  expect(g.update(result([hand(0.6)]), 80, 12, 8)[0].from).toBeUndefined();
});
it("long sample gaps and jumps break path", () => {
  const g = new Gestures();
  g.update(result([hand()]), 0, 12, 8);
  expect(g.update(result([hand()]), 200, 12, 8)[0].from).toBeUndefined();
  expect(g.update(result([hand(0.9)]), 240, 12, 8)[0].from).toBeUndefined();
});
it("retraction deactivates and restart has no path", () => {
  const g = new Gestures();
  g.update(result([hand()]), 0, 12, 8);
  expect(g.update(result([hand(0.3, false)]), 40, 12, 8)[0].active).toBe(false);
  expect(g.update(result([hand()]), 80, 12, 8)[0].from).toBeUndefined();
});
it("ambiguous crossing clears both paths", () => {
  const g = new Gestures();
  g.update(result([hand(0.4), hand(0.6)]), 0, 12, 8);
  expect(
    g.update(result([hand(0.49), hand(0.51)]), 40, 12, 8).every((b) => !b.from),
  ).toBe(true);
});
it("resize reset clears old coordinates", () => {
  const g = new Gestures();
  g.update(result([hand()]), 0, 12, 8);
  g.reset();
  expect(g.update(result([hand()]), 40, 4, 8)[0].from).toBeUndefined();
});
