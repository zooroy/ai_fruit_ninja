# 森之刃 · Forest Slice

以左右食指操作的 30 秒水果切割遊戲，結合 low-poly 森林場景、雙手刀光及連切加分。使用 Vite、TypeScript、Three.js 與 MediaPipe，攝影機影像只在裝置端處理，不上傳或儲存；無需後端或登入。

本專案使用 **OpenSpec 規格驅動開發**：先 `propose` 定義需求、規格與設計，再 `apply` 實作與驗證，最後 `archive` 同步正式規格並保留開發紀錄。

## 本機啟動

先準備 Node.js（符合專案 Vite 7 的需求：20.19+ 或 22.12+）與 pnpm，再執行：

```sh
pnpm install
pnpm assets
pnpm dev
```

筆電開啟 <http://localhost:5188>。`pnpm assets` 下載並校驗手部模型、複製 MediaPipe WASM，並產生追蹤 Worker；首次執行需要網路。模型與 WASM 在遊戲執行時由本站同源提供。

手機前鏡頭必須使用受信任的 HTTPS 來源，直接開啟區網 HTTP IP 無法使用攝影機。可將 `pnpm build` 產生的 `dist/` 放到 HTTPS 靜態伺服器，或設定受信任的本地 TLS 代理。

| 指令 | 用途 |
| --- | --- |
| `pnpm dev` | 啟動開發伺服器，連接埠為 5188 |
| `pnpm assets` | 準備模型、WASM 與追蹤 Worker |
| `pnpm check` | TypeScript 型別檢查 |
| `pnpm test` | 執行 Vitest 單元測試 |
| `pnpm build` | 重建 Worker、檢查型別並輸出 `dist/` |
| `pnpm test:e2e` | 執行 Playwright 測試，需要本機安裝 Google Chrome |

修改 `src/tracking/worker.ts` 或其依賴後，開發期間可重新執行 `pnpm assets` 更新 Worker。正式建置會自動重建 Worker，但首次建置前仍需準備模型與 WASM。

## GitHub Pages 發布

部署成功後，公開遊戲網址為 <https://zooroy.github.io/ai_fruit_ninja/>，玩家不需登入 GitHub，允許攝影機權限即可遊玩。

首次發布需在儲存庫 **Settings → Pages → Build and deployment → Source** 選擇 **GitHub Actions**。GitHub Free 帳號需使用公開儲存庫。

[部署工作流程](.github/workflows/deploy.yml) 在推送至 `main` 時自動安裝鎖定依賴、準備模型與 WASM、執行單元測試、建置，再發布 `dist/`。也可以在 Actions 頁面選擇 **Deploy to GitHub Pages → Run workflow** 手動發布；建置或測試失敗不會部署新版本。

`vite.config.ts` 將正式建置的資源路徑設為 `/ai_fruit_ninja/`，本機開發仍使用 `/`。若更改儲存庫名稱或改用自訂網域，需同步調整 `base`。可在建置後預覽正式路徑：

```sh
pnpm exec vite preview --host 127.0.0.1
# 開啟 http://127.0.0.1:4173/ai_fruit_ninja/
```

## 遊玩方式

1. 固定擺放手機或筆電，保持手與臉前方有光。手機建議橫放，直向也能遊玩。
2. 點「啟動攝影機」，授權後在鏡像預覽中確認手部入鏡。
3. 伸出任一食指，完成中央水果試切後開始挑戰。
4. 伸直食指出刀，收起食指收刀；左右手各自控制一道刀光，另一隻手可隨時加入。
5. 倒數 3、2、1 後開始 30 秒挑戰，結束後查看成績或重玩。

切換應用程式會暫停，回來後需主動繼續；手暫時離開畫面不會停表。設定可靜音或降低畫質，低畫質不改變遊戲規則。

## 使用 OpenSpec 開發

專案的 [OpenSpec 設定](openspec/config.yaml) 採用 `spec-driven` schema。開發前需安裝可使用的 OpenSpec CLI，並在支援本專案技能的 AI 助手中開啟專案。可在終端機執行 `openspec --version` 確認 CLI；`pnpm install` 不會安裝 OpenSpec。

```text
propose：需求 → proposal / specs / design / tasks
    ↓ 審閱提案，明確要求開始實作
apply：依 tasks 實作 → 測試 → 更新任務進度
    ↓ 確認完成狀態與規格差異
archive：同步正式 specs → 封存 change
```

下列 `$openspec-...` 範例是輸入 **Codex 對話框** 的技能指令，不是 shell 指令。也可以直接對助手說「openspec propose …」、「openspec apply …」或「openspec archive …」。

### 1. Propose：先定義要做什麼

例如要新增難度選擇，在 Codex 輸入：

```text
$openspec-propose 新增難度選擇，change 名稱使用 add-difficulty-selection。
提供簡單、普通、困難三種難度，說明生成速度與炸彈比例，維持現有計分規則。
```

助手會讀取既有規格，建立 `openspec/changes/add-difficulty-selection/`，依預設 schema 產生：

| 文件 | 內容 |
| --- | --- |
| `proposal.md` | 變更動機、範圍、受影響能力與影響 |
| `specs/<capability>/spec.md` | 此次新增、修改或移除的需求與驗收情境（delta specs） |
| `design.md` | 技術方案、模組調整、取捨與風險 |
| `tasks.md` | 可追蹤的實作及驗證任務 |

此階段只產生規劃文件。先審閱需求與驗收條件，確認後再另行要求 `apply`；若設計需要調整，先修正規劃文件，使提案、規格、設計與任務保持一致。

### 2. Apply：依規格實作並驗證

在 Codex 輸入：

```text
$openspec-apply-change add-difficulty-selection
```

助手會讀取變更文件，依 `tasks.md` 實作並更新完成勾選。開發時應保留攝影機、追蹤、純遊戲規則與場景的模組界線，並依變更範圍驗證：

```sh
pnpm check
pnpm test
pnpm build
pnpm test:e2e
```

若變更涉及手勢、攝影機或手機效能，還需依 [驗收紀錄](docs/verification.md) 進行真人實機驗證。模擬測試不能代替真實雙手操作、跨裝置相容性或散熱測試。實作中若發現需求或設計需要改變，先更新變更文件，再繼續實作。

可在終端機查看進度與檢查規格格式：

```sh
openspec list
openspec status --change add-difficulty-selection
openspec validate add-difficulty-selection --strict
```

OpenSpec 驗證用來檢查規格與變更文件，不代表遊戲功能測試已通過。

### 3. Archive：同步規格並封存

完成實作與驗證後，在 Codex 輸入：

```text
$openspec-archive-change add-difficulty-selection
```

助手會檢查規劃文件、任務完成狀態及 delta specs 與正式規格的差異，呈現需要同步的內容，依確認結果完成同步與封存：

- `openspec/specs/` 保存同步後的正式功能規格。
- `openspec/changes/archive/YYYY-MM-DD-add-difficulty-selection/` 保存此次提案、設計、delta specs 與任務紀錄。
- 若仍有未完成任務，應先完成或明確記錄接受現況的原因；封存不代表未執行的測試已通過。

Archive 是規格與變更紀錄的結案，不會自動執行 Git commit、push 或部署。下一次功能變更再建立新的 proposal。

既有流程範例：[add-gesture-fruit-ninja](openspec/changes/archive/2026-10-10-add-gesture-fruit-ninja/proposal.md)，可搭配其 [設計](openspec/changes/archive/2026-10-10-add-gesture-fruit-ninja/design.md) 與 [任務](openspec/changes/archive/2026-10-10-add-gesture-fruit-ninja/tasks.md) 閱讀。

## 技術架構

應用程式為純前端靜態網站，以一般 DOM 呈現 HUD 與控制介面，Three.js 繪製 3D 場景。`src/main.ts` 負責串接介面、攝影機、追蹤、遊戲狀態與渲染迴圈。

```mermaid
flowchart TD
    Camera["camera：攝影機串流"] --> Tracker["tracking：MediaPipe 手部辨識"]
    Tracker --> Gestures["gestures：雙手配對、食指啟停、座標映射"]
    Gestures --> Game["game：刀光碰撞、時間、計分、連切"]
    Game --> Scene["scene：Three.js 場景與切割效果"]
    Game --> Sound["ui/sound：Web Audio 音效"]
    Game --> HUD["main：DOM HUD 與結果介面"]
```

| 模組／檔案 | 責任 |
| --- | --- |
| `src/main.ts` | 應用流程、DOM 介面、生命週期與各模組整合 |
| `src/camera/camera.ts` | 取得及停止串流、前鏡頭偏好與錯誤處理 |
| `src/tracking/model.ts` | 載入同源模型與 WASM，設定最多追蹤兩隻手 |
| `src/tracking/tracker.ts`、`worker.ts` | 排程推論、傳送影格、逾時處理及 Worker 初始化失敗時的主執行緒回退 |
| `src/tracking/gestures.ts` | 雙手身分配對、食指啟停、平滑、鏡像映射與中斷軌跡 |
| `src/game/engine.ts` | 獨立於攝影機與 WebGL 的時間、生成、碰撞、計分及連切規則 |
| `src/scene/forest.ts` | 森林背景、水果、炸彈、雙刀光、切半與粒子效果 |
| `src/ui/sound.ts` | 合成音效與靜音控制 |
| `src/style.css` | 桌面及手機橫直向版面 |

推論與渲染分開排程，同一時間最多一個推論在途；Worker 路徑限制最短間隔 40 ms，主執行緒回退為 80 ms，實際頻率仍取決於裝置效能。畫面以 3D 呈現，命中則使用共同的 2D 遊戲平面，以相鄰有效刀光點的線段判斷碰撞，避免快速揮動漏判。

應用流程為首頁 → 資源載入 → 試切 → 倒數 → 遊玩 → 結算。頁面隱藏或串流中斷時暫停，恢復後由玩家繼續；結算或離開時釋放攝影機與追蹤資源，重玩時重新取得。

## 功能規格

以下為正式規格摘要；完整需求與驗收情境以連結的 `spec.md` 為準。

### 手勢輸入（gesture-input）

完整規格：[gesture-input/spec.md](openspec/specs/gesture-input/spec.md)。

- 玩家主動啟動後才要求攝影機權限，提供鏡像預覽、放置引導及試切；模型與影像未就緒時不得開始計時。
- 支援單手或最多兩隻手，食指伸出啟用刀光、收起停用，左右刀光可同時命中不同目標。
- 刀光方向與鏡像預覽一致；追蹤遺失、身分配對不確定、收刀或版面改變時斷開軌跡，避免跨中斷誤切。
- 權限拒絕、找不到攝影機、不安全來源或模型載入失敗時顯示原因及重試方式。
- 影像不儲存、不上傳；結算或離開停止串流，重玩須重新等待資源就緒。

### 遊戲規則（arcade-session）

完整規格：[arcade-session/spec.md](openspec/specs/arcade-session/spec.md)。

| 項目 | 規則 |
| --- | --- |
| 時間 | 3 秒倒數後進行 30 秒挑戰；到期先結束，不接受終點或之後的命中 |
| 水果 | 每顆 +10 分，漏接無懲罰 |
| 炸彈 | 每顆 −50 分，最低 0 分；取消雙手尚未結算連切，遊戲繼續 |
| 連切 | 每道刀光從首顆命中起固定 300 ms 窗口，不延長、不合併雙手 |
| 連切獎勵 | 同一窗口至少 3 顆，額外 +5 × 顆數；3 顆總共 45 分 |
| 連切結算 | 窗口結束、收刀、追蹤中斷或遊戲到期時結算；炸彈或系統暫停取消尚未結算組 |
| 唯一命中 | 同一目標只處理一次，兩道刀光命中同一水果不重複計分 |
| 同時命中 | 同一時刻先處理水果基本分，再處理炸彈扣分與連切取消 |
| 暫停 | 頁面隱藏或串流中斷時凍結時間與物件、清除刀光和待結算連切；手出框不暫停 |
| 結果 | 顯示最終分數、水果數、炸彈數及最大連切，重玩清除上一局狀態 |

### 場景與呈現（forest-presentation）

完整規格：[forest-presentation/spec.md](openspec/specs/forest-presentation/spec.md)。

- low-poly 樹木、小屋、草地、暖光與立體水果，中央操作區保持清楚，炸彈以輪廓及標記區別。
- 水果命中後顯示兩半分離、果肉、果汁粒子及音效；連切與炸彈有各自的加扣分回饋。
- 左右刀光可辨識，提供靜音控制。
- 支援筆電及手機橫直向，HUD 與控制項需可讀可操作，生成及判定範圍隨畫面調整。
- 低畫質降低背景、陰影與粒子成本，保留雙刀、目標及相同規則；必要功能無法啟動時顯示錯誤。

## 目錄結構

```text
src/
├── main.ts                 # 應用入口與介面整合
├── camera/                 # 攝影機生命週期
├── tracking/               # 模型、Worker 與手勢輸入
├── game/                   # 純遊戲規則
├── scene/                  # Three.js 場景
├── ui/                     # 音效
└── style.css               # 響應式樣式
public/                     # 同源模型、WASM 與產生的 Worker
scripts/                    # 資源準備、Worker 建置等工具
tests/                     # Vitest 單元測試與 e2e/ 瀏覽器測試
openspec/
├── config.yaml             # spec-driven 設定
├── specs/                  # 正式功能規格
└── changes/                # 開發中的變更
    └── archive/            # 已完成變更的歷史紀錄
docs/                       # 驗收紀錄與介面截圖
```

## 驗證狀態

測試涵蓋遊戲規則、手勢合成輸入、攝影機生命週期、音效及瀏覽器流程。E2E 使用假攝影機與開發限定測試注入，正式建置不暴露測試 hooks。

歷史測試結果、使用者試玩回饋與尚待真人驗證的項目見 [docs/verification.md](docs/verification.md)。手機跨裝置矩陣、連續三局效能與端到端延遲尚未有完整量測，不將瀏覽器模擬或任務勾選視為實機全部通過。

## 資源與授權

所有樹木、小屋、水果及效果幾何為本專案程式生成，沒有複製參考圖片；音效由 Web Audio 合成。

- Three.js：MIT。
- MediaPipe Tasks Vision / WASM：Apache-2.0，套件內附 LICENSE。
- Hand Landmarker 模型取自 Google 官方版本 1 公開模型 URL，來源及 SHA-256 記錄於 `public/models/manifest.json`，詳見 [官方模型說明](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker)。

執行 `pnpm assets` 會準備鎖定套件版本的 WASM 與模型，遊戲執行時不向外部伺服器傳送影像。
