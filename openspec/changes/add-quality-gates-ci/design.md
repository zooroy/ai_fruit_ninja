# Design

## Context

- `deploy.yml` 在 push main 時執行：`pnpm assets`、`pnpm test`、`pnpm build`，然後部署。
- E2E 用 `channel: "chrome"`，靠 Chrome 的 `--use-fake-device-for-media-stream` 模擬攝影機。排行榜 API 全部由 `page.route` 攔截，因此不需要 Supabase 或任何 secret。模型與 WASM 由 `pnpm assets` 下載，且不進版控。
- `webServer` 用 `pnpm dev`（port 5188）啟動。
- `tsconfig` 的 `include` 只有 `src` 與 `supabase/functions`，Edge Function 是 Deno 程式碼，使用 `.ts` 副檔名 import。
- 沒有 ESLint；Prettier 已安裝，但沒有設定檔，也沒有 script。
- Repo 是公開的，CodeQL 與 GitHub artifact 免費。

## Goals / Non-Goals

**Goals:**

- 部署與 PR 共用同一份閘門定義，不在兩處重複列檢查步驟。
- 失敗時能直接從 artifact 看到截圖與 trace，不必在本機重現。
- Lint 只抓 `tsc --strict` 抓不到的問題，維持低雜訊。

**Non-Goals:**

- 不設定 branch protection，也不改成強制走 PR。這需要 repo 設定權限與流程改變，另案處理。
- `test:db` 需要本機 PostgreSQL 叢集，這次不放進 CI。
- 不加 Prettier 格式檢查閘門，避免一次改動整個 repo 的格式。
- 不加 Testing Library 與 MSW，理由見 Decisions。

## Decisions

### 1. `ci.yml` 是可重用 workflow，`deploy.yml` 透過 `needs` 等它完成

`ci.yml` 的觸發條件為 `pull_request`（main）與 `workflow_call`。`deploy.yml` 在 push main 時先以 `uses: ./.github/workflows/ci.yml` 呼叫閘門，`build` job 再 `needs: ci`。

- 對照方案 A：`ci.yml` 也在 push main 時觸發，`deploy.yml` 改用 `workflow_run` 等 CI 完成。缺點是 `workflow_run` 永遠以預設分支的 workflow 定義執行，不容易對應到觸發的 commit；同一個 commit 的 CI 與部署會分散在兩次執行裡，失敗原因也比較難追。
- 對照方案 B：deploy 保留自己的 test 步驟。缺點是檢查項目列在兩處，日後一定會不同步。
- 結果：push main 只會跑一次閘門，並且和部署出現在同一次執行的圖上；PR 跑同一份定義。

### 2. 閘門拆成兩個平行 job：`static` 與 `e2e`

- `static`：install、`pnpm check`、`pnpm lint`、`pnpm test`、`pnpm audit --prod --audit-level high`。unit 測試不讀 `public/` 的模型或 worker，所以不需要 `pnpm assets`。
- `e2e`：install、`pnpm assets`、`playwright install --with-deps chrome`、`pnpm test:e2e`；以 `if: !cancelled()` 上傳 `test-results/` 與 `playwright-report/`，保留 30 天（成功、失敗都上傳，只有手動取消時跳過）。
- 拆開可以讓 E2E 不必等 lint，總時間取兩者的較大值。`e2e` 以 `actions/cache` 依 `scripts/assets.mjs` 的雜湊快取 `public/models`，避免每次都重新下載模型。
- 稽核放在 `static` job，因為它不需要瀏覽器；它是獨立步驟，失敗訊息會清楚標示是 audit 失敗。

### 3. Playwright 在 CI 的設定

- 有 `process.env.CI` 時：`reporter: [["html", { open: "never" }], ["github"]]`、`retries: 1`、`trace: "on-first-retry"`、`forbidOnly: true`。本機維持現在的行為。
- `retries: 1` 用來吸收 runner 上偶發的時序問題；trace 只在重試時保留，artifact 不會太大。重試後才通過的測試，HTML 報告會標成 flaky，問題仍然看得到。
- 繼續使用 `channel: "chrome"`，因為假攝影機的參數已經在 Chrome 上驗證過。CI 透過 `playwright install chrome` 安裝 Chrome 穩定版。

### 4. ESLint：`typescript-eslint` 的 `recommended`，不開型別感知規則

- `eslint.config.js` 使用 flat config：`@eslint/js` recommended 加上 `tseslint.configs.recommended`，適用 `src`、`tests`、`supabase/functions`、`scripts` 與根目錄設定檔；忽略 `dist`、`public`、`test-results`、`playwright-report`、`openspec`、`.claude`、`.agents`。
- globals：`src` 用 browser；`src/tracking/worker.ts` 加 worker；`scripts`、`tests` 與設定檔用 node。
- 不開 `recommendedTypeChecked`：`tsc --strict` 已經負責型別。型別感知 lint 需要 project service，但 `tests` 不在 `tsconfig` 的 include 內，Edge Function 又使用 Deno 的 import 方式，設定成本高，而且會拖慢 lint。之後若要再收緊，可以只對 `src` 開啟。
- 既有違規要修正。只有在確實必要時才在單行加上 `eslint-disable-next-line`，並寫明理由；不在設定檔裡大範圍關閉規則。

### 5. CodeQL 使用 repo 內的進階設定檔

使用 `.github/workflows/codeql.yml`（`github/codeql-action` v3，`languages: javascript-typescript`，`build-mode: none`），觸發條件為 PR、push main 與 `schedule`（每週一次）。

- 對照方案：在 repo Settings 開啟 default setup。那樣零維護，但設定不在版控裡，看 repo 的人看不到。
- `javascript-typescript` 不需要建置，所以獨立成一個 workflow，不放進閘門的依賴鏈。CodeQL 警示由 GitHub 程式碼掃描管理，不阻擋部署。

### 6. 不加 Semgrep、Testing Library 與 MSW

- Semgrep：規則和 CodeQL 的 JS/TS 查詢大量重疊，多一套就多一份 triage，對這個規模的專案沒有額外收益。
- Testing Library：UI 是原生 TypeScript 元件，不是 React 或 Vue；需要驗證的互動行為（焦點圈限、dialog、表單送出）已由 Playwright 在真實瀏覽器中覆蓋，jsdom 加 Testing Library 只會增加第二套比較不真實的環境。
- MSW：排行榜的非同步競態由 `LeaderboardClient` 介面注入 fake client 測試，可以精準控制每個 promise 何時 resolve 或 reject。這種控制粒度比 MSW 的 handler 還細。E2E 的網路層則由 `page.route` 攔截。

## Risks / Trade-offs

- [GitHub runner 上 E2E 的時序比本機慢，可能不穩定] → `retries: 1` 加上 trace；實作時先在 PR 上跑幾次確認穩定，若有特定測試不穩，就修測試的等待條件，不要提高 timeout 掩蓋問題。
- [`pnpm audit` 依賴 npm registry 的稽核 API，暫時故障會擋住部署] → 接受。這是安全閘門的代價；必要時可以手動重跑該 job。
- [新漏洞公告可能讓原本綠燈的 main 變紅] → 這正是預期行為；修正方式是升級套件，不是移除稽核。
- [模型下載依賴 Google Storage] → `actions/cache` 快取 `public/models`，checksum 檢查已在 `scripts/assets.mjs` 中。
- [CodeQL 第一次掃描可能產生既有警示] → 實作時檢查第一次結果，修正真正的問題；誤報在 GitHub 介面標記為 dismiss，並寫明理由。

## Migration Plan

1. 在 branch 上加入 ESLint 並修正違規，在本機確認 `pnpm lint` 為 0 錯誤。
2. 加入 `ci.yml` 與 `codeql.yml`，開 PR 讓閘門實際執行，確認兩個 job 與 artifact 都正常。
3. 修改 `deploy.yml` 為呼叫 `ci.yml`，合併到 main 後確認部署只在閘門通過後執行。
4. 回滾方式：把 `deploy.yml` 還原成原本內嵌 test 與 build 的版本即可；`ci.yml` 與 `codeql.yml` 可以單獨刪除，不影響網站。
