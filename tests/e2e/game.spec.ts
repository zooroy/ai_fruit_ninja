import { test, expect } from "@playwright/test";
test("landing, desktop and portrait layouts", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByRole("button", { name: "啟動攝影機" })).toBeVisible();
  await page.screenshot({ path: "docs/desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "docs/mobile.png" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
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
  await expect(page.getByRole("button", { name: "繼續挑戰" })).toBeVisible();
  await page.getByRole("button", { name: "繼續挑戰" }).click();
  await page.evaluate(() => (window as any).__test.finish());
  await expect(page.getByText("漂亮的一刀。")).toBeVisible();
  await expect(page.locator(".stats")).toContainText("3");
  expect(
    await page.evaluate(() => (window as any).__test.camera.stream),
  ).toBeNull();
  await page.screenshot({ path: "docs/results.png" });
  await page.getByRole("button", { name: "再挑戰一次" }).click();
  await expect(page.getByText("正在喚醒森林…")).toBeVisible();
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
  await expect(page.getByRole("button", { name: "重新啟動" })).toBeVisible({
    timeout: 30000,
  });
  expect(
    await page.evaluate(() => (window as any).__test.camera.stream),
  ).toBeNull();
});
test("muting and lower quality are independent of gameplay", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "靜音", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "靜音", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "低畫質" }).click();
  expect(await page.evaluate(() => (window as any).__test.forest.low)).toBe(
    true,
  );
  await page.setViewportSize({ width: 844, height: 390 });
  await page.screenshot({ path: "docs/mobile-landscape.png" });
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
