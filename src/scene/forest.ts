import * as T from "three";
import type { Blade, GameEvent, Target } from "../game/engine";
const colors = [0xe95745, 0xf6aa35, 0x72a640, 0x293731];
const flesh = [0xffedd1, 0xffd068, 0xf06262];
function mesh(g: T.BufferGeometry, color: number) {
  const m = new T.Mesh(
    g,
    new T.MeshStandardMaterial({ color, flatShading: true, roughness: 0.88 }),
  );
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
function box(
  w: number,
  h: number,
  d: number,
  color: number,
  x = 0,
  y = 0,
  z = 0,
) {
  const m = mesh(new T.BoxGeometry(w, h, d), color);
  m.position.set(x, y, z);
  return m;
}
function dispose(object: T.Object3D) {
  object.traverse((o) => {
    if (o instanceof T.Mesh || o instanceof T.Line) {
      o.geometry.dispose();
      const materials = Array.isArray(o.material) ? o.material : [o.material];
      materials.forEach((m) => m.dispose());
    }
  });
}
export function fruit(kind: number, r = 0.4, half = false) {
  const group = new T.Group();
  const body = mesh(
    new T.SphereGeometry(
      r,
      kind === 2 ? 10 : 9,
      6,
      0,
      Math.PI * 2,
      0,
      half ? Math.PI / 2 : Math.PI,
    ),
    colors[kind],
  );

  group.add(body);
  if (half) {
    const cap = mesh(new T.CircleGeometry(r, 12), flesh[kind] ?? 0xffcc80);
    cap.rotation.x = -Math.PI / 2;
    group.add(cap);
    if (kind === 2)
      for (let i = 0; i < 6; i++) {
        const seed = mesh(new T.SphereGeometry(r * 0.06, 4, 3), 0x483028);
        seed.position.set(
          Math.cos(i) * r * 0.55,
          0.008,
          Math.sin(i) * r * 0.55,
        );
        seed.scale.z = 1.8;
        group.add(seed);
      }
  } else {
    const stem = box(0.07, r * 0.5, 0.07, 0x664936, 0, r, 0);
    stem.rotation.z = -0.25;
    group.add(stem);
    if (kind !== 3) {
      const leaf = mesh(new T.OctahedronGeometry(r * 0.33), 0x487a3c);
      leaf.scale.set(1.7, 0.25, 0.6);
      leaf.position.set(r * 0.25, r * 1.15, 0);
      leaf.rotation.z = 0.3;
      group.add(leaf);
    } else {
      const spark = mesh(new T.IcosahedronGeometry(0.09), 0xffbd50);
      spark.position.set(-0.04, r * 1.28, 0);
      group.add(spark);
      const stripe = box(r * 1.3, 0.11, 0.03, 0xffce6c, 0, 0, r * 0.94);
      stripe.rotation.z = 0.75;
      group.add(stripe);
      const stripe2 = stripe.clone();
      stripe2.rotation.z = -0.75;
      group.add(stripe2);
    }
  }
  if (kind === 0) group.scale.set(1, 0.9, 0.95);
  if (kind === 2) group.scale.set(1.1, 0.85, 0.9);
  return group;
}
export class Forest {
  renderer: T.WebGLRenderer;
  scene = new T.Scene();
  camera = new T.OrthographicCamera();
  width = 12;
  height = 8;
  low = false;
  private background = new T.Group();
  private objects = new Map<number, T.Group>();
  private effects: {
    o: T.Object3D;
    vx: number;
    vy: number;
    life: number;
    spin: number;
  }[] = [];
  private trails = new Map<
    number,
    { points: T.Vector3[]; line: T.Group; dot: T.Group; age: number }
  >();
  private ambientFruit: T.Group[] = [];
  constructor(public canvas: HTMLCanvasElement) {
    this.renderer = new T.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
    });
    this.renderer.setClearColor(0xd9e2c4);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.camera.position.set(0, 0, 20);
    this.camera.lookAt(0, 0, 0);
    this.scene.add(new T.HemisphereLight(0xfff4d9, 0x526c48, 2.6));
    const sun = new T.DirectionalLight(0xffe4ad, 3.2);
    sun.position.set(-5, 9, 12);
    sun.castShadow = true;
    sun.shadow.intensity = 0.28;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, {
      left: -15,
      right: 15,
      top: 12,
      bottom: -12,
    });
    this.scene.add(sun);
    this.scene.add(this.background);
    this.buildForest();
    for (let i = 0; i < 3; i++) {
      const f = fruit(i, 0.62);
      this.scene.add(f);
      this.ambientFruit.push(f);
    }
    this.resize();
  }
  private tree(x: number, y: number, size: number, pine: boolean) {
    const g = new T.Group();
    g.add(box(0.22, 1, 0.25, 0x785137, 0, 0.4, 0));
    if (pine) {
      for (let k = 0; k < 3; k++) {
        const m = mesh(
          new T.ConeGeometry(0.85 - k * 0.17, 1.5, 6),
          [0x356d50, 0x49815a, 0x69925f][k],
        );
        m.position.y = 1 + k * 0.55;
        g.add(m);
      }
    } else {
      const crown = mesh(new T.IcosahedronGeometry(1, 1), 0x739b50);
      crown.position.y = 1.7;
      crown.scale.set(1, 1.1, 0.8);
      g.add(crown);
    }
    g.scale.setScalar(size);
    g.position.set(x, y, -4);
    this.background.add(g);
  }
  private house(x: number, y: number, s: number) {
    const g = new T.Group();
    g.add(box(1.6, 1.7, 1, 0xffe9bc, 0, 0.75, 0));
    const roof = mesh(new T.ConeGeometry(1.5, 1.5, 4), 0xad624a);
    roof.rotation.y = Math.PI / 4;
    roof.scale.z = 0.8;
    roof.position.y = 2;
    g.add(roof);
    g.add(box(0.42, 0.85, 0.1, 0x74513d, 0, 0.32, 0.55));
    g.add(box(0.35, 0.42, 0.1, 0xdda64f, -0.5, 1.1, 0.55));
    g.add(box(0.35, 0.42, 0.1, 0xdda64f, 0.5, 1.1, 0.55));
    g.add(box(0.22, 0.6, 0.3, 0xb87857, 0.7, 2.45, 0));
    g.rotation.y = -0.3;
    g.scale.setScalar(s);
    g.position.set(x, y, -3);
    this.background.add(g);
  }
  private buildForest() {
    const ground = mesh(new T.PlaneGeometry(40, 24), 0xb5c888);
    ground.position.z = -6;
    this.background.add(ground);
    const pond = mesh(new T.CircleGeometry(3.5, 12), 0x72b6aa);
    pond.scale.set(1.8, 0.5, 1);
    pond.position.set(-3, -4, -5.8);
    this.background.add(pond);
    const path = mesh(new T.PlaneGeometry(1.6, 14), 0xe8d5a5);
    path.position.set(3, -2, -5.7);
    path.rotation.z = -0.48;
    this.background.add(path);
    for (let i = 0; i < 22; i++) {
      const x = ((i % 11) - 5) * 1.65;
      this.tree(x, 3 + (i > 10 ? 1.1 : 0), 0.8 + (i % 3) * 0.17, i % 3 !== 0);
    }
    for (let side of [-1, 1])
      for (let i = 0; i < 4; i++)
        this.tree(
          side * (6.2 + (i % 2) * 0.8),
          -3 + i * 1.45,
          1.1 + i * 0.08,
          i % 2 === 0,
        );
    this.house(-4.8, -2.8, 1);
    this.house(5, -2.3, 0.85);
    for (let i = 0; i < 65; i++) {
      const x = Math.sin(i * 7.3) * 9,
        y = Math.cos(i * 2.7) * 4;
      const rock = mesh(
        new T.IcosahedronGeometry(0.06 + (i % 3) * 0.025),
        i % 4 === 0 ? 0xfff1c1 : 0x79904e,
      );
      rock.position.set(x, y, -5.4);
      this.background.add(rock);
    }
  }
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.height = 8;
    this.width = (8 * rect.width) / Math.max(1, rect.height);
    Object.assign(this.camera, {
      left: -this.width / 2,
      right: this.width / 2,
      top: 4,
      bottom: -4,
      near: 0.1,
      far: 50,
    });
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(this.low ? 1 : Math.min(devicePixelRatio, 1.7));
    this.renderer.setSize(rect.width, rect.height, false);
    this.clearTrails();
  }
  quality(low: boolean) {
    this.low = low;
    this.renderer.shadowMap.enabled = !low;
    this.background.children.forEach((c, i) => {
      c.visible = !low || i < 3 || i % 2 === 0;
    });
    this.resize();
  }
  clearTrails() {
    for (const t of this.trails.values()) {
      this.scene.remove(t.line, t.dot);
      dispose(t.line);
      dispose(t.dot);
    }
    this.trails.clear();
  }
  blades(blades: Blade[]) {
    const active = new Set<number>();
    for (const b of blades) {
      if (!b.active) continue;
      active.add(b.id);
      let t = this.trails.get(b.id);
      if (!t) {
        const color = b.id === 0 ? 0xffdc79 : 0x8ef3df;
        const line = new T.Group();
        for (const [width, opacity] of [
          [0.15, 0.24],
          [0.07, 0.95],
        ]) {
          const ribbon = new T.Mesh(
            new T.BufferGeometry(),
            new T.MeshBasicMaterial({
              color,
              transparent: true,
              opacity,
              side: T.DoubleSide,
              depthTest: false,
              depthWrite: false,
              toneMapped: false,
            }),
          );
          ribbon.userData.width = width;
          ribbon.renderOrder = 100;
          line.add(ribbon);
        }
        const dot = new T.Group();
        for (const [radius, tint, opacity] of [
          [0.26, color, 0.22],
          [0.17, color, 0.95],
          [0.095, 0xfffbed, 1],
        ]) {
          const disc = new T.Mesh(
            new T.CircleGeometry(radius, 24),
            new T.MeshBasicMaterial({
              color: tint,
              transparent: true,
              opacity,
              depthTest: false,
              depthWrite: false,
              toneMapped: false,
            }),
          );
          disc.renderOrder = 101;
          dot.add(disc);
        }
        this.scene.add(line, dot);
        t = { points: [], line, dot, age: 0 };
        this.trails.set(b.id, t);
      }
      if (!b.from) t.points = [];
      t.points.push(new T.Vector3(b.point.x, b.point.y, 2));
      t.points = t.points.slice(-12);
      for (const child of t.line.children) {
        const ribbon = child as T.Mesh;
        const vertices: number[] = [];
        for (let i = 1; i < t.points.length; i++) {
          const a = t.points[i - 1],
            b = t.points[i];
          const length = a.distanceTo(b);
          if (length < 0.0001) continue;
          const nx = -(b.y - a.y) / length,
            ny = (b.x - a.x) / length;
          const wa =
            ribbon.userData.width *
            (0.15 + (0.85 * (i - 1)) / (t.points.length - 1));
          const wb =
            ribbon.userData.width * (0.15 + (0.85 * i) / (t.points.length - 1));
          const al = [a.x + nx * wa, a.y + ny * wa, 2];
          const ar = [a.x - nx * wa, a.y - ny * wa, 2];
          const bl = [b.x + nx * wb, b.y + ny * wb, 2];
          const br = [b.x - nx * wb, b.y - ny * wb, 2];
          vertices.push(...al, ...ar, ...bl, ...ar, ...br, ...bl);
        }
        ribbon.geometry.dispose();
        ribbon.geometry = new T.BufferGeometry();
        ribbon.geometry.setAttribute(
          "position",
          new T.Float32BufferAttribute(vertices, 3),
        );
      }
      t.dot.position.set(b.point.x, b.point.y, 2);
      t.age = 0;
    }
    for (const [id, t] of this.trails)
      if (!active.has(id)) {
        this.scene.remove(t.line, t.dot);
        dispose(t.line);
        dispose(t.dot);
        this.trails.delete(id);
      }
  }
  event(e: GameEvent) {
    if (e.type === "combo") return;
    const radius = 0.4;
    if (e.type === "fruit")
      for (const sign of [-1, 1]) {
        const half = fruit(e.kind, radius, true);
        half.rotation.z = e.angle + (sign === 1 ? Math.PI : 0);
        half.rotation.x = 0.55;
        half.position.set(e.x, e.y, 1);
        this.scene.add(half);
        this.effects.push({
          o: half,
          vx: -Math.sin(e.angle) * sign * 1.8,
          vy: Math.cos(e.angle) * sign * 1.8 + 1,
          life: 1.2,
          spin: sign * 2,
        });
      }
    for (let i = 0; i < (this.low ? 6 : 15); i++) {
      const p = mesh(
        new T.IcosahedronGeometry(0.025 + Math.random() * 0.045),
        e.type === "bomb" ? 0xffce6c : colors[e.kind],
      );
      p.position.set(e.x, e.y, 1.5);
      this.scene.add(p);
      this.effects.push({
        o: p,
        vx: (Math.random() - 0.5) * 5,
        vy: (Math.random() - 0.3) * 5,
        life: 0.45 + Math.random() * 0.4,
        spin: 3,
      });
    }
  }
  render(targets: Target[], dt: number, time: number, ambient: boolean) {
    const ids = new Set(targets.map((t) => t.id));
    for (const [id, o] of this.objects)
      if (!ids.has(id)) {
        this.scene.remove(o);
        dispose(o);
        this.objects.delete(id);
      }
    for (const t of targets) {
      let o = this.objects.get(t.id);
      if (!o) {
        o = fruit(t.kind, t.r);
        this.objects.set(t.id, o);
        this.scene.add(o);
      }
      o.position.set(t.x, t.y, 0);
      o.rotation.z = Math.sin(time * 0.8 + t.id) * 0.4;
      o.rotation.y = t.kind === 3 ? 0 : time * 0.6;
    }
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      e.life -= dt;
      if (e.life <= 0) {
        this.scene.remove(e.o);
        dispose(e.o);
        this.effects.splice(i, 1);
        continue;
      }
      e.o.position.x += e.vx * dt;
      e.o.position.y += e.vy * dt;
      e.vy -= 5 * dt;
      e.o.rotation.z += e.spin * dt;
    }
    for (const t of this.trails.values()) {
      t.age += dt;
      if (t.age > 0.16) {
        t.line.visible = false;
        t.dot.visible = false;
      } else {
        t.line.visible = true;
        t.dot.visible = true;
      }
    }
    this.ambientFruit.forEach((f, i) => {
      f.visible = ambient;
      const scale = Math.min(1, this.width / 7);
      f.scale.setScalar(scale);
      f.position.set(
        (i - 1) * 1.8 * scale,
        -2.6 + Math.sin(time + i) * 0.12,
        1,
      );
      f.rotation.y = time * 0.3 + i;
      f.rotation.z = Math.sin(time * 0.5 + i) * 0.2;
    });
    this.renderer.render(this.scene, this.camera);
  }
}
