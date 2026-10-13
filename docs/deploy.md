# 部署與維運

## GitHub Pages

公開網址：<https://zooroy.github.io/ai_fruit_ninja/>，玩家不需登入，以桌機或筆電允許攝影機權限即可遊玩。

首次發布需在儲存庫 **Settings → Pages → Build and deployment → Source** 選擇 **GitHub Actions**。GitHub Free 帳號需使用公開儲存庫。

[部署工作流程](../.github/workflows/deploy.yml) 在推送至 `main` 時自動安裝鎖定依賴、準備模型與 WASM、執行單元測試、建置，再發布 `dist/`。也可以在 Actions 頁面選擇 **Deploy to GitHub Pages → Run workflow** 手動發布；建置或測試失敗不會部署新版本。

`vite.config.ts` 將正式建置的資源路徑設為 `/ai_fruit_ninja/`，本機開發仍使用 `/`。若更改儲存庫名稱或改用自訂網域，需同步調整 `base`。可在建置後預覽正式路徑：

```sh
pnpm exec vite preview --host 127.0.0.1
# 開啟 http://127.0.0.1:4173/ai_fruit_ninja/
```

攝影機只能在受信任的安全來源（HTTPS 或 `localhost`）使用；從其他電腦以區網 HTTP IP 開啟時無法使用攝影機，需將 `dist/` 放到 HTTPS 靜態伺服器，或設定受信任的本地 TLS 代理。

## 歷史排行榜

資料模型、權限、HTTP 契約、節流與函式秘密見 [supabase/README.md](../supabase/README.md)。

### 規則

| 規則 | 說明 |
| --- | --- |
| 排序 | 分數高者在前；同分時較早被伺服器接受者在前，沒有並列名次 |
| 入榜資格 | 未滿十筆時任何分數（含 0 分）都可留名；滿十筆後必須**嚴格大於**第十名 |
| 差距 | 未達標時顯示追平所需分數，以及超越所需分數（多 5 分，即最小計分單位） |
| 留名 | 只有合資格且主動按「送出」才會保存；名字最多 20 字，留白為「不知名的勇者」，會公開顯示 |
| 每局獨立 | 不登入、不合併同名紀錄；同一局重試只會保存一筆 |
| 資格確認 | 送出時伺服器以最新榜單重新判斷，留名期間被超越會顯示「又有高手刷新紀錄了」 |

排行榜不是防作弊系統：伺服器只做格式、合理範圍與頻率檢查，無法證明分數來自真實遊玩。名字以純文字顯示；不當名字需由專案擁有者在 Supabase 後台刪除。

### 本機設定

```sh
cp .env.example .env.local      # 填入 VITE_LEADERBOARD_URL；留空則排行榜顯示「森林英雄榜還沒開張」
pnpm test:db                    # 資料庫與 API 整合測試，不需要 Docker
```

`.env.local` 與 `supabase/.env*` 已被 Git 忽略。

### 部署順序

需要 [Supabase CLI](https://supabase.com/docs/guides/cli) 與專案擁有者權限；在本機終端機登入，不要把任何金鑰貼進文件、issue 或對話。

1. 在 Supabase 建立專案並連結：`supabase login`、`supabase link --project-ref <project-ref>`。
2. （建議）在 Dashboard 啟用 `pg_cron`，讓 migration 自動排程清除 24 小時前的節流紀錄。
3. 套用資料庫：`supabase db push`。
4. 設定函式秘密：
   ```sh
   supabase secrets set RATE_LIMIT_SECRET=$(openssl rand -hex 32)
   supabase secrets set ALLOWED_ORIGINS=https://zooroy.github.io
   supabase secrets set RATE_LIMIT_IP_HEADER=cf-connecting-ip
   ```
   `ALLOWED_ORIGINS` 只填來源（協定＋網域），不含 `/ai_fruit_ninja/` 路徑；測試專案可加上 `,http://localhost:5188` 供本機開發。`RATE_LIMIT_IP_HEADER` 的選擇依據見 [節流說明](../supabase/README.md#節流)；不要改用 `x-forwarded-for`。
5. 部署函式：`supabase functions deploy leaderboard --use-api`（`supabase/config.toml` 已設定 `verify_jwt = false`；`--use-api` 由 Supabase 雲端打包，本機不需要 Docker）。
6. 以匿名 HTTP 驗證（應回 `200` 與 `{"entries":[...]}`）：
   ```sh
   curl -i -H 'Origin: https://zooroy.github.io' https://<project-ref>.supabase.co/functions/v1/leaderboard
   ```
7. 在 GitHub **Settings → Secrets and variables → Actions → Variables** 新增 repository variable `VITE_LEADERBOARD_URL` = `https://<project-ref>.supabase.co/functions/v1/leaderboard`。這是公開網址，放 Variables 而不是 Secrets；服務金鑰永遠不進 GitHub。
8. 推送到 `main` 或手動執行部署工作流程，建置時會注入上述網址。

### 免費方案暫停與恢復

Supabase 免費專案閒置一段時間會被暫停。暫停期間排行榜顯示「森林信使暫時迷路了」，遊戲、重玩與回首頁不受影響。到 Supabase Dashboard 選擇 **Restore project** 即可恢復，資料會保留；也請定期在 **Usage** 頁確認資料庫容量與函式呼叫量。

### 停用與回退

- 暫時停用：刪除 GitHub variable `VITE_LEADERBOARD_URL` 後重新部署，排行榜顯示「森林英雄榜還沒開張」；或回退到先前的前端版本。
- 停止 API：`supabase functions delete leaderboard`，前端會顯示讀取失敗而不影響遊戲。
- 資料表與既有成績保留，不提供破壞性 down migration；正式資料不可用 `supabase db reset` 清除。
