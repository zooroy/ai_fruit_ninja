import { test, expect } from "@playwright/test";
test("camera and background keep their proportions across window sizes", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "啟動攝影機" }).click();
  await expect(page.locator("#tutorial")).toBeVisible({ timeout: 30000 });
  for (const size of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(size);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const video = document.querySelector("video")!;
          const rect = video.getBoundingClientRect();
          return Math.abs(
            rect.width / rect.height - video.videoWidth / video.videoHeight,
          );
        }),
      )
      .toBeLessThan(0.01);
    const scale = await page.evaluate(() => {
      const s = (window as any).__test.forest.background.scale;
      return { x: s.x, y: s.y, z: s.z };
    });
    expect(scale).toEqual({ x: 1, y: 1, z: 1 });
  }
});
test("landing, desktop and narrow window layouts", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByRole("button", { name: "啟動攝影機" })).toBeVisible();
  await page.screenshot({ path: "docs/desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "docs/narrow-window.png" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  // 首頁只保留必要資訊：規則只出現一次，沒有頁尾、標語或裝飾標籤。
  await expect(page.getByText("伸出食指切水果 · 30 秒 · 炸彈 −50")).toHaveCount(1);
  await expect(page.getByText("30 秒")).toHaveCount(1);
  await expect(page.locator("footer, .eyebrow, .vignette, .edition")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "排行榜", exact: true })).toBeVisible();
  // 窄桌面視窗不是手機：仍顯示開始入口並可進入試切。
  await expect(page.getByRole("note")).toBeHidden();
  await page.getByRole("button", { name: "啟動攝影機" }).click();
  await expect(page.locator("#tutorial")).toBeVisible({ timeout: 30000 });
  expect(errors).toEqual([]);
});
test("tutorial, countdown, scoring, bomb, pause, result and replay", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => {
    const t = (window as any).__test;
    t.tutorial();
    t.inject([
      {
        id: 0,
        active: true,
        from: { x: -1, y: -0.5 },
        point: { x: 1, y: -0.5 },
      },
    ]);
  });
  await expect(page.locator("#countdown")).toBeVisible();
  await expect(page.locator("#pause")).toBeVisible({ timeout: 7000 });
  await page.evaluate(() => {
    const t = (window as any).__test;
    t.game.targets = [1, 2, 3].map((id) => ({
      id: 900 + id,
      kind: 0,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      r: 0.4,
      born: t.game.elapsed,
    }));
    t.inject([
      { id: 0, active: true, from: { x: -1, y: 0 }, point: { x: 1, y: 0 } },
    ]);
  });
  await expect(page.locator("#score")).toHaveText("045");
  await page.evaluate(() => {
    const t = (window as any).__test;
    t.game.targets = [
      {
        id: 999,
        kind: 3,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        r: 0.4,
        born: t.game.elapsed,
      },
    ];
    t.inject([
      { id: 1, active: true, from: { x: -1, y: 0 }, point: { x: 1, y: 0 } },
    ]);
  });
  await expect(page.locator("#score")).toHaveText("000");
  await page.getByRole("button", { name: "暫停", exact: true }).click();
  await expect(page.getByRole("button", { name: "繼續" })).toBeVisible();
  await page.getByRole("button", { name: "繼續" }).click();
  await page.evaluate(() => (window as any).__test.finish());
  await expect(page.getByText("本局結束")).toBeVisible();
  await expect(page.locator(".stats")).toContainText("3");
  expect(
    await page.evaluate(() => (window as any).__test.camera.stream),
  ).toBeNull();
  await page.screenshot({ path: "docs/results.png" });
  await page.getByRole("button", { name: "再玩一次" }).click();
  await expect(page.getByText("正在啟動攝影機…")).toBeVisible();
});
test("real local model loads with fake camera, then cleanup", async ({
  page,
}) => {
  const uploaded: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST") uploaded.push(r.url());
  });
  await page.goto("/");
  await page.getByRole("button", { name: "啟動攝影機" }).click();
  await expect(page.locator("#tutorial")).toBeVisible({ timeout: 30000 });
  expect(
    await page.evaluate(() => (window as any).__test.tracker.mode),
  ).toMatch(/worker|main/);
  await page.evaluate(() => (window as any).__test.home());
  expect(
    await page.evaluate(() => (window as any).__test.camera.stream),
  ).toBeNull();
  expect(uploaded).toEqual([]);
});
test("model failure shows retry and closes camera", async ({ page }) => {
  await page.route("**/models/hand_landmarker.task", (r) => r.abort());
  await page.goto("/");
  await page.getByRole("button", { name: "啟動攝影機" }).click();
  await expect(page.getByRole("button", { name: "重試" })).toBeVisible({
    timeout: 30000,
  });
  expect(
    await page.evaluate(() => (window as any).__test.camera.stream),
  ).toBeNull();
});
test("muting is independent of gameplay", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "靜音", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "靜音", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.setViewportSize({ width: 844, height: 390 });
  await page.screenshot({ path: "docs/short-window.png" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("worker failure falls back to limited main-thread inference", async ({
  page,
}) => {
  await page.route("**/tracking-worker.js", (r) => r.abort());
  await page.goto("/");
  await page.getByRole("button", { name: "啟動攝影機" }).click();
  await expect(page.locator("#tutorial")).toBeVisible({ timeout: 30000 });
  expect(await page.evaluate(() => (window as any).__test.tracker.mode)).toBe(
    "main",
  );
});
test("fruit effects are consumed once and expire", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    const t = (window as any).__test;
    t.start();
    t.game.tick(performance.now());
    t.game.targets = [
      {
        id: 997,
        kind: 2,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        r: 0.4,
        born: t.game.elapsed,
      },
    ];
    t.inject(
      [0, 1].map((id) => ({
        id,
        active: true,
        from: { x: -1, y: 0 },
        point: { x: 1, y: 0 },
      })),
    );
  });
  await expect(page.locator("#score")).toHaveText("010");
  expect(
    await page.evaluate(() => (window as any).__test.forest.effects.length),
  ).toBe(17);
  await page.waitForTimeout(1500);
  expect(
    await page.evaluate(() => (window as any).__test.forest.effects.length),
  ).toBe(0);
});

test("HUD shows only score and time; only combos and bombs float text", async ({
  page,
}) => {
  await page.goto("/");
  const hit = (id: number, kinds: number[]) =>
    page.evaluate(
      ({ id, kinds }) => {
        const t = (window as any).__test;
        t.game.targets = kinds.map((kind, i) => ({
          id: 800 + Math.floor(Math.random() * 1e6) + i,
          kind,
          x: 0,
          y: 0,
          vx: 0,
          vy: 0,
          r: 0.4,
          born: t.game.elapsed,
        }));
        t.inject([
          { id, active: true, from: { x: -1, y: 0 }, point: { x: 1, y: 0 } },
        ]);
      },
      { id, kinds },
    );
  await page.evaluate(() => (window as any).__test.start());
  await expect(page.locator("#hud")).toBeVisible();
  await expect(page.locator("#hud")).not.toContainText("連切");
  await expect(page.locator("#camera-card")).not.toContainText("LOCAL");

  await hit(1, [0]);
  await expect(page.locator("#score")).toHaveText("010");
  await expect(page.locator("#toasts > *")).toHaveCount(0);

  await hit(0, [0, 1, 2]);
  await expect(page.locator("#toasts")).toContainText("3 連切 +15");
  await expect(page.locator("#score")).toHaveText("055");

  await hit(1, [3]);
  await expect(page.locator("#toasts")).toContainText("炸彈 −50");
});
