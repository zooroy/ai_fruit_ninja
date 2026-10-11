import { defineConfig } from "vitest/config";
// tests/db 需要本機 PostgreSQL，另以 vitest.db.config.ts（pnpm test:db）執行。
export default defineConfig({
  test: { include: ["tests/**/*.test.ts"], exclude: ["tests/db/**", "node_modules/**"] },
});
