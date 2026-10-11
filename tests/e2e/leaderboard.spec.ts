import { test, expect, type Page, type Route } from "@playwright/test";

const API = "http://leaderboard.test/functions/v1/leaderboard";
type Entry = { rank: number; id: string; name: string; score: number };
type Stored = { id: string; name: string; score: number; submissionId: string; order: number };
type Stats = { score: number; fruits: number; bombs?: number; maxCombo?: number };

// 模擬 Edge API：依分數遞減、接受順序遞增排序；滿十筆需嚴格超過第十名；同 submissionId 冪等。
class MockApi {
  rows: Stored[] = [];
  posts: Record<string, unknown>[] = [];
  gets = 0;
  serial = 0;
  // 依方法排隊的一次性攔截；回傳 true 表示已自行回應。
  next: Record<"GET" | "POST", ((route: Route) => Promise<boolean> | boolean)[]> = { GET: [], POST: [] };

  seed(scores: number[], name = (i: number) => `高手${i + 1}`) {
    for (const [i, score] of scores.entries()) this.insert(name(i), score, `seed-${this.serial}`);
  }
  insert(name: string, score: number, submissionId: string) {
    const row = { id: `id-${++this.serial}`, name, score, submissionId, order: this.serial };
    this.rows.push(row);
    return row;
  }
  top(): Entry[] {
    return [...this.rows]
      .sort((a, b) => b.score - a.score || a.order - b.order)
      .slice(0, 10)
      .map((r, i) => ({ rank: i + 1, id: r.id, name: r.name, score: r.score }));
  }
  async install(page: Page) {
    await page.addInitScript((url) => {
      (window as unknown as { __leaderboardUrl: string }).__leaderboardUrl = url;
    }, API);
    await page.route(`${API}*`, async (route) => {
      const req = route.request();
      const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Expose-Headers": "Retry-After" };
      if (req.method() === "OPTIONS")
        return route.fulfill({
          status: 204,
          headers: { ...cors, "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" },
        });
      const hook = this.next[req.method() as "GET" | "POST"]?.shift();
      if (hook && (await hook(route))) return;
      const json = (status: number, body: unknown, headers = {}) =>
        route.fulfill({ status, headers: { ...cors, ...headers }, contentType: "application/json", body: JSON.stringify(body) });
      if (req.method() === "GET") {
        this.gets++;
        return json(200, { entries: this.top() });
      }
      const body = req.postDataJSON();
      this.posts.push(body);
      const name = String(body.name ?? "").trim() || "不知名的勇者";
      const existing = this.rows.find((r) => r.submissionId === body.submissionId);
      if (existing) return json(200, { outcome: "accepted", entryId: existing.id, entries: this.top() });
      const board = this.top();
      if (board.length >= 10 && body.score <= board[9].score)
        return json(409, { error: { code: "not_qualified", message: "x" }, entries: board });
      const row = this.insert(name, body.score, body.submissionId);
      return json(201, { outcome: "accepted", entryId: row.id, entries: this.top() });
    });
  }
}

async function finishRound(page: Page, stats: Stats) {
  await page.evaluate((s) => {
    const t = (window as any).__test;
    t.start();
    Object.assign(t.game, { bombs: 0, maxCombo: 0, ...s });
    t.finish();
  }, stats);
  await expect(page.getByRole("heading", { name: "漂亮的一刀。" })).toBeVisible();
}

const board = (page: Page) => page.locator("#result-stats .board");
const rows = (page: Page) => board(page).locator(".board-row");

test.describe("home leaderboard dialog", () => {
  test("browses without camera, traps focus, closes with Escape and keeps settings", async ({ page }) => {
    const api = new MockApi();
    api.seed([300, 200, 100]);
    await api.install(page);
    await page.addInitScript(() => {
      (window as any).__cameraCalls = 0;
      const original = navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);
      if (navigator.mediaDevices)
        navigator.mediaDevices.getUserMedia = (c) => {
          (window as any).__cameraCalls++;
          return original!(c);
        };
    });
    await page.goto("/");
    await page.getByRole("button", { name: "靜音", exact: true }).click();
    await page.getByRole("button", { name: "低畫質" }).click();

    const open = page.getByRole("button", { name: "歷史排行 TOP 10" });
    const startBox = await page.getByRole("button", { name: "啟動攝影機" }).boundingBox();
    const openBox = await open.boundingBox();
    expect(openBox!.y).toBeGreaterThan(startBox!.y + startBox!.height);
    await open.click();
    const dialog = page.getByRole("dialog", { name: "歷史排行 TOP 10" });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(".board-row")).toHaveCount(3);
    await expect(dialog.locator(".board-row").first()).toContainText("高手1");
    await expect(dialog.locator(".top1 .board-rank")).toHaveText("1");

    const close = dialog.getByRole("button", { name: "關閉排行榜" });
    await expect(close).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(close).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(close).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(open).toBeFocused();
    expect(await page.evaluate(() => (window as any).__cameraCalls)).toBe(0);
    expect(await page.evaluate(() => (window as any).__test.mode)).toBe("welcome");
    expect(await page.evaluate(() => (window as any).__test.camera.stream)).toBeNull();
    await expect(page.getByRole("button", { name: "靜音", exact: true })).toHaveAttribute("aria-pressed", "true");
    expect(await page.evaluate(() => (window as any).__test.forest.low)).toBe(true);

    // 鍵盤開啟、按鈕關閉。
    await open.press("Enter");
    await expect(dialog).toBeVisible();
    await close.press("Enter");
    await expect(dialog).toBeHidden();
    await expect(open).toBeFocused();
    expect(api.gets).toBe(2);
  });

  test("shows loading, empty and retryable failure states", async ({ page }) => {
    const api = new MockApi();
    await api.install(page);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    api.next.GET.push(async () => {
      await gate;
      return false;
    });
    await page.goto("/");
    await page.getByRole("button", { name: "歷史排行 TOP 10" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("status")).toHaveText("森林信使正在取回英雄榜…");
    release();
    await expect(dialog.getByText("英雄榜還空著，等你寫下第一筆紀錄。")).toBeVisible();
    await page.keyboard.press("Escape");

    api.next.GET.push((route) => route.fulfill({ status: 503, body: "down" }).then(() => true));
    await page.getByRole("button", { name: "歷史排行 TOP 10" }).click();
    await expect(dialog.getByText("森林信使暫時迷路了，重試看看吧！")).toBeVisible();
    await expect(dialog.getByText("英雄榜還空著")).toBeHidden();
    const retry = dialog.getByRole("button", { name: "重新載入" });
    await expect(retry).toBeFocused();
    // 錯誤狀態下 Tab 在關閉與重試之間循環。
    await page.keyboard.press("Tab");
    await expect(dialog.getByRole("button", { name: "關閉排行榜" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(retry).toBeFocused();
    api.seed([150]);
    await retry.click();
    await expect(dialog.locator(".board-row")).toHaveCount(1);
  });

  test("explains an unconfigured service", async ({ page }) => {
    await page.addInitScript(() => ((window as any).__leaderboardUrl = ""));
    await page.goto("/");
    await page.getByRole("button", { name: "歷史排行 TOP 10" }).click();
    await expect(page.getByRole("dialog").getByText("森林英雄榜還沒開張")).toBeVisible();
  });
});

test.describe("result leaderboard", () => {
  test("qualified round: estimated rank, default name, highlighted success, no resubmit", async ({ page }) => {
    const api = new MockApi();
    api.seed([300, 200, 100]);
    await api.install(page);
    await page.goto("/");
    await finishRound(page, { score: 150, fruits: 15, bombs: 1, maxCombo: 3 });
    await expect(board(page).getByRole("status")).toHaveText("英雄榜還有位置！你有機會登上第 3 名，留下大名吧。");
    await expect(rows(page)).toHaveCount(3);
    const input = page.getByLabel("留下大名");
    await expect(input).toBeVisible();
    await expect(page.getByText("名字會公開顯示在排行榜")).toBeVisible();
    expect(await page.evaluate(() => (window as any).__test.camera.stream)).toBeNull();

    await input.fill("   ");
    await page.getByRole("button", { name: "送出" }).click();
    await expect(board(page).getByRole("status")).toHaveText("你的名字已刻上森林英雄榜！");
    await expect(input).toBeHidden();
    const mine = board(page).locator(".board-row.mine");
    await expect(mine).toContainText("不知名的勇者");
    await expect(mine).toContainText("你");
    await expect(mine.locator(".board-rank")).toHaveText("3");
    expect(api.posts).toHaveLength(1);
    expect(api.posts[0]).toMatchObject({ name: "不知名的勇者", score: 150, fruits: 15, bombs: 1, maxCombo: 3 });
    expect(api.posts[0].submissionId).toBe(await page.evaluate(() => (window as any).__test.roundId));
    await expect(page.getByRole("button", { name: "送出" })).toBeHidden();
  });

  test("new record invitation on a non-empty board", async ({ page }) => {
    const api = new MockApi();
    api.seed([100]);
    await api.install(page);
    await page.goto("/");
    await finishRound(page, { score: 200, fruits: 20 });
    await expect(board(page).getByRole("status")).toHaveText("森林的新紀錄就在眼前！留下大名，送出這漂亮的一刀。");
    await expect(page.getByLabel("留下大名")).toBeVisible();
  });

  test("unqualified rounds show gaps without a form", async ({ page }) => {
    const api = new MockApi();
    api.seed([500, 400, 300, 200, 190, 180, 170, 160, 150, 100]);
    await api.install(page);
    await page.goto("/");
    await finishRound(page, { score: 80, fruits: 8 });
    await expect(board(page).getByRole("status")).toHaveText("距離第十名還差 20 分，超越還需 25 分，再挑戰一次吧！");
    await expect(page.getByLabel("留下大名")).toBeHidden();
    await expect(rows(page)).toHaveCount(10);

    await page.evaluate(() => (window as any).__test.home());
    await finishRound(page, { score: 100, fruits: 10 });
    await expect(board(page).getByRole("status")).toHaveText("已追平第十名！再得 5 分，就能超越這道紀錄。");
    await expect(page.getByLabel("留下大名")).toBeHidden();
    expect(api.posts).toHaveLength(0);
  });

  test("skipping submission adds nothing and replay/home still work", async ({ page }) => {
    const api = new MockApi();
    await api.install(page);
    await page.goto("/");
    await finishRound(page, { score: 40, fruits: 4 });
    await expect(board(page).getByRole("status")).toHaveText("森林的英雄榜等著第一位勇者，留下你的大名吧！");
    await page.getByLabel("留下大名").fill("不想送出");
    await page.getByRole("button", { name: "返回森林" }).click();
    await expect(page.getByRole("button", { name: "啟動攝影機" })).toBeVisible();
    await finishRound(page, { score: 40, fruits: 4 });
    await page.getByRole("button", { name: "再挑戰一次" }).click();
    await expect(page.getByText("正在喚醒森林…")).toBeVisible();
    expect(api.posts).toHaveLength(0);
    expect(api.rows).toHaveLength(0);
  });

  test("qualification lost while typing updates the board and hides the form", async ({ page }) => {
    const api = new MockApi();
    api.seed([500, 400, 300, 200, 190, 180, 170, 160, 150]);
    await api.install(page);
    await page.goto("/");
    await finishRound(page, { score: 120, fruits: 12 });
    await expect(page.getByLabel("留下大名")).toBeVisible();
    api.insert("剛來的高手", 130, "other"); // 另一裝置在留名期間取得第十名
    await page.getByLabel("留下大名").fill("阿明");
    await page.getByLabel("留下大名").press("Enter");
    await expect(board(page).getByRole("status")).toHaveText("又有高手刷新紀錄了！這次未能入榜，再挑戰一次吧。");
    await expect(board(page).locator(".board-detail")).toHaveText("距離第十名還差 10 分，超越還需 15 分，再挑戰一次吧！");
    await expect(page.getByLabel("留下大名")).toBeHidden();
    await expect(rows(page).last()).toContainText("剛來的高手");
    expect(api.rows.some((r) => r.name === "阿明")).toBe(false);
  });

  test("rejects an over-long name locally and keeps it editable", async ({ page }) => {
    const api = new MockApi();
    await api.install(page);
    await page.goto("/");
    await finishRound(page, { score: 40, fruits: 4 });
    const input = page.getByLabel("留下大名");
    await input.fill("一".repeat(21));
    await page.getByRole("button", { name: "送出" }).click();
    await expect(page.getByRole("alert")).toHaveText("名字最多 20 個字。");
    await expect(input).toHaveAttribute("aria-invalid", "true");
    await expect(input).toHaveValue("一".repeat(21));
    expect(api.posts).toHaveLength(0);
    await input.fill("🍉".repeat(20));
    await page.getByRole("button", { name: "送出" }).click();
    await expect(board(page).getByRole("status")).toHaveText("你的名字已刻上森林英雄榜！");
    expect(api.rows[0].name).toBe("🍉".repeat(20));
  });
});

test.describe("result leaderboard failures", () => {
  test("load failure keeps result controls and offers retry without a form", async ({ page }) => {
    const api = new MockApi();
    await api.install(page);
    api.next.GET.push((route) => route.abort("failed").then(() => true));
    await page.goto("/");
    await finishRound(page, { score: 40, fruits: 4 });
    await expect(board(page).getByRole("status")).toHaveText("森林信使暫時迷路了，重試看看吧！");
    await expect(page.getByLabel("留下大名")).toBeHidden();
    await expect(page.locator(".final-score")).toContainText("40");
    await expect(page.getByRole("button", { name: "再挑戰一次" })).toBeVisible();
    await page.getByRole("button", { name: "重新載入榜單" }).click();
    await expect(page.getByLabel("留下大名")).toBeVisible();
    expect(await page.evaluate(() => (window as any).__test.mode)).toBe("results");
  });

  test("lost response is retried with the same payload and stored once", async ({ page }) => {
    const api = new MockApi();
    await api.install(page);
    await page.goto("/");
    await finishRound(page, { score: 60, fruits: 6 });
    // 第一次 POST：伺服器已寫入，但回應在網路上遺失。
    api.next.POST.push(async (route) => {
      const body = route.request().postDataJSON();
      api.posts.push(body);
      api.insert(body.name, body.score, body.submissionId);
      await route.abort("connectionreset");
      return true;
    });
    const input = page.getByLabel("留下大名");
    await input.fill("斷線勇者");
    await page.getByRole("button", { name: "送出" }).click();
    await expect(board(page).getByRole("status")).toHaveText("森林信使暫時迷路了，重試看看吧！");
    await expect(input).toHaveJSProperty("readOnly", true);
    await expect(page.getByRole("button", { name: "再挑戰一次" })).toBeEnabled();
    await page.getByRole("button", { name: "重新送出" }).click();
    await expect(board(page).getByRole("status")).toHaveText("你的名字已刻上森林英雄榜！");
    expect(api.posts).toHaveLength(2);
    expect(api.posts[1]).toEqual(api.posts[0]);
    expect(api.rows).toHaveLength(1);
    await expect(board(page).locator(".board-row.mine")).toContainText("斷線勇者");
  });

  test("rate limit shows the wait and keeps the round", async ({ page }) => {
    const api = new MockApi();
    await api.install(page);
    await page.goto("/");
    await finishRound(page, { score: 60, fruits: 6 });
    api.next.POST.push((route) =>
      route
        .fulfill({
          status: 429,
          headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Expose-Headers": "Retry-After", "Retry-After": "2" },
          contentType: "application/json",
          body: JSON.stringify({ error: { code: "rate_limited" }, retryAfter: 2 }),
        })
        .then(() => true),
    );
    await page.getByRole("button", { name: "送出" }).click();
    await expect(board(page).getByRole("status")).toContainText("秒後再試");
    await expect(page.getByRole("button", { name: "重新送出" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "重新送出" })).toBeEnabled({ timeout: 4000 });
    await page.getByRole("button", { name: "重新送出" }).click();
    await expect(board(page).getByRole("status")).toHaveText("你的名字已刻上森林英雄榜！");
    expect(api.rows).toHaveLength(1);
  });

  test("a saved record already pushed off the board is reported as saved", async ({ page }) => {
    const api = new MockApi();
    await api.install(page);
    await page.goto("/");
    await finishRound(page, { score: 60, fruits: 6 });
    api.next.POST.push(async (route) => {
      const body = route.request().postDataJSON();
      const row = api.insert(body.name || "不知名的勇者", body.score, body.submissionId);
      api.seed([900, 800, 700, 600, 500, 400, 300, 200, 100, 90]);
      await route.fulfill({
        status: 200,
        headers: { "Access-Control-Allow-Origin": "*" },
        contentType: "application/json",
        body: JSON.stringify({ outcome: "accepted", entryId: row.id, entries: api.top() }),
      });
      return true;
    });
    await page.getByRole("button", { name: "送出" }).click();
    await expect(board(page).getByRole("status")).toHaveText("紀錄已保存，榜單又有新高手了！");
    await expect(board(page).locator(".board-row.mine")).toHaveCount(0);
  });

  test("unconfigured service never offers submission and replay still works", async ({ page }) => {
    await page.addInitScript(() => ((window as any).__leaderboardUrl = ""));
    await page.goto("/");
    await finishRound(page, { score: 60, fruits: 6 });
    await expect(board(page).getByRole("status")).toHaveText("森林英雄榜還沒開張，這局成績不會保存。");
    await expect(page.getByLabel("留下大名")).toBeHidden();
    await page.getByRole("button", { name: "再挑戰一次" }).click();
    await expect(page.getByText("正在喚醒森林…")).toBeVisible();
  });

  test("a late response from the previous round does not touch the new screen", async ({ page }) => {
    const api = new MockApi();
    api.seed([300]);
    await api.install(page);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    await page.goto("/");
    api.next.GET.push(async (route) => {
      await gate;
      await route.fulfill({
        status: 200,
        headers: { "Access-Control-Allow-Origin": "*" },
        contentType: "application/json",
        body: JSON.stringify({ entries: [{ rank: 1, id: "stale", name: "上一局的回應", score: 999 }] }),
      });
      return true;
    });
    await finishRound(page, { score: 40, fruits: 4 });
    await expect(board(page).getByRole("status")).toHaveText("森林信使正在取回英雄榜…");
    const firstRound = await page.evaluate(() => (window as any).__test.roundId);
    await page.getByRole("button", { name: "返回森林" }).click();
    await finishRound(page, { score: 350, fruits: 35 });
    expect(await page.evaluate(() => (window as any).__test.roundId)).not.toBe(firstRound);
    await expect(board(page).getByRole("status")).toHaveText("森林的新紀錄就在眼前！留下大名，送出這漂亮的一刀。");
    release();
    await page.waitForTimeout(300);
    await expect(page.getByText("上一局的回應")).toHaveCount(0);
    await expect(board(page).getByRole("status")).toHaveText("森林的新紀錄就在眼前！留下大名，送出這漂亮的一刀。");
    await expect(page.locator(".final-score")).toContainText("350");
  });
});

test.describe("leaderboard presentation", () => {
  const longNames = (i: number) =>
    i === 0 ? "<img src=x onerror=window.__xss=1>" : i % 2 ? "ＷＷＷＷＷＷＷＷＷＷＷＷＷＷＷＷＷＷＷＷ" : "🍉🍉森林裡最快最快最快的刀客🍉🍉";

  for (const [label, size] of [
    ["desktop", { width: 1280, height: 800 }],
    ["mobile-portrait", { width: 390, height: 844 }],
    ["mobile-landscape", { width: 844, height: 390 }],
  ] as const) {
    test(`results board is readable on ${label}`, async ({ page }) => {
      const api = new MockApi();
      api.seed([900, 800, 700, 600, 500, 400, 300, 200, 150, 100], longNames);
      await api.install(page);
      await page.setViewportSize(size);
      await page.goto("/");
      await finishRound(page, { score: 250, fruits: 25, bombs: 1, maxCombo: 4 });
      await expect(rows(page)).toHaveCount(10);
      await expect(rows(page).first().locator(".board-name")).toHaveText("<img src=x onerror=window.__xss=1>");
      expect(await page.evaluate(() => (window as any).__xss)).toBeUndefined();
      expect(await page.locator("#result-stats img").count()).toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      // 名字欄位不會撐破木牌。
      expect(
        await page.evaluate(() =>
          [...document.querySelectorAll(".board-row")].every((r) => r.scrollWidth <= r.clientWidth + 1),
        ),
      ).toBe(true);
      // 榜單局部捲動，結算面板本身也不超出畫面。
      expect(
        await page.evaluate(() => {
          const m = document.querySelector("#message")!.getBoundingClientRect();
          return m.top >= 0 && m.bottom <= innerHeight;
        }),
      ).toBe(true);
      await page.screenshot({ path: `docs/leaderboard-${label}.png` });
      const replay = page.getByRole("button", { name: "再挑戰一次" });
      await replay.scrollIntoViewIfNeeded();
      await expect(replay).toBeInViewport();
      await replay.click();
      await expect(page.getByText("正在喚醒森林…")).toBeVisible();
    });
  }

  test("home dialog with long names on a narrow screen", async ({ page }) => {
    const api = new MockApi();
    api.seed([900, 800, 700, 600, 500, 400, 300, 200, 150, 100], longNames);
    await api.install(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.screenshot({ path: "docs/leaderboard-home-mobile.png" });
    await page.getByRole("button", { name: "歷史排行 TOP 10" }).click();
    await expect(page.getByRole("dialog").locator(".board-row")).toHaveCount(10);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.evaluate(() => (window as any).__xss)).toBeUndefined();
    await page.screenshot({ path: "docs/leaderboard-dialog-mobile.png" });
  });

  test("submitting with the keyboard in landscape", async ({ page }) => {
    const api = new MockApi();
    api.seed([300, 200]);
    await api.install(page);
    await page.setViewportSize({ width: 844, height: 390 });
    await page.goto("/");
    await finishRound(page, { score: 100, fruits: 10 });
    const input = page.getByLabel("留下大名");
    await input.focus();
    await page.keyboard.type("橫向勇者");
    await page.keyboard.press("Enter");
    await expect(board(page).getByRole("status")).toHaveText("你的名字已刻上森林英雄榜！");
    await expect(board(page).locator(".board-row.mine")).toBeInViewport();
    await page.screenshot({ path: "docs/leaderboard-submitted-landscape.png" });
  });
});
