import { test, expect, type Page } from "@playwright/test";

// 手機與平板以 Playwright 的觸控模擬（hasTouch + isMobile）測試；Chromium 在此模式下
// 實際回報 (pointer: coarse) 與 (hover: none)，第一個測試會先確認這點。
const API = "http://leaderboard.test/functions/v1/leaderboard";
const entries = [
  { rank: 1, id: "a", name: "森林裡最快最快最快的刀客🍉🍉", score: 300 },
  { rank: 2, id: "b", name: "ＷＷＷＷＷＷＷＷＷＷＷＷＷＷＷＷＷＷＷＷ", score: 200 },
  { rank: 3, id: "c", name: "阿明", score: 100 },
];

async function prepare(page: Page) {
  const calls = { camera: 0, model: 0, posts: 0 };
  await page.addInitScript((url) => {
    (window as any).__leaderboardUrl = url;
    (window as any).__cameraCalls = 0;
    const md = navigator.mediaDevices;
    if (md) {
      const original = md.getUserMedia.bind(md);
      md.getUserMedia = (c) => {
        (window as any).__cameraCalls++;
        return original(c);
      };
    }
  }, API);
  page.on("request", (r) => {
    if (r.url().includes("hand_landmarker.task")) calls.model++;
    if (r.method() === "POST") calls.posts++;
  });
  await page.route(`${API}*`, (route) =>
    route.request().method() === "OPTIONS"
      ? route.fulfill({ status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } })
      : route.fulfill({ status: 200, headers: { "Access-Control-Allow-Origin": "*" }, contentType: "application/json", body: JSON.stringify({ entries }) }),
  );
  await page.goto("/");
  return {
    calls,
    cameraCalls: () => page.evaluate(() => (window as any).__cameraCalls as number),
  };
}

const unsupported = [
  ["phone-portrait", { width: 390, height: 844 }, "docs/unsupported-phone.png"],
  ["phone-landscape", { width: 844, height: 390 }, ""],
  ["tablet", { width: 820, height: 1180 }, "docs/unsupported-tablet.png"],
] as const;

for (const [label, viewport, shot] of unsupported) {
  test.describe(`unsupported device: ${label}`, () => {
    test.use({ hasTouch: true, isMobile: true, viewport });

    test("shows the notice, blocks every start path and keeps the leaderboard", async ({ page }) => {
      const { calls, cameraCalls } = await prepare(page);
      expect(
        await page.evaluate(() => matchMedia("(pointer: coarse) and (hover: none)").matches),
      ).toBe(true);

      const note = page.getByRole("note");
      await expect(note).toBeVisible();
      await expect(note).toContainText("請改用電腦開啟");
      await expect(page.getByRole("button", { name: "啟動攝影機" })).toBeHidden();
      await expect(page.locator("#privacy")).toBeHidden();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const noteBox = await note.boundingBox();
      const boardBox = await page.getByRole("button", { name: "歷史排行 TOP 10" }).boundingBox();
      expect(boardBox!.y).toBeGreaterThan(noteBox!.y + noteBox!.height);
      if (shot) await page.screenshot({ path: shot });

      // 首頁排行：唯讀瀏覽、Escape 關閉、焦點回到入口。
      const open = page.getByRole("button", { name: "歷史排行 TOP 10" });
      await open.click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.locator(".board-row")).toHaveCount(3);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(dialog.getByLabel("留下大名")).toHaveCount(0);
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expect(open).toBeFocused();

      // 開發入口直接呼叫 setup() 也會被擋下。
      await page.evaluate(() => (window as any).__test.setup());
      expect(await page.evaluate(() => (window as any).__test.mode)).toBe("welcome");

      // 結算「再挑戰一次」（以開發 hook 進入結算）同樣回到首頁說明。
      await page.evaluate(() => {
        const t = (window as any).__test;
        t.start();
        t.finish();
      });
      await page.getByRole("button", { name: "再挑戰一次" }).click();
      await expect(note).toBeVisible();
      expect(await page.evaluate(() => (window as any).__test.mode)).toBe("welcome");

      await page.waitForTimeout(300);
      expect(await cameraCalls()).toBe(0);
      expect(calls.model).toBe(0);
      expect(calls.posts).toBe(0);
    });
  });
}

test.describe("touchscreen laptop (primary pointer is a trackpad)", () => {
  // Chromium 開啟 hasTouch 會把主要指標也改為 coarse，CDP 也無法覆寫 pointer／hover，
  // 因此在桌面 context 注入：具觸控點、any-pointer: coarse，但主要指標仍為 fine。
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "maxTouchPoints", { get: () => 10 });
      const native = window.matchMedia.bind(window);
      window.matchMedia = (query: string) => {
        if (query.includes("any-pointer: coarse"))
          return {
            matches: true,
            media: query,
            onchange: null,
            addEventListener() {},
            removeEventListener() {},
            addListener() {},
            removeListener() {},
            dispatchEvent: () => false,
          } as MediaQueryList;
        return native(query);
      };
    });
  });

  test("can still start the game", async ({ page }) => {
    const { cameraCalls } = await prepare(page);
    expect(
      await page.evaluate(() => ({
        anyCoarse: matchMedia("(any-pointer: coarse)").matches,
        touchPoints: navigator.maxTouchPoints,
        unsupported: matchMedia("(pointer: coarse) and (hover: none)").matches,
      })),
    ).toEqual({ anyCoarse: true, touchPoints: 10, unsupported: false });
    await expect(page.getByRole("note")).toBeHidden();
    await page.getByRole("button", { name: "啟動攝影機" }).click();
    await expect(page.locator("#tutorial")).toBeVisible({ timeout: 30000 });
    expect(await cameraCalls()).toBe(1);
  });
});
