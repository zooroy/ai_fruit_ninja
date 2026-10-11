# Design

## Context

動機與範圍見 proposal.md。現況為 Vite / TypeScript 純前端，`src/main.ts` 直接建立 DOM，`results()` 先清理攝影機與追蹤，再顯示純 `Game` 的統計；`home()` 與 `setup()` 會重設遊戲物件。`message()` 會清空結算容器，非同步排行不可直接持有仍會被重設的 `game` 狀態。

目前 GitHub Pages workflow 安裝依賴、準備資源、測試及建置，正式 base 為 `/ai_fruit_ninja/`。沒有 Supabase 設定或資料存取層。CSS 有全頁 overflow 限制及窄／矮螢幕樣式，新增十筆列表需使用區域捲動。既有 Playwright 透過開發 hooks 模擬結算，適合加入 mock API 情境，真實資料庫交易須另測。

## Goals / Non-Goals

**Goals:** 保留純遊戲引擎與現有公開網址；將網路狀態與遊戲狀態隔離；由資料庫交易維持排名、並發及重試一致性；匿名訪客只經受控端點讀寫。

**Non-Goals:** 不信任前端做最終資格判斷，不引入使用者帳號或人身識別；不宣稱驗證了真實手勢、完整遊玩過程或杜絕偽造分數。沒有跨分頁恢復未送出成績、管理後台或自動姓名審查。

## Decisions

### 1. GitHub Pages + Supabase Edge Function + SQL RPC

瀏覽器使用 fetch 呼叫單一 `leaderboard` Edge Function，GET 讀前十名，POST 提交，OPTIONS 處理 CORS。使用公開無登入端點（明確設定 `verify_jwt = false`），函式以伺服器憑證呼叫指定 RPC，瀏覽器不直接寫資料表。前端只需要 `VITE_LEADERBOARD_URL`，不需管理金鑰或玩家 JWT。

選擇 Edge Function 是為了集中請求大小、欄位驗證、HTTP 狀態、節流與來源處理；相較開放匿名 INSERT 更可控。比 Vercel API 少一次網站遷移，保留既有模型同源路徑。RPC 承擔需要交易的一致性，不在 Edge Function 用「先 SELECT 再 INSERT」兩個請求模擬交易。

CORS 正式來源為 `https://zooroy.github.io`（沒有路徑），本機開發來源另外明確設定；來源設定不是身分驗證或防作弊。未知來源拒絕，網頁以外的呼叫者仍可能偽造 Origin。

參考：[公開 Edge Functions](https://supabase.com/docs/guides/functions/auth)、[Database functions 與權限](https://supabase.com/docs/guides/database/functions)。

### 2. 資料模型與最小權限

版本化檔案放 `supabase/migrations/`，保存所有曾成功入榜的紀錄，日後被擠出不刪除，讓重試可找回原接受結果。只有前十筆供公開讀取，沒有全部歷史分頁 API。

`leaderboard_entries` 的核心欄位：

| 欄位 | 意義 |
| --- | --- |
| id | 伺服器產生的公開紀錄 UUID，可用於成功列醒目提示 |
| submission_id | 用戶端每局產生的隨機 UUID，唯一鍵；不包含在公開排行 |
| display_name | 正規化後姓名 |
| score / fruits / bombs / max_combo | 本局結算快照 |
| accepted_at | 伺服器接受時間，鎖內產生，不使用用戶端時間 |
| accepted_order | 鎖內配置的單調順序，同分排名的最終依據 |

索引為 `(score DESC, accepted_order ASC)`；排行沒有並列名次。資料表 RLS 開啟，撤銷 `anon`、`authenticated` 直接讀寫與 PUBLIC 預設權限；讀榜與提交 RPC 僅允許 `service_role` 執行。RPC 優先 security invoker；若必須使用 definer，明確限定 owner、空 search_path、全限定名稱及 execute grants。Edge Function 不接受任意表名或 RPC 名稱。

伺服器密鑰只在 Supabase secrets；不可放 VITE_*、GitHub 靜態建置或 log。公開回應只輸出名次、id、名字、分數；統計留在資料庫。原始影像、手勢影格不進請求。

### 3. 單一交易的資格與重試

`submit_leaderboard_entry` 在交易內取得此排行榜固定的 transaction advisory lock；所有新增必須走此 RPC。取得鎖後才用新查詢讀榜（READ COMMITTED，避免等待鎖之前的過時 snapshot）。流程：

1. 正規化與驗證輸入。
2. 查詢 submission_id；存在且 payload 相同則回傳原成功，payload 不同則回傳衝突，不覆寫。
3. 查詢當下前十名；不足十筆可接受，已滿則 score 必須大於第十筆。
4. 合格才插入，於鎖內產生接受時間及順序；不合格不寫成績。
5. 回傳結果及同一交易下的最新榜單；提交成功後其他交易仍可能將本局擠出，不承諾永久保留名次。

資料庫唯一約束是第二道保護。一般讀榜不需取得寫鎖。測試必須用不同連線同時提交，不能只 mock 並發。

submission_id 是重試識別，不證明真正完成一局；無登入設計不能防止攻擊者另產生 UUID。第一版接受這個防作弊界線。

### 4. API 與驗證契約

GET 回傳 `{ entries }`，entries 最多十筆且附 rank。POST 輸入 `{ submissionId, name, score, fruits, bombs, maxCombo }`。首次接受用 201，重試既有成功用 200，均回傳 `{ outcome: 'accepted', entryId, entries }`；已跌出前十的原成功不捏造名次。

不合格用 409 / `not_qualified`，附最新 entries；同識別異 payload 用 409 / `submission_conflict`。400 為驗證錯誤，429 附 Retry-After，503 為後端不可用。錯誤用穩定 code 與前端繁體中文文案，不公開 SQL 或秘密。GET/POST 暫採 no-store，首頁開啟及每次結算載入一次，不輪詢。

補齊的實作預設（非使用者逐項指定）：

- trim 後空字串用預設名；以 Unicode code points 計算最多 20 字。拒絕控制字元，不將姓名當 HTML。
- 成績及統計為非負整數，採 PostgreSQL integer 範圍；score 是 5 的倍數、maxCombo 為 0 或至少 3 且不大於 fruits、score 不大於 15 × fruits。這只是合理性檢查，不是完整回放驗證。
- POST body 上限 4 KiB；每來源每分鐘最多 10 次 POST（包含重試），429 後可以稍後重試。
- 節流使用 DB 原子計數而非 Edge instance 記憶體；只採部署平台可信來源資訊，不能採客戶端自行傳入的 IP 欄位。以伺服器秘密 HMAC 處理來源、不存 raw IP，bucket 最長保留 24 小時並排程清理。正式部署前驗證 gateway header 信任邊界；若來源不可取得，使用明確的共用保守 bucket，不默默取消節流。

### 5. 前端狀態與文案

新增 `src/leaderboard/` 放 DTO、fetch client、排名比較及文案選擇，`src/ui/leaderboard.ts` 管理對話框與結算區。純 `game/engine.ts` 不呼叫網路。局開始配置 UUID，結算時複製統計成不可變快照；離開畫面增加 generation 並取消讀取，任何舊回應均不得改寫新畫面。取消網路不等於撤回已寫入資料。

狀態包括 loading、ready-qualified、ready-unqualified、submitting、submitted、load-error、submit-error、unconfigured。首次 POST 後固定 payload；網路結果不明時鎖定姓名，以原 payload 重試；確定 400 未接受時才允許修正。成功停用表單並醒目提示榜單中的 entryId；若已不在前十顯示「紀錄已保存，榜單又有新高手了」。

預估名次 = 1 + 榜單中分數大於或等於本局的筆數（限合資格時使用）。滿榜且未達標：追平差距 = cutoff - score，超越差距 = cutoff + 5 - score；分數均為五分倍數。前端榜單判斷只是邀請條件，送出結果由 API 決定。

文案優先順序：服務／提交狀態 > 空榜 > 嚴格新高 > 未滿十筆 > 一般合資格 > 未達標。範例：

| 情境 | 對白 |
| --- | --- |
| 空榜 | 森林的英雄榜等著第一位勇者，留下你的大名吧！ |
| 新最高分 | 森林的新紀錄就在眼前！留下大名，送出這漂亮的一刀。 |
| 未滿榜 | 英雄榜還有位置！你有機會登上第 N 名，留下大名吧。 |
| 一般合資格 | 漂亮的身手！有機會登上第 N 名，留下勇者的大名吧！ |
| 未達標 | 距離第十名還差 D 分，超越還需 X 分，再挑戰一次吧！ |
| 同分第十 | 已追平第十名！再得 5 分，就能超越這道紀錄。 |
| 成功 | 你的名字已刻上森林英雄榜！ |
| 資格失效 | 又有高手刷新紀錄了！這次未能入榜，再挑戰一次吧。 |
| 錯誤 | 森林信使暫時迷路了，重試看看吧！ |

### 6. 森林風格與可操作性

首頁次要按鈕直接置於啟動按鈕之後；排行以原生 dialog 顯示，可 Escape 關閉、焦點圈限及回復。結算則內嵌同一排行列表，不再疊第二個 modal。採既有奶油文字、深綠背景、暖金重點、木牌形狀，前三名徽章搭配可讀數字；CSS 裝飾不新增圖片依賴。

調整結算容器的 max-height 與 overflow-y，適應手機鍵盤、安全區及矮螢幕；資料用 textContent 呈現。載入、空榜、錯誤分開呈現，網路失敗不呼叫攝影機 fail()，讓重玩與回首頁始終可用。

## Risks / Trade-offs

- 公開匿名 API 可被直接呼叫、有效範圍內分數仍可偽造 → 輸入驗證、節流與權限限制只降低濫用，不標示為防作弊排行榜。
- 讀榜後資格改變 → 送出交易內重新判斷，回傳最新榜單與明確訊息。
- 整榜鎖讓提交序列化 → 第一版小型排行榜可接受；保持交易短，設定逾時，讀取不鎖。
- Supabase 免費專案暫停或額度耗盡 → 顯示服務失敗並保留純遊戲；維運文件記錄恢復方式與用量檢查。
- 共用網路可能共用節流額度 → 顯示可重試時間，不將它描述為每人限制。
- 匿名公開名字可能有不當文字 → 不執行 HTML；第一版無審查後台，需由專案擁有者在 Supabase 管理資料。
- 成功歷史長期累積 → 僅保存小型成績紀錄，監看資料容量；本次不自動刪除以保留冪等結果。

## Migration Plan

1. 確認使用者擁有的 Supabase 開發／正式專案與可用部署權限；使用本機安全登入或平台 secrets，禁止將秘密貼入文件。
2. 本機 Supabase 套用 migration 與資料庫測試，部署 Edge Function 至測試環境；正式資料禁止測試清空。
3. 驗證匿名 GET/POST、RLS／RPC 權限、節流、並發及回應遺失重試，再套用正式 migration 與函式。
4. GitHub Actions 以 repository variable 注入公開 `VITE_LEADERBOARD_URL`，更新 README 與 `.env.example`，忽略本機 secret env。函式 secrets、來源與節流設定另行配置，不經靜態建置。
5. 維持 Pages base 與現有網址；建置後驗證首頁、結算、模型及榜單，再發布並用兩個瀏覽器驗證資料共享。正式測試紀錄須可辨認，只清理自己建立的驗證資料。
6. 回退時還原前端版本或移除 endpoint 設定以停用榜單；可停用 Edge Function，保留資料表及既有成績，不做破壞性 down migration。

## Open Questions

- Supabase project ref、部署區域、專案擁有者的 CLI／平台權限尚未提供；這些是正式串接前置資料，不影響已決定的產品規則與架構。
