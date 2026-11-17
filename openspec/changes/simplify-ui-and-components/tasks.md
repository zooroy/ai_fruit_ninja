# Tasks

## 1. Token 與元件層

- [x] 1.1 將 `src/style.css` 拆為 `src/styles/tokens.css`、`components.css`、`app.css` 並由 `main.ts` 依序匯入，畫面外觀不變；驗證 `pnpm build` 通過，且 1280×800 首頁截圖與拆分前一致
- [x] 1.2 在 `tokens.css` 定義 design.md 所列色彩、間距、圓角、字級、陰影 token，`app.css` 既有色碼改用 token；驗證 `grep -E "#[0-9a-fA-F]{3,8}" src/styles/components.css src/styles/app.css` 只剩 design 允許的例外
- [x] 1.3 新增 `src/ui/dom.ts`（`h`、`button`、`surface`、`status`）與 `components.css` 的 `.btn`、`.surface`、`.status` 樣式，`icon` variant 以型別要求 `ariaLabel`；新增 `tests/dom.test.ts` 驗證 variant／size class、預設 `type="button"`、圖示按鈕的 `aria-label`、Status 的 `role` 與 error tone，`pnpm test` 通過

## 2. 移除低畫質

- [x] 2.1 刪除頂部畫質按鈕、`Forest.low`、`Forest.quality()` 及其分支，固定使用一般畫質；更新 `tests/e2e/game.spec.ts` 的靜音測試與 `tests/e2e/leaderboard.spec.ts` 不再操作低畫質，驗證 `pnpm check` 與 `pnpm test:e2e` 通過，`grep -rn "quality\|低畫質" src tests` 無結果

## 3. 介面組裝與精簡

- [x] 3.1 新增 `src/ui/shell.ts`，以元件建立首頁、HUD、訊息頁、試切、倒數與攝影機卡並回傳具型別參照；`main.ts` 改用此物件並刪除 `innerHTML` 與 `el(id)`，保留 E2E 依賴的 `#tutorial`、`#score`、`#countdown`、`#pause`、`#privacy`、`#result-stats`、`#message` 或同步改為角色選取；驗證 `pnpm check`、`pnpm test`、`pnpm test:e2e` 通過
- [x] 3.2 將 `mode` 改為 `Mode` union，`setMode` 的可見性改為 `Record<Mode, …>` 查表；驗證 `pnpm check` 通過且 E2E 的試切→倒數→遊玩→結算→重玩流程通過
- [x] 3.3 依 design 文案表移除暗角、頁尾、標語、品牌圖示、英文 eyebrow、裝飾副標、`LOCAL` 標籤，首頁只保留一行規則，入口改為「排行榜」，所有按鈕改用 `button()`；在 `tests/e2e/game.spec.ts` 新增首頁斷言（規則文字只出現一次、無 `footer`、無 `.eyebrow`），驗證 E2E 通過
- [x] 3.4 遊玩中 HUD 移除最高連切欄（結算仍顯示），追蹤提示只在未偵測到手時顯示；一般水果不再產生飄字，連切與炸彈飄字改為 `N 連切 +X`、`炸彈 −50`；以 E2E 注入命中驗證：切中一般水果後 `#toasts` 無子元素、3 連切後出現連切飄字、遊玩中無最高連切欄
- [x] 3.5 不支援裝置說明改為 design 文案；更新 `tests/e2e/device.spec.ts` 的文字斷言，驗證手機與平板 E2E 仍無啟動按鈕且可開啟排行榜

## 4. 排行榜精簡

- [x] 4.1 `Standing` 收斂為 `qualified | below`，`invitation()` 與 `lines` 改為 design 文案，名字錯誤合併為單一訊息；更新 `tests/leaderboard-rules.test.ts`（含同分預估名次、新最高分與一般資格同格式、同分與低於門檻同提示）與 `tests/leaderboard-session.test.ts`，驗證 `pnpm test` 通過
- [x] 4.2 `src/ui/leaderboard.ts` 改用 `dom.ts` 元件，移除木牌外框、葉片、`HALL OF HEROES` 與前三名徽章，本局列以強調色與「你」標示；更新 `tests/e2e/leaderboard.spec.ts` 的文案斷言並移除 `.top1` 斷言，驗證鍵盤開關、焦點循環、390 寬窄視窗無水平溢出等既有 E2E 通過

## 5. 文件與整合驗證

- [x] 5.1 更新 README 中低畫質、「歷史排行 TOP 10」、排行榜差距規則與飄字的敘述，使其與新規格一致；驗證 `grep -n "低畫質\|TOP 10\|超越所需" README.md` 只剩正確敘述
- [x] 5.2 執行 `pnpm check`、`pnpm test`、`pnpm build`、`pnpm test:e2e` 全部通過，並在 1280×800、390 寬、390 高三種視窗截圖檢查首頁、遊玩、結算與排行榜 dialog 的 hover、disabled、focus 狀態
- [x] 5.3 執行 `openspec validate simplify-ui-and-components --strict` 通過

## Workflow follow-up

- 封存前確認 `forest-presentation` 與 `historical-leaderboard` 的 Purpose 段落是否需配合「簡潔介面」調整措辭（delta 無法修改 Purpose）。
- 實作驗證完成後執行 `/openspec-archive-change simplify-ui-and-components`。
