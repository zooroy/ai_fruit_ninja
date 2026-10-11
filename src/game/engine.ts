export type Point = { x: number; y: number };
export type Blade = { id: number; point: Point; from?: Point; active: boolean };
export type Target = {
  id: number;
  kind: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  born: number;
};
export type GameEvent = {
  type: "fruit" | "bomb" | "combo";
  x: number;
  y: number;
  kind: number;
  count: number;
  angle: number;
};
export function intersection(
  a: Point,
  b: Point,
  c: Point,
  r: number,
): number | null {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    fx = a.x - c.x,
    fy = a.y - c.y;
  const A = dx * dx + dy * dy,
    C = fx * fx + fy * fy - r * r;
  if (C <= 0) return 0;
  if (A < 1e-10) return null;
  const B = 2 * (fx * dx + fy * dy),
    d = B * B - 4 * A * C;
  if (d < 0) return null;
  const t = (-B - Math.sqrt(d)) / (2 * A);
  return t >= 0 && t <= 1 ? t : null;
}
export class Game {
  state: "idle" | "countdown" | "playing" | "paused" | "results" = "idle";
  score = 0;
  fruits = 0;
  bombs = 0;
  maxCombo = 0;
  elapsed = 0;
  countdown = 3;
  targets: Target[] = [];
  events: GameEvent[] = [];
  width = 12;
  height = 8;
  private last = 0;
  private countStart = 0;
  private nextWave = 0;
  private serial = 0;
  private prior: "playing" | "countdown" = "playing";
  private groups = new Map<number, { start: number; n: number; p: Point }>();
  constructor(private random = Math.random) {}
  start(now: number) {
    this.state = "countdown";
    this.score = this.fruits = this.bombs = this.maxCombo = this.elapsed = 0;
    this.targets = [];
    this.events = [];
    this.groups.clear();
    this.last = now;
    this.countStart = now;
    this.countdown = 3;
    this.nextWave = 0;
  }
  pause(now: number) {
    if (this.state !== "playing" && this.state !== "countdown") return;
    this.tick(now);
    if (this.elapsed >= 30000) return;
    this.prior = this.state as "playing" | "countdown";
    this.state = "paused";
    this.groups.clear();
  }
  resume(now: number) {
    if (this.state !== "paused") return;
    this.state = this.prior;
    this.last = now;
    this.countStart = now - (3 - this.countdown) * 1000;
  }
  endBlade(id: number) {
    this.finish(id);
  }
  private finish(id: number) {
    const g = this.groups.get(id);
    if (g && g.n >= 3) {
      this.score += g.n * 5;
      this.maxCombo = Math.max(this.maxCombo, g.n);
      this.events.push({
        type: "combo",
        x: g.p.x,
        y: g.p.y,
        kind: 0,
        count: g.n,
        angle: 0,
      });
    }
    this.groups.delete(id);
  }
  spawn() {
    const count = 3 + Math.floor(this.random() * 3);
    const center = (this.random() - 0.5) * this.width * 0.55;
    for (let i = 0; i < count; i++) {
      const r = Math.min(0.42, this.width * 0.065);
      this.targets.push({
        id: ++this.serial,
        kind: this.random() < 0.16 ? 3 : Math.floor(this.random() * 3),
        x: Math.max(
          -this.width / 2 + r,
          Math.min(
            this.width / 2 - r,
            center + (i - (count - 1) / 2) * r * 2.3,
          ),
        ),
        y: -this.height / 2 - r,
        vx: (this.random() - 0.5) * 0.7,
        vy: 6.8 + this.random() * 0.7,
        r,
        born: this.elapsed,
      });
    }
  }
  tick(now: number, blades: Blade[] = []) {
    if (this.state === "countdown") {
      this.countdown = Math.max(0, 3 - (now - this.countStart) / 1000);
      if (this.countdown > 0) return;
      this.state = "playing";
      this.last = this.countStart + 3000;
    }
    if (this.state !== "playing") return;
    const dt = Math.max(0, (now - this.last) / 1000);
    this.last = now;
    this.elapsed += dt * 1000;
    if (this.elapsed >= 30000) {
      this.elapsed = 30000;
      for (const id of this.groups.keys()) this.finish(id);
      this.state = "results";
      this.targets = [];
      return;
    }
    for (const [id, g] of this.groups)
      if (this.elapsed > g.start + 300) this.finish(id);
    for (const t of this.targets) {
      t.x += t.vx * dt;
      t.y += t.vy * dt - 2.6 * dt * dt;
      t.vy -= 5.2 * dt;
      t.x = Math.max(
        -this.width / 2 + t.r,
        Math.min(this.width / 2 - t.r, t.x),
      );
    }
    this.targets = this.targets.filter(
      (t) => t.y > -this.height / 2 - 1.5 && this.elapsed - t.born < 7000,
    );
    if (this.elapsed >= this.nextWave) {
      this.spawn();
      this.nextWave = this.elapsed + 1100 - this.elapsed / 100;
    }
    const hits: { t: Target; b: Blade; at: number }[] = [];
    for (const t of this.targets) {
      const candidates = blades
        .filter((b) => b.active && b.from)
        .map((b) => ({ t, b, at: intersection(b.from!, b.point, t, t.r) }))
        .filter((h) => h.at !== null)
        .sort((a, b) => a.at! - b.at! || a.b.id - b.b.id);
      if (candidates[0]) hits.push(candidates[0] as (typeof hits)[number]);
    }
    hits.sort(
      (a, b) =>
        Number(a.t.kind === 3) - Number(b.t.kind === 3) ||
        a.at - b.at ||
        a.t.id - b.t.id,
    );
    const consumed = new Set<number>();
    for (const { t, b } of hits) {
      consumed.add(t.id);
      const angle = Math.atan2(b.point.y - b.from!.y, b.point.x - b.from!.x);
      if (t.kind === 3) {
        this.score = Math.max(0, this.score - 50);
        this.bombs++;
        this.groups.clear();
        this.events.push({ type: "bomb", ...t, count: 1, angle });
      } else {
        this.score += 10;
        this.fruits++;
        let g = this.groups.get(b.id);
        if (g && this.elapsed >= g.start + 300) {
          this.finish(b.id);
          g = undefined;
        }
        if (!g) {
          g = { start: this.elapsed, n: 0, p: t };
          this.groups.set(b.id, g);
        }
        g.n++;
        g.p = t;
        this.events.push({ type: "fruit", ...t, count: 1, angle });
      }
    }
    this.targets = this.targets.filter((t) => !consumed.has(t.id));
    for (const [id, g] of this.groups)
      if (this.elapsed >= g.start + 300) this.finish(id);
  }
  get remaining() {
    return Math.max(0, 30 - this.elapsed / 1000);
  }
  drain() {
    return this.events.splice(0);
  }
}
