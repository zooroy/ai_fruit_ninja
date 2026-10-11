# 驗收紀錄

日期：2026-10-10。這份紀錄明確區分自動化、模擬裝置與真人實機；未執行的測試不算通過。

## 已完成

- 35 項 Vitest 測試：計時與暫停、終點命中封鎖、重玩、炸彈扣分下限、唯一命中、線段碰撞、雙手獨立連切／取消／結算、橫直向生成範圍、食指啟停、換序／遮擋／重入、攝影機錯誤與清理、音效及靜音。
- 7 項 Playwright Chrome 測試：桌面／手機版面、試切到結算及重玩、本地模型和假攝影機、模型失敗重試、低畫質及靜音、Worker 失敗回退、效果唯一生成和回收。
- `pnpm check`、`pnpm build`、`openspec validate add-gesture-fruit-ninja --strict` 通過。建置的單一主 JS 約 636 kB，Vite 有大小提示；功能不受影響，尚可進一步拆包。
- `pnpm assets` 校驗官方版本 1 手部模型 SHA-256，WASM 與模型皆同源載入。
- 已檢視 desktop.png、mobile.png、mobile-landscape.png、gameplay.png、gameplay-mobile.png，確認可讀性與響應式佈局。手機截圖來自桌面瀏覽器 viewport 模擬。
- 正式建置於 127.0.0.1:5189 通過首頁→攝影機／模型→試切→返回首頁檢查，無 page error、無非 GET 請求，且正式版不暴露開發測試 hooks。
- 假攝影機整合測試記錄無 POST 影像請求，返回首頁和結算後串流為 null；程式碼沒有影像儲存或上傳路徑。

## 規格對照

| 能力 | 自動驗證 | 尚待真人驗證 |
|---|---|---|
| gesture-input | 授權錯誤／重試、前鏡頭約束、串流清理、鏡像映射、雙手合成關鍵點、追蹤缺口 | 不同手型、光照、真實雙手交叉與快速揮動 |
| arcade-session | 30 秒邊界、唯一命中、計分連切、漏接、暫停恢復、結果及重玩 | 真實揮動的操作感受 |
| forest-presentation | 截圖檢視、低畫質、靜音、切半與粒子回收 | 手機實機流暢度與音效感受 |

## 桌面模擬攝影機觀察

環境：macOS 26.5.2、arm64，Google Chrome 154.0.8037.98，headless，假視訊來源，不含真實手。

- Worker 路徑：載入成功，單次觀察約 18.6 ms 推論回傳時間、約 58.8 FPS。
- 主執行緒限頻回退：載入成功，單次觀察約 17.8 ms、約 59.4 FPS。
- 這些是短暫觀察，不是三局統計，也不是真實手勢端到端延遲。
- 手機的推論頻率、相容性和三局效能尚未測量。任務 2.2 已依使用者接受現況的指示結案，未補做手機量測。

## 真人實機矩陣（未提供的細項紀錄）

| 裝置 | 瀏覽器／版本 | 單手及雙手 | 交叉及重入 | 旋轉／背景恢復 | 連續三局 |
|---|---|---|---|---|---|
| 筆電攝影機 | 待使用者試玩紀錄 | 未提供結果 | 未提供結果 | 未提供結果 | 未提供結果 |
| iPhone | Safari，版本待填 | 未提供結果 | 未提供結果 | 未提供結果 | 未提供結果 |

筆電：開啟 http://localhost:5188 ，授權，伸食指試切；接著測單手、左右雙手、收刀、快速橫掃、交叉遮擋、離開再進入畫面。驗證未見跳接刀光、左右方向一致、炸彈不結束遊戲。切換分頁後返回，應由「繼續挑戰」恢復。

手機：固定擺放，透過可信 HTTPS 開啟，分別測橫直向及前鏡頭。不能用區網 HTTP 的攝影機失敗當成裝置不支援。

效能：每台連續完成三局，記錄機型、瀏覽器、畫質、各局平均／最低 FPS、推論間隔。以外部高幀率錄影對照指尖實際位移與刀光首次位移，計算端到端延遲；目標約 30 FPS 以上、150 ms 以下，不能用模型單次時間代替此延遲。

## 使用者驗收結案

2026-10-10：使用者在知悉剩餘三項驗收內容後回覆「目前沒問題 都幫我打勾完成」，授權將 2.2、5.2、5.3 以接受現況方式結案。任務清單因此全部完成。未提供的裝置矩陣、手機推論頻率及三局效能數據仍維持未量測／未提供，不宣稱已通過所有機型或達成量化效能目標。

## 使用者試玩回饋

使用者回報：方向直覺、收起食指會停止出刀、雙手交叉後沒有刀光跳接。此次裝置型號與瀏覽器版本未確認，先記錄操作結果，不視為完整跨裝置矩陣通過。依回饋加大指尖光點，將細線改成有光暈的寬刀光。

## 歷史排行榜（add-historical-leaderboard）

日期：2026-10-11。環境：macOS、arm64、Node 26、PostgreSQL 16（Homebrew 執行檔）、Google Chrome（Playwright）。

### 已完成（自動化）

- `pnpm check`、`pnpm build`、`openspec validate add-historical-leaderboard --strict` 通過。
- `pnpm test`：146 項，含 Edge handler 56 項（CORS、方法、4 KiB 上限、姓名／成績邊界、錯誤映射、欄位白名單、HMAC 來源鍵）、排行 client、排名／資格／對白、單局提交狀態。
- `pnpm test:db`：71 項，在拋棄式 PostgreSQL 16 上套用 migration，並模擬 Supabase 的 `anon`／`authenticated`／`service_role` 與預設授權。涵蓋資料表約束、排名與門檻、冪等重試（含跌出榜後）、訪客權限全拒、多連線並發（以 `pg_stat_activity` 確認後到者等待鎖）、跨 instance 與並發節流、24 小時清理，以及 handler 接真實資料庫的 HTTP 契約。移除 advisory lock 的突變測試會使 4 項並發測試全部失敗，證明測試有效。
- 從乾淨副本以 `pnpm install --frozen-lockfile` 後執行 `pnpm test:db`，71 項通過。
- `pnpm test:e2e`：28 項（原 8 項＋排行榜 20 項，使用模擬 API）：首頁 dialog 無攝影機請求、Escape／焦點圈限／焦點回復、設定不變；結算合資格／未達標／追平／新紀錄／略過／資格失效／超長姓名；讀取失敗、回應遺失後以原內容重試只存一筆、429、已跌出榜、未設定服務、上一局遲到回應不污染新畫面；桌面與手機橫直向長名字截圖、無水平溢出、HTML 名字不執行。
- 截圖已檢視：`leaderboard-desktop.png`、`leaderboard-mobile-portrait.png`、`leaderboard-mobile-landscape.png`、`leaderboard-home-mobile.png`、`leaderboard-dialog-mobile.png`、`leaderboard-submitted-landscape.png`。手機截圖為桌面瀏覽器 viewport 模擬。
- 正式建置（base `/ai_fruit_ninja/`）以 `vite preview` 檢查：無 `__test` 與端點覆寫 hook、無 page error、無 POST、模型載入到試切畫面。未設定端點時排行榜顯示「還沒開張」；設定為無法連線的端點時顯示讀取失敗。產物不含 `service_role`、JWT 或其他秘密字樣。

### Supabase 測試專案串接（任務 5.3）

專案 `forest-slice-test`（ref `niipbzkmeltksfgynwvn`，Northeast Asia / Tokyo，PostgreSQL 17，Supabase CLI 2.120.0）。

- `supabase db push` 套用 migration。遠端查核：`anon`、`authenticated` 對兩張表與 5 個函式皆無權限，只有 `service_role` 有；兩張表 RLS 開啟；pg_cron 1.6.4 已建立 `leaderboard-purge-rate-limits` 每小時排程。
- 秘密：`RATE_LIMIT_SECRET`（隨機產生，未顯示）、`ALLOWED_ORIGINS=https://zooroy.github.io,http://localhost:5188`、`RATE_LIMIT_IP_HEADER=cf-connecting-ip`。函式以 `--use-api` 部署，`verify_jwt = false`。
- 匿名 HTTP 31/31 通過：OPTIONS 204、本機來源預檢、未知／缺少 Origin 403、PUT 405、GET 200 + no-store、首次 201、重試 200 同 entryId、異內容 409、同識別並發 5 次只存一筆、400（負分、非五分單位、超長名字、未知欄位、超過 4 KiB）、滿榜同分 409 且未寫入、同分依接受順序、以公開 key 直接讀改刪新增資料表與呼叫 3 個 RPC 全部 401／42501 且資料不變、超過頻率 429 + Retry-After、節流期間合法提交不寫入、GET 不受影響。
- 可信來源：以暫時的 header 回顯函式（驗證後已刪除）確認 `cf-connecting-ip` 等於對外 IP 且客戶端無法自帶；`x-forwarded-for` 最右側是輪替的平台代理 IP，不可用。以上限 3 次實測：第 4 次 429，偽造 `X-Forwarded-For`／`True-Client-IP`／`Forwarded`／`X-Real-IP` 皆無法繞過。驗證後恢復預設每分鐘 10 次。
- 本機開發伺服器接真實端點：首頁 dialog 讀到 10 筆 → 結算邀請「新紀錄」→ 送出 201 → 醒目顯示第 1 名；另一個獨立瀏覽器 context 讀到同一筆。無 page error。
- 清理：刪除本次建立的 11 筆「驗證5.3-」成績（刪除前確認資料表只有這 11 筆）與 9 個節流 bucket，遠端兩表皆為 0 筆。

### 尚未驗證

| 項目 | 原因 |
| --- | --- |
| 從不同網路實際取得獨立節流額度 | 以 header 回顯確認 `cf-connecting-ip` 反映對外 IP，未另外切換網路實測 |
| 正式專案部署、GitHub Pages 正式網址的真實 API 連線與兩個瀏覽器共享榜單（任務 6.2、6.3） | 尚未部署正式環境 |
| 手機實機鍵盤與橫直向留名流程 | 需真人裝置測試 |
