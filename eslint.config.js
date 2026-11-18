// ESLint flat config。型別檢查交給 `tsc --strict`，這裡只抓 tsc 抓不到的問題。
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/",
      "public/",
      "test-results/",
      "playwright-report/",
      "openspec/",
      ".claude/",
      ".agents/",
      ".pnpm-store/",
      ".venv/",
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ["src/tracking/worker.ts"],
    languageOptions: { globals: globals.worker },
  },
  {
    files: ["tests/**/*.ts", "scripts/**/*.mjs", "*.config.{js,ts}"],
    languageOptions: { globals: globals.node },
  },
);
