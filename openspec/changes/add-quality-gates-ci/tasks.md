# Tasks

## 1. ESLint

- [x] 1.1 安裝 `eslint`、`@eslint/js`、`typescript-eslint`、`globals`（固定版本），依 design 決策 4 新增 `eslint.config.js`，並在 `package.json` 加入 `"lint": "eslint ."`；以 `pnpm lint` 能執行並列出結果來驗證設定有效（此時可以有違規）。
- [x] 1.2 修正既有 lint 違規，行為不變；只有在確實必要時才加單行 disable 並寫明理由。以 `pnpm lint` 0 錯誤，且 `pnpm check`、`pnpm test`、`pnpm test:e2e` 全部通過來驗證。

## 2. CI 品質閘門

- [x] 2.1 修改 `playwright.config.ts`：有 `CI` 時使用 HTML 與 GitHub reporter、`retries: 1`、`trace: "on-first-retry"`、`forbidOnly: true`；在本機以 `CI=1 pnpm test:e2e` 確認會產生 `playwright-report/index.html`，未設 `CI` 時輸出與原本相同。
- [x] 2.2 新增 `.github/workflows/ci.yml`（`pull_request` 對 main 與 `workflow_call`），包含平行的 `static` 與 `e2e` job（design 決策 2），`e2e` 以 `if: always()` 上傳 `test-results/` 與 `playwright-report/`（保留 30 天），模型以 `actions/cache` 快取；以 `actionlint`（或 `gh workflow view`）檢查語法，並在本機依序執行 job 內的每個指令，確認都成功。
- [x] 2.3 修改 `.github/workflows/deploy.yml`：push main 時先 `uses: ./.github/workflows/ci.yml`，`build` 改為 `needs: ci`，並移除重複的 `pnpm test`；以 workflow 語法檢查確認 `build` 依賴 `ci`，且部署步驟不變。

## 3. 安全掃描

- [x] 3.1 在 `ci.yml` 的 `static` job 加入 `pnpm audit --prod --audit-level high` 獨立步驟；在本機執行同一個指令並記錄結果，若有 high 以上的漏洞，先升級套件，讓指令通過。
- [x] 3.2 新增 `.github/workflows/codeql.yml`（`github/codeql-action` v3，`javascript-typescript`，`build-mode: none`，PR、push main 與每週 `schedule`，權限 `security-events: write`）；以 workflow 語法檢查來驗證。

## 4. 文件

- [x] 4.1 README 加上 CI 狀態徽章與一句品質閘門說明（檢查項目，以及 artifact 位置）；`docs/openspec-workflow.md` 的驗證段落改為「由 CI 品質閘門執行」，並列出本機對應指令；以實際執行文件列出的每個指令來驗證。

## 5. 整合驗收

- [ ] 5.1 推送 branch 並開 PR：確認 `static`、`e2e` 與 CodeQL 都出現在 PR 檢查且通過，artifact 可以下載，並包含截圖與 HTML 報告；若 E2E 在 runner 上不穩，修正測試的等待條件後再跑。
- [ ] 5.2 合併到 main：確認同一次 deploy 執行先跑完 `ci`，才進行 build 與 deploy，且正式網站正常載入；`openspec validate add-quality-gates-ci --strict` 通過。

## Workflow follow-up

- 封存並同步規格，建立 `openspec/specs/quality-gates/spec.md`。
- README 的變更清單補上第 5 個 change 連結。
- Git commit 訊息依專案提交技能確認。
