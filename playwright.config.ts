import { defineConfig } from "@playwright/test";
// CI 保留 HTML 報告與重試時的 trace 作為驗收證據；本機維持精簡輸出。
const ci = !!process.env.CI;
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 45000,
  forbidOnly: ci,
  retries: ci ? 1 : 0,
  reporter: ci ? [["html", { open: "never" }], ["github"]] : "list",
  use: {
    trace: ci ? "on-first-retry" : "off",
    baseURL: "http://127.0.0.1:5188",
    headless: true,
    channel: "chrome",
    launchOptions: {
      args: [
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
      ],
    },
  },
  webServer: {
    command: "pnpm dev",
    url: "http://127.0.0.1:5188",
    reuseExistingServer: true,
  },
});
