# 排行榜後端（Supabase）

歷史前十排行榜的資料庫與公開 API。前端只知道一個公開網址 `VITE_LEADERBOARD_URL`，所有讀寫都經過 `leaderboard` Edge Function，再由它以伺服器憑證呼叫固定的資料庫 RPC。

```text
瀏覽器 ──fetch──▶ Edge Function: leaderboard (verify_jwt = false)
                    │ 驗證、CORS、節流、錯誤碼
                    ▼ service_role
              PostgreSQL RPC: leaderboard_top / leaderboard_submit / leaderboard_take_submit_token
```

| 路徑 | 內容 |
| --- | --- |
| `config.toml` | CLI 設定；`[functions.leaderboard] verify_jwt = false` |
| `migrations/` | 版本化 SQL，依檔名順序套用 |
| `functions/leaderboard/` | 公開 Edge Function：`index.ts` 為 Deno 入口，`handler.ts` 為可測試邏輯 |
| `functions/_shared/` | 前端與 Edge Function 共用的姓名／成績驗證規則 |

## 資料模型

`public.leaderboard_entries` 保存所有曾成功入榜的成績；日後被擠出前十也不刪除，讓重試可以找回原本的接受結果。

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `id` | uuid | 伺服器產生的公開紀錄 id，前端用來醒目提示成功列 |
| `submission_id` | uuid，唯一 | 用戶端每局隨機產生的重試識別；不公開 |
| `display_name` | text | 正規化後姓名：去頭尾空白、空值改為「不知名的勇者」、1–20 個 code points、無控制字元 |
| `score` / `fruits` / `bombs` / `max_combo` | integer | 本局結算快照，非負 |
| `accepted_at` | timestamptz | 取得鎖後的伺服器時間（`clock_timestamp()`），不使用用戶端時間 |
| `accepted_order` | bigint，唯一 | 鎖內配置的單調順序，同分排名依據 |

- 排名：`score DESC, accepted_order ASC`，有對應索引 `leaderboard_entries_rank_idx`；沒有並列名次，同名不同局各自佔位。
- 合理性檢查（資料表 check 與 RPC 皆有）：分數為 5 的倍數、`score ≤ 15 × fruits`、`max_combo` 為 0 或介於 3 與 `fruits` 之間。這只能擋下明顯錯誤，**不是**回放驗證或防作弊。
- `leaderboard_private.rate_limits`：提交節流計數（bucket、視窗開始時間、次數），bucket 是 HMAC 後的來源鍵，不存原始 IP。

## 權限

- 兩張表都開啟 RLS 且沒有 policy；`anon`、`authenticated` 與 PUBLIC 的表與函式權限全部撤銷，訪客無法直接讀寫或呼叫 RPC。
- 只有 `service_role`（Edge Function 使用）可以執行 RPC；所有函式為 `security invoker`，並固定 `search_path = ''`、使用全限定名稱。
- 服務金鑰只存在 Supabase 平台，不可放進 `VITE_*`、GitHub 靜態建置或 log。

## RPC 回應

所有 RPC 回傳 `jsonb`。

### `leaderboard_top()`

```json
[{ "rank": 1, "id": "8c1f…", "name": "不知名的勇者", "score": 150 }]
```

最多十筆，只有名次、id、名字與分數。空榜回傳 `[]`。

### `leaderboard_submit(p_entry jsonb)`

輸入 `{ "submissionId", "name", "score", "fruits", "bombs", "maxCombo" }`。

| `outcome` | 其他欄位 | 意義 |
| --- | --- | --- |
| `accepted` | `created: true`、`entryId`、`entries` | 首次接受並寫入 |
| `accepted` | `created: false`、`entryId`、`entries` | 同一 `submissionId` 且內容相同的重試；回傳原紀錄，不重新套用門檻，`entries` 可能已不含它 |
| `not_qualified` | `entries` | 滿十筆且分數未嚴格大於第十名，未寫入 |
| `submission_conflict` | `entries` | 同一 `submissionId` 但內容不同，未覆寫 |
| `invalid` | `code`：`invalid_request`、`invalid_name`、`invalid_stats` | 輸入不合法，未寫入 |

流程在單一交易中完成：驗證 → 取得排行榜交易級 advisory lock → 以新查詢讀取 `submission_id` 與當下前十名 → 合格才插入 → 回傳最新前十。函式要求 READ COMMITTED（Supabase／PostgREST 預設），否則拋錯，以免沿用取得鎖之前的快照。鎖等待上限 5 秒。

提交成功後，其他提交仍可能把本局擠出前十；排行榜不承諾永久保留名次。

### `leaderboard_take_submit_token(p_bucket text, p_limit int, p_window_seconds int)`

固定視窗原子計數：`{ "allowed": true, "remaining": 9 }` 或 `{ "allowed": false, "retryAfter": 42 }`（秒）。同時順帶清除超過 24 小時的紀錄。專案若已啟用 `pg_cron`，migration 會另外排程每小時清理；未啟用時可在啟用後執行：

```sql
select cron.schedule('leaderboard-purge-rate-limits', '17 * * * *',
  'select leaderboard_private.purge_rate_limits()');
```

## HTTP API

單一端點 `https://<project-ref>.supabase.co/functions/v1/leaderboard`，免登入（`verify_jwt = false`）。所有回應都帶 `Cache-Control: no-store` 與 `Vary: Origin`；錯誤一律為 `{ "error": { "code", "message" } }`，`message` 為繁體中文，不含 SQL、堆疊或秘密。

### CORS

只接受 `ALLOWED_ORIGINS` 列出的 `Origin`（預設 `https://zooroy.github.io`，不含路徑）。缺少或未知的 `Origin` 回 `403 origin_not_allowed`，且不碰資料庫。這只限制瀏覽器網頁，不是身分驗證：網頁以外的呼叫者可以偽造 `Origin`。

`OPTIONS` 預檢回 `204`，允許 `GET, POST, OPTIONS` 與 `Content-Type` header，並以 `Access-Control-Expose-Headers` 公開 `Retry-After`。其他方法回 `405 method_not_allowed`。

### `GET` 讀取前十

```http
GET /functions/v1/leaderboard
Origin: https://zooroy.github.io
```

```json
200 { "entries": [{ "rank": 1, "id": "8c1f…", "name": "阿明", "score": 150 }] }
```

### `POST` 提交本局

```http
POST /functions/v1/leaderboard
Origin: https://zooroy.github.io
Content-Type: application/json

{ "submissionId": "3f2b8e4a-1c2d-4e5f-8a9b-0c1d2e3f4a5b", "name": "阿明",
  "score": 120, "fruits": 12, "bombs": 1, "maxCombo": 3 }
```

| 狀態 | `code` | 回應 | 說明 |
| --- | --- | --- | --- |
| `201` | — | `{ outcome: "accepted", entryId, entries }` | 首次接受 |
| `200` | — | 同上 | 同一局內容相同的重試，回傳原紀錄；`entries` 可能已不含它 |
| `400` | `invalid_request` | `error` | 非 JSON、非 `application/json`、未知欄位或 `submissionId` 不是 UUID |
| `400` | `invalid_name` | `error` | 名字超過 20 個 code points、含控制字元或不是字串 |
| `400` | `invalid_stats` | `error` | 成績不是非負整數、不是 5 的倍數或統計不合理 |
| `400` | `payload_too_large` | `error` | 請求本文超過 4 KiB |
| `409` | `not_qualified` | `error`、`entries` | 已滿十筆且未嚴格超過第十名；附最新榜單 |
| `409` | `submission_conflict` | `error`、`entries` | 同一 `submissionId` 已用不同內容提交 |
| `429` | `rate_limited` | `error`、`retryAfter`，header `Retry-After` | 提交過於頻繁 |
| `503` | `service_unavailable` | `error` | 資料庫或設定無法使用 |

`400` 代表確定未寫入，前端才允許修改內容；其他失敗前端一律以相同內容重試。

## 節流

每個 `POST`（包含無效請求與重試）先向資料庫原子取得 token，不使用 Edge instance 記憶體，因此多個函式 instance 與並發請求共用同一額度。

- **來源鍵**：讀取 `RATE_LIMIT_IP_HEADER` 指定的 header；若為逗號分隔清單，取最右側（最靠近平台、由可信代理附加的一段）。以 `RATE_LIMIT_SECRET` 做 HMAC-SHA256 後存成 `ip:<hex>`，**不存原始 IP**。
- **額度**：每個來源每分鐘 `RATE_LIMIT_PER_MINUTE`（預設 10）次。
- **共用 bucket**：未設定 header 或請求沒有該 header 時，所有請求共用 `shared` bucket，每分鐘 `RATE_LIMIT_SHARED_PER_MINUTE`（預設 30）次。這是刻意的保守回退：寧可同時段玩家互相分享額度，也不默默取消節流。
- 只能採用部署平台設定的 header，**不可**採用客戶端可自行附加的值。**Supabase 上應設定為 `cf-connecting-ip`**（2026-10-11 在測試專案以暫時的 header 回顯函式實測）：

  | Header | 函式實際收到 | 結論 |
  | --- | --- | --- |
  | `cf-connecting-ip` | 等於呼叫端對外 IP；客戶端自帶此 header 會被 Cloudflare 以 403 擋下 | 可信 |
  | `x-forwarded-for` | `客戶端, 客戶端, 13.248.115.x`，最右側是會輪替的平台代理 IP | 不可用：同一來源會被分散到不同 bucket |
  | `true-client-ip`、`forwarded` | 原樣保留客戶端送的值 | 可偽造 |
  | `x-real-ip` | 被移除 | — |

  以 `cf-connecting-ip` 和每分鐘 3 次的上限驗證：第 4 次起回 429，偽造上表其他 header 也換不到新額度。平台行為日後若改變，需重新驗證；header 缺失時會自動回到共用 bucket。
- 共用網路（學校、公司、行動網路 NAT）可能共享同一來源額度，因此介面顯示「稍後再試」，不描述為每人限制。

## 函式設定與秘密

Supabase 會自動提供 `SUPABASE_URL` 與 `SUPABASE_SERVICE_ROLE_KEY`。其餘以 `supabase secrets set` 設定，**不要**放進 GitHub、`VITE_*` 或前端建置：

| 名稱 | 必要 | 說明 |
| --- | --- | --- |
| `RATE_LIMIT_SECRET` | 是 | HMAC 金鑰，至少 32 bytes 隨機值，例如 `openssl rand -hex 32`；缺少時函式回 `503` |
| `ALLOWED_ORIGINS` | 否 | 逗號分隔，預設 `https://zooroy.github.io`；本機開發另加 `http://localhost:5188` |
| `RATE_LIMIT_IP_HEADER` | 否 | 經驗證的可信來源 header 名稱；未設定則使用共用 bucket |
| `RATE_LIMIT_PER_MINUTE` | 否 | 每來源每分鐘提交上限，預設 10 |
| `RATE_LIMIT_SHARED_PER_MINUTE` | 否 | 共用 bucket 每分鐘上限，預設 30 |

本機 `supabase functions serve` 使用的 `supabase/.env.local` 已被 Git 忽略。

## 本機測試

資料庫測試不需要 Docker 或 Supabase CLI：測試會用 PostgreSQL 16 的 `initdb` 在暫存目錄建立**拋棄式叢集**（只開 unix socket），建立與 Supabase 相同的 `anon`／`authenticated`／`service_role` 角色與預設授權，再依序套用 `migrations/`，測完即刪除。它不會連線或修改任何既有資料庫。

```sh
brew install postgresql@16   # 或其他安裝方式；只需要執行檔，不必啟動服務
pnpm install
pnpm test:db                 # 若找不到執行檔：PG_BIN=/path/to/postgresql/bin pnpm test:db
```

測試涵蓋資料表約束、排名與門檻、冪等重試、訪客權限，以及以多條連線實際搶鎖的並發情境（以 `pg_stat_activity` 確認後到者確實在等待鎖）。`tests/db/edge.test.ts` 把 Edge handler 直接接上這個資料庫，驗證 HTTP 契約、跨 instance／並發節流與 24 小時清理。不依賴資料庫的 handler 單元測試（CORS、驗證邊界、錯誤映射、欄位白名單）在 `tests/edge.test.ts`，隨 `pnpm test` 執行。

本機沒有 Deno，`index.ts`（Deno 入口與 PostgREST 呼叫）在本機只經型別檢查；已部署到 Supabase 測試專案並以匿名 HTTP 驗證，結果見 [docs/verification.md](../docs/verification.md)。

使用 Supabase CLI 的完整本機環境（需要 Docker）：

```sh
supabase start
supabase db reset            # 只對本機資料庫：重建並套用 migrations
supabase functions serve leaderboard --env-file supabase/.env.local
```

**不要**對正式專案執行 `db reset` 或清空資料表來做驗證；正式環境只用 `supabase db push` 套用新 migration。
