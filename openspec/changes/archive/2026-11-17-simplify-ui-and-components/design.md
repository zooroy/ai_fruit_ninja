# Design

## Context

- `src/main.ts` 以單一 `innerHTML` 字串建立首頁、HUD、訊息頁與攝影機卡，再用 `el(id)` 字串查找元素；`mode` 為 `string`。
- `src/ui/leaderboard.ts` 另有 `node(tag, className, text)` helper，以 DOM API 建立排行榜。兩種建構方式並存。
- `src/style.css`（989 行）沒有 CSS 變數；按鈕有 `.primary`、`.secondary`、`.board-submit`、`.board-retry`、`.text-button`、`.icon-button`、`.board-close` 七套。
- `src/leaderboard/rules.ts` 的 `Standing` 有 empty、record、open、qualified、tied、short 六種，`short` 另帶 `tieGap`、`beatGap`；只用於產生不同對白與判斷資格。
- 預設名字「不知名的勇者」同時存在於共用規則、Edge Function 與資料庫 RPC（`20261011000000_historical_leaderboard.sql`），且已寫入正式資料。
- 3D 場景顏色由 `src/scene/forest.ts` 以 Three.js 設定，與 CSS 無關。

## Goals / Non-Goals

**Goals:**
- 一套 token 與三個元件（Button、Surface、Status），所有 DOM 控制項經由同一組 factory 建立。
- `main.ts` 不再包含 HTML 字串，元素以具型別的參照取得。
- 移除需求刪除後不再使用的程式分支與型別欄位。

**Non-Goals:**
- 不引入 UI 框架、Web Components 或 CSS 前處理器。
- 不重構遊戲流程的控制邏輯（`setup`、`pause`、`frame` 等）為狀態機；只把 `mode` 型別化並集中各畫面可見性。
- 不改 3D 場景配色、Edge Function、資料庫或 API。
- 不處理 README 整體精簡與 repo 清理（另以一般 commit 進行）。

## Decisions

### 1. 純 TypeScript 元件 factory

新增 `src/ui/dom.ts`，將 `node()` 擴充為 `h(tag, props?, children?)`，並在其上提供：

```ts
type ButtonVariant = "primary" | "secondary" | "ghost" | "icon";
type ButtonSize = "sm" | "md" | "lg";
button({ label, variant, size = "md", ariaLabel?, type = "button" }): HTMLButtonElement
surface({ tone?: "light" | "dark" }, children): HTMLElement
status({ tone?: "normal" | "error", live?: "polite" | "assertive" }): HTMLParagraphElement
```

元件回傳原生元素，狀態更新直接設定屬性（`textContent`、`hidden`、`disabled`）。`icon` variant 必須提供 `ariaLabel`，用型別強制。

替代方案：
- Preact：元件與狀態模型更完整，但 UI 只有十幾個控制項，渲染主體是 canvas，增加的 bundle 與抽象沒有對應收益。
- Custom elements：shadow DOM 隔離全域 token 與 E2E 選擇器，light DOM 版本又只是換殼的 factory。
- 只用 CSS class：無法在型別層限制 variant 與 size，也無法強制圖示按鈕的無障礙名稱。

### 2. Token 與樣式檔拆分

`src/style.css` 拆為：

- `src/styles/tokens.css`：`:root` 上的 `--color-*`（primary、primary-hover、surface、surface-strong、text、text-muted、accent、danger、focus）、`--space-1..6`、`--radius-sm|md|full`、`--font-size-sm|md|lg|display`、`--shadow-*`。
- `src/styles/components.css`：`.btn` 與 `.btn--{variant}`、`.btn--{size}`、`.surface`、`.status`、`.status--error`。
- `src/styles/app.css`：版面、HUD、攝影機卡、排行榜列表、窄視窗與矮視窗 media query。

元件樣式只能使用 token；`app.css` 僅在版面尺寸上使用常數。驗收時以 `grep` 確認 `components.css` 沒有寫死色碼。

舊按鈕對應：

| 舊 class | 新元件 |
| --- | --- |
| `.primary`（啟動、重玩、繼續） | primary / lg |
| `.board-submit` | primary / md |
| `.secondary`（排行榜入口） | secondary / lg |
| `.board-retry` | secondary / sm |
| `.text-button`（返回首頁） | ghost / sm |
| `.icon-button`（靜音、暫停）、`.board-close` | icon / md |

### 3. 介面組裝與型別化 mode

新增 `src/ui/shell.ts`，以元件建立所有畫面並回傳具型別的參照物件（`ui.start`、`ui.score`、`ui.message.title` 等）。`main.ts` 使用該物件，刪除 `el(id)`。只保留無障礙關聯或測試需要的 id。

```ts
type Mode = "welcome" | "loading" | "error" | "tutorial" | "countdown" | "playing" | "paused" | "results";
```

各畫面的可見性改為 `Record<Mode, ...>` 查表，取代 `setMode` 內多個 `includes` 判斷。

### 4. 排行狀態型別收斂

`Standing` 改為：

```ts
type Standing = { kind: "qualified"; rank: number } | { kind: "below"; cutoff: number };
```

empty、record、open 都是具資格且只差名次，tied 與 short 只差門檻敘述；需求改變後這些差異不再影響行為。`qualifies(s)` 變成 `s.kind === "qualified"`。`SessionState` 與提交、重試、冪等邏輯不變。

名字驗證的 `NameCheck.reason`（too_long、control）屬於前後端共用規則，保持不變；前端只把兩種原因對應到同一則訊息。

### 5. 預設名字不變

「不知名的勇者」是資料值，不是介面文案。修改需新增 migration，且既有紀錄會與新紀錄不一致。保留原值；輸入框 placeholder 顯示同一字串，讓玩家知道留白時的名字。

### 6. 移除低畫質

刪除 `Forest.low`、`Forest.quality()` 與相關分支，固定使用現行一般畫質（pixel ratio 上限 1.7、啟用陰影、15 顆粒子）。

### 7. 文案表

介面文字以此表為準，實作不另行增加說明文字。

| 位置 | 文字 |
| --- | --- |
| 首頁標題 | 揮手之間，果然痛快。 |
| 首頁規則 | 伸出食指切水果 · 30 秒 · 炸彈 −50 |
| 首頁按鈕 | 啟動攝影機／排行榜 |
| 隱私 | 影像只在本機處理，不會上傳 |
| 不支援裝置 | 請改用筆電或桌機遊玩，手機與平板可瀏覽排行榜。 |
| 載入中 | 正在啟動攝影機… |
| 試切 | 伸出食指，劃過水果／收起食指即收刀；命中後：準備開始 |
| 未偵測到手 | 把手放進畫面 |
| 暫停 | 已暫停；按鈕：繼續 |
| 結算 | 本局結束；統計：水果、最高連切、炸彈；按鈕：再玩一次 |
| 錯誤 | 無法啟動；內容沿用 `cameraError()`；按鈕：重試 |
| 返回 | 返回首頁 |
| 飄字 | `N 連切 +X`、`炸彈 −50` |
| 排行榜標題 | 排行榜 TOP 10 |
| 可留名 | 可排第 N 名 |
| 未達標 | 需超過 N 分才能入榜 |
| 載入中／空榜 | 載入中…／尚無紀錄 |
| 未啟用（結算／首頁） | 排行榜未啟用，本局成績不會保存／排行榜未啟用 |
| 讀取失敗 | 無法載入排行榜；按鈕：重新載入 |
| 送出失敗 | 送出失敗，請重試；按鈕：重新送出 |
| 限流 | 送出太頻繁，請 N 秒後再試 |
| 衝突 | 本局已用不同內容送出，無法再次送出 |
| 資料無效 | 成績資料無效，無法送出 |
| 成功 | 已登上排行榜 |
| 已保存但跌出 | 已保存，但未在前十名 |
| 資格失效 | 資格已失效（副標為「需超過 N 分才能入榜」） |
| 名字欄 | 標籤：名字；說明：公開顯示，可留白；按鈕：送出／送出中… |
| 名字錯誤 | 名字最多 20 字，且不可含控制字元 |

## Risks / Trade-offs

- [E2E 依賴舊文案、`低畫質` 按鈕與 `.top1` 選擇器] → 同一 task group 內更新斷言；以角色與名稱選取元素，減少對 class 的依賴。
- [沒有視覺回歸基準，拆樣式時可能漏掉狀態樣式（hover、disabled、focus）] → 每組完成後在 1280×800、390 寬、390 高三種視窗截圖比對首頁、遊玩、結算、排行榜 dialog。
- [拆 `main.ts` 時改到遊戲流程] → 只搬移 DOM 建立與查找，流程函式保持原樣；既有 game、gestures、session 單元測試與 E2E 全部通過才算完成。
- [移除前三名徽章後前段名次辨識度降低] → 名次數字保留，本局以強調色標示；規格已接受此取捨。

## Migration Plan

純前端變更，推送 `main` 後由既有 GitHub Pages 工作流程部署。後端與資料不變，回退只需 revert 前端 commit。
