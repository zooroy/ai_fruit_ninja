import type { Blade, Point } from "../game/engine";
export type Landmark = { x: number; y: number; z?: number };
export type Detection = {
  landmarks: Landmark[][];
  worldLandmarks?: Landmark[][];
  handedness: { categoryName: string; score: number }[][];
};
export function mapPoint(p: Point, width: number, height: number): Point {
  return { x: (0.5 - p.x) * width, y: (0.5 - p.y) * height };
}
function angle(a: Landmark, b: Landmark, c: Landmark) {
  const u = [a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0)],
    v = [c.x - b.x, c.y - b.y, (c.z ?? 0) - (b.z ?? 0)];
  return (
    (Math.acos(
      Math.max(
        -1,
        Math.min(
          1,
          u.reduce((s, n, i) => s + n * v[i], 0) /
            (Math.hypot(...u) * Math.hypot(...v) || 1),
        ),
      ),
    ) *
      180) /
    Math.PI
  );
}
export function extended(l: Landmark[], was: boolean) {
  if (l.length < 21) return false;
  const finger = l.slice(5, 9);
  if (finger.some((p) => ![p.x, p.y, p.z ?? 0].every(Number.isFinite)))
    return false;
  const distance = (a: Landmark, b: Landmark) =>
    Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));
  const length =
    distance(l[5], l[6]) + distance(l[6], l[7]) + distance(l[7], l[8]);
  if (length < 1e-6) return false;
  // A shortened projection is not a folded finger. Measure in 3D and
  // require both a compact finger and a bent joint before retracting.
  const reach = distance(l[5], l[8]) / length;
  const bent = Math.min(angle(l[5], l[6], l[7]), angle(l[6], l[7], l[8]));
  const folded = reach < (was ? 0.5 : 0.6) && bent < (was ? 110 : 120);
  return !folded;
}
export class Gestures {
  private previous = new Map<
    number,
    { raw: Point; p: Point; time: number; active: boolean }
  >();
  reset() {
    this.previous.clear();
  }
  update(d: Detection, time: number, width: number, height: number): Blade[] {
    const output: Blade[] = [];
    const used = new Set<number>();
    for (let i = 0; i < Math.min(2, d.landmarks.length); i++) {
      const l = d.landmarks[i];
      if (l.length < 21) continue;
      const category = d.handedness[i]?.[0];
      if (!category || category.score < 0.65) continue;
      const id = category.categoryName === "Left" ? 0 : 1;
      if (used.has(id)) {
        this.reset();
        return [];
      }
      used.add(id);
      const raw = l[8],
        prev = this.previous.get(id);
      const distance = prev
        ? Math.hypot(raw.x - prev.raw.x, raw.y - prev.raw.y)
        : Infinity;
      const continuous = !!prev && time - prev.time < 160 && distance < 0.3;
      // World coordinates use the same scale on all axes, including depth.
      const pose = d.worldLandmarks?.[i];
      const active = extended(
        pose?.length === 21 ? pose : l,
        continuous && prev.active,
      );
      const mapped = mapPoint(raw, width, height);
      const p = continuous
        ? {
            x: prev.p.x * 0.25 + mapped.x * 0.75,
            y: prev.p.y * 0.25 + mapped.y * 0.75,
          }
        : mapped;
      output.push({
        id,
        point: p,
        active,
        from: continuous && active && prev.active ? prev.p : undefined,
      });
      this.previous.set(id, { raw, p, time, active });
    }
    for (const id of this.previous.keys())
      if (!used.has(id)) this.previous.delete(id);
    // When hands occupy the same area, identity is ambiguous: break both paths.
    if (
      output.length === 2 &&
      Math.hypot(
        d.landmarks[0][8].x - d.landmarks[1][8].x,
        d.landmarks[0][8].y - d.landmarks[1][8].y,
      ) < 0.055
    ) {
      this.reset();
      return output.map((b) => ({ ...b, from: undefined }));
    }
    return output;
  }
}
