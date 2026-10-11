# Design

## Context

動機見 proposal.md。目前程式沒有任何裝置判斷，手機與桌面走同一套流程：

- `src/main.ts` 的 `setup()` 是唯一要求攝影機與載入手勢模型的入口，由首頁 `#start` 與結算「再挑戰一次」呼叫；開發模式的 `__test.setup()` 也能直接呼叫。頁面載入時不會預載模型或要求權限。
- `src/camera/camera.ts` 以 `facingMode: "user"` 取得鏡頭，筆電與手機共用。
- `src/style.css` 的 `max-width: 650px` 與 `max-height: 550px` 樣式同時服務手機與縮小的桌面視窗，不是手機專用。
- E2E 以 390×844、844×390 viewport 模擬「手機」截圖，實際是桌面 Chrome，不會回報觸控輸入。

## Goals / Non-Goals

**Goals:**
- 在第一個畫面就判斷，不支援的裝置永遠不會要求攝影機權限或下載模型。
- 判斷結果由單一純函式決定，可單元測試；阻擋發生在流程入口，而不只是隱藏按鈕。
- 桌面窄視窗、矮視窗與觸控筆電維持現有可玩性與版面。

**Non-Goals:**
- 不刪除響應式 CSS、遊戲引擎的可用區域調整或 `facingMode` 設定；它們仍服務桌面情境。
- 不阻擋 Supabase API；手機仍可讀取排行榜。
- 不做「仍要繼續」的覆寫開關，也不偵測裝置型號。

## Decisions

### 1. 以主要輸入判斷：`(pointer: coarse) and (hover: none)`

主要指標是手指且無法懸停時視為不支援，手機與平板都會命中；觸控筆電的主要指標是觸控板或滑鼠（`pointer: fine`），所以不會被誤擋。

替代方案：
- User-Agent：iPadOS 預設偽裝成 macOS，會漏判；字串也容易被修改。
- 螢幕寬度：會誤擋縮小的桌面視窗，也會漏掉橫放的大手機與平板。
- `any-pointer: coarse`：任何觸控能力都會命中，會誤擋觸控筆電。

邊界：接上觸控板的 iPad、平板模式的 Chromebook 可能回報 `pointer: fine` 而被允許遊玩。這符合「主要用滑鼠或觸控板操作」的定義，不另外處理。

### 2. 判斷時機：頁面載入時決定，回到首頁時重新評估

在初始化時以 `matchMedia` 求值，並監聽 `change`；只在首頁狀態套用新結果，遊戲進行中或結算時不中斷玩家（例如遊戲中接上觸控板）。新增 `src/device.ts` 匯出以 `matchMedia` 注入的純函式，供 Vitest 以假 media query 測試。

### 3. 雙重阻擋：介面與流程入口

- 介面：首頁 `#panel` 以說明卡取代 `#start`，文案沿用森林語氣（例如「森林需要更大的舞台」＋請改用筆電或桌機的攝影機遊玩），並隱藏只和攝影機有關的隱私提示；「歷史排行 TOP 10」保留在說明卡下方。
- 流程：`setup()` 開頭檢查不支援時直接返回，涵蓋結算重玩與開發 hooks 等所有路徑，確保永遠不呼叫 `getUserMedia` 或 `tracker.start()`。

被擋下的裝置走不到結算，因此留名表單自然不會出現，不需要修改 `src/ui/leaderboard.ts`。

### 4. 測試以真實觸控模擬，不只靠 viewport

E2E 以 Playwright 的 `hasTouch: true, isMobile: true` context 模擬手機與平板，檢查 media query 實際命中、沒有攝影機請求、沒有模型下載、首頁排行仍可開啟。既有 390×844、844×390 測試改名為桌面窄／矮視窗，並將截圖改名（例如 `docs/narrow-window.png`），避免被誤讀為手機支援。

### 5. 正式規格 Purpose 在封存時另行更新

delta 只能修改需求。`forest-presentation` 與 `gesture-input` 的 Purpose 仍寫著「固定擺放的手機」，封存同步後直接編輯正式規格的 Purpose 段落，改為桌機與筆電。

## Risks / Trade-offs

- [少數裝置誤判，例如沒有鍵盤的 Windows 觸控平板會被擋] → 說明卡寫明「請改用筆電或桌機」，屬可接受的保守結果；收到回報再調整。
- [Playwright 的觸控模擬可能未讓 `hover: none` 生效] → 實作時先驗證 media query 命中；不生效時改用 CDP `Emulation.setTouchEmulationEnabled` 或在測試中注入假 `matchMedia`，並在驗收紀錄註明。
- [現有手機玩家突然無法遊玩] → 這是使用者決定的 BREAKING 變更；說明卡清楚交代原因，排行榜仍可瀏覽。
- [縮小桌面視窗的版面日後被誤當成手機專用而刪除] → 測試與截圖改名為窄／矮視窗，並在規格以桌面視窗描述。

## Migration Plan

1. 只改前端與文件，不動 Supabase 或 Edge Function。
2. 推送至 `main` 由 GitHub Pages 工作流程部署。部署後以桌面 Chrome 確認可玩、以觸控模擬確認被擋下，並請使用者用手機確認看到說明卡。
3. 回退：還原此變更的 commit 後重新部署即可恢復手機遊玩，不涉及資料遷移。
