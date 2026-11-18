# Proposal

## Why

目前唯一的 workflow `deploy.yml` 只在推上 main 後跑 unit 測試與建置。33 個 Playwright E2E 只在本機執行，沒有 lint、沒有相依套件或程式碼安全掃描，而且驗收截圖不會留下來。也就是說，任何改動都可能在沒有完整驗證的情況下部署上線，事後也無法回溯證據。這個專案的定位是展示前端工程品質，品質閘門應該由 CI 強制執行，不能只靠開發者記得在本機跑。

## What Changes

- 新增 CI 品質閘門，在 pull request 與部署前執行：typecheck、lint、unit 測試、Playwright E2E（Chrome、假攝影機）、相依套件稽核。
- 部署改為只在品質閘門全部通過後進行；`deploy.yml` 不再自行跑測試，改為先呼叫同一份閘門。
- 每次 E2E 執行無論成功或失敗，都把截圖、失敗 trace 與 HTML 報告上傳成 workflow artifact，作為驗收證據。
- 新增 ESLint（flat config 與 typescript-eslint），加入 `pnpm lint`，並修正既有違規，不靠大範圍停用規則。
- 新增 CodeQL 程式碼掃描（javascript-typescript），在 pull request、push main 與每週排程時執行，結果顯示在 GitHub Security 頁籤。
- 相依套件稽核：`pnpm audit --prod`，只要有 high 以上等級的漏洞，閘門就失敗。

## Capabilities

### New Capabilities

- `quality-gates`：程式碼合併與部署前必須通過的自動化檢查、檢查結果與驗收證據的保存，以及安全掃描的觸發時機。

### Modified Capabilities

無。遊戲、手勢、呈現與排行榜的行為都不變。

## Impact

- CI：新增 `.github/workflows/ci.yml`（可重用的閘門）與 `.github/workflows/codeql.yml`；修改 `.github/workflows/deploy.yml`。
- 工具鏈：devDependencies 新增 `eslint`、`@eslint/js`、`typescript-eslint`、`globals`；新增 `eslint.config.js`；`package.json` 新增 `lint` script。
- 測試設定：`playwright.config.ts` 在 CI 使用 HTML 與 GitHub reporter，並在失敗重試時保留 trace。
- 原始碼：只為修正 lint 違規做最小改動，不改變行為。
- 文件：README 與 `docs/openspec-workflow.md` 補上品質閘門說明。
- 不在範圍：改走 PR 流程與 branch protection、驗收報告產生器、Testing Library 與 MSW、`test:db` 進 CI。
