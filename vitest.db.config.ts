import { defineConfig } from "vitest/config";
// 真實 PostgreSQL 測試：共用一個拋棄式叢集，檔案依序執行以免互相清空資料。
export default defineConfig({
  test: {
    include: ["tests/db/**/*.test.ts"],
    globalSetup: ["tests/db/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 60000,
  },
});
