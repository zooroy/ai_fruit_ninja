import { describe, it, expect } from "vitest";
import { Game, intersection, type Target } from "../src/game/engine";
const target = (id: number, kind = 0, x = 0): Target => ({
  id,
  kind,
  x,
  y: 0,
  vx: 0,
  vy: 0,
  r: 0.4,
  born: 0,
});
const blade = (id = 0) => ({
  id,
  active: true,
  from: { x: -2, y: 0 },
  point: { x: 2, y: 0 },
});
function playing() {
  const g = new Game(() => 0.5);
  g.start(0);
  g.tick(3000);
  g.targets = [];
  return g;
}
describe("session", () => {
  it("counts down before 30 seconds and rejects exact endpoint", () => {
    const g = new Game();
    g.start(0);
    g.tick(2999);
    expect(g.state).toBe("countdown");
    g.tick(3000);
    expect(g.remaining).toBe(30);
    g.tick(32999);
    expect(g.state).toBe("playing");
    g.targets = [target(900)];
    g.tick(33000, [blade()]);
    expect(g.state).toBe("results");
    expect(g.score).toBe(0);
  });
  it("pauses the clock and replays from zero", () => {
    const g = playing();
    g.tick(18000);
    g.pause(18000);
    g.tick(40000);
    expect(g.remaining).toBe(15);
    g.resume(50000);
    g.tick(51000);
    expect(g.remaining).toBe(14);
    g.score = 90;
    g.start(60000);
    expect(g.score).toBe(0);
    expect(g.targets).toEqual([]);
  });
  it("handles pause in countdown", () => {
    const g = new Game();
    g.start(0);
    g.pause(1000);
    g.resume(10000);
    g.tick(11999);
    expect(g.state).toBe("countdown");
    g.tick(12000);
    expect(g.state).toBe("playing");
    expect(g.remaining).toBe(30);
  });
  it("bomb floors score and continues", () => {
    const g = playing();
    g.score = 30;
    g.targets = [target(90, 3)];
    g.tick(3001, [blade()]);
    expect(g.score).toBe(0);
    expect(g.bombs).toBe(1);
    expect(g.state).toBe("playing");
  });
  it("removes missed fruit without penalty", () => {
    const g = playing();
    g.targets = [{ ...target(90), y: -10 }];
    g.tick(3001);
    expect(g.targets).toHaveLength(0);
    expect(g.score).toBe(0);
  });
});
describe("collision", () => {
  it("sweeps between endpoints", () => {
    expect(
      intersection({ x: -2, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 0 }, 0.4),
    ).toBeCloseTo(0.4);
    expect(
      intersection({ x: -2, y: 1 }, { x: 2, y: 1 }, { x: 0, y: 0 }, 0.4),
    ).toBeNull();
  });
  it("consumes once for two hands", () => {
    const g = playing();
    g.targets = [target(99)];
    g.tick(3001, [blade(1), blade(0)]);
    expect(g.score).toBe(10);
    expect(g.fruits).toBe(1);
    expect(g.drain().filter((e) => e.type === "fruit")).toHaveLength(1);
  });
  it("does not hit with missing or inactive path", () => {
    const g = playing();
    g.targets = [target(99)];
    g.tick(3001, [
      { ...blade(), from: undefined },
      { ...blade(1), active: false },
    ]);
    expect(g.score).toBe(0);
  });
  it("processes fruit base points before simultaneous bombs", () => {
    const g = playing();
    g.targets = [target(1, 3), target(2), target(3), target(4)];
    g.tick(3001, [blade()]);
    g.tick(3400);
    expect(g.score).toBe(0);
    expect(g.fruits).toBe(3);
    expect(g.maxCombo).toBe(0);
  });
});
describe("combos", () => {
  it("gives 45 points for 3 and closes only once", () => {
    const g = playing();
    g.targets = [target(90), target(91), target(92)];
    g.tick(3001, [blade()]);
    expect(g.score).toBe(30);
    g.tick(3301);
    expect(g.score).toBe(45);
    g.endBlade(0);
    expect(g.score).toBe(45);
    expect(g.maxCombo).toBe(3);
  });
  it("does not extend the first hit window", () => {
    const g = playing();
    g.targets = [target(90)];
    g.tick(3001, [blade()]);
    g.targets = [target(91)];
    g.tick(3200, [blade()]);
    g.targets = [target(92)];
    g.tick(3301, [blade()]);
    g.tick(3602);
    expect(g.score).toBe(30);
  });
  it("does not merge hands", () => {
    const g = playing();
    g.targets = [target(90), target(91)];
    g.tick(3001, [blade(0)]);
    g.targets = [target(92), target(93)];
    g.tick(3002, [blade(1)]);
    g.tick(3400);
    expect(g.score).toBe(40);
  });
  it("settles on hand loss", () => {
    const g = playing();
    g.targets = [target(90), target(91), target(92)];
    g.tick(3001, [blade()]);
    g.endBlade(0);
    expect(g.score).toBe(45);
  });
  it("cancels pending combo on pause", () => {
    const g = playing();
    g.targets = [target(90), target(91), target(92)];
    g.tick(3001, [blade()]);
    g.pause(3002);
    g.resume(5000);
    g.tick(6000);
    expect(g.score).toBe(30);
  });
  it("settles pre-endpoint combo in results", () => {
    const g = playing();
    g.tick(32990);
    g.targets = [target(90), target(91), target(92)].map((t) => ({
      ...t,
      born: g.elapsed,
    }));
    g.tick(32991, [blade()]);
    g.tick(33000);
    expect(g.score).toBe(45);
    expect(g.state).toBe("results");
  });
  it("does not revoke an already paid bonus", () => {
    const g = playing();
    g.targets = [target(90), target(91), target(92)];
    g.tick(3001, [blade()]);
    g.tick(3400);
    g.score += 100;
    g.targets = [target(93, 3)];
    g.tick(3401, [blade()]);
    expect(g.score).toBe(95);
  });
});
it.each([4.5, 14.2])("bounded waves visible for width %s", (width) => {
  let seed = 42;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const g = new Game(rnd);
  g.width = width;
  g.start(0);
  let max = 0;
  for (let t = 3000; t < 33000; t += 16) {
    g.tick(t);
    max = Math.max(max, g.targets.length);
    for (const f of g.targets)
      expect(Math.abs(f.x) + f.r).toBeLessThanOrEqual(width / 2 + 0.001);
  }
  expect(max).toBeLessThan(40);
});
