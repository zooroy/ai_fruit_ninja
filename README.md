# 森之刃 · Forest Slice

以左右食指操作的 30 秒水果切割遊戲。Vite、TypeScript、Three.js、MediaPipe，影像只在本機處理。

## 開發

```sh
pnpm install
pnpm assets
pnpm dev
```

筆電開啟 http://localhost:5188 。手機前鏡頭必須使用受信任的 HTTPS 來源；直接開區網 HTTP IP 不可使用攝影機。可將 `pnpm build` 的 dist 交給 HTTPS 靜態伺服器，或自行設定受信任的本地 TLS 代理。此專案不會自動發布。

```sh
pnpm check
pnpm test
pnpm build
pnpm test:e2e # 使用本機安裝的 Google Chrome
```

## 操作

固定擺放手機或筆電，保持手與臉前方有光。手機建議橫放，直放也可玩。點「啟動攝影機」，在鏡像預覽中確認手部入鏡，伸出任一食指試切中央水果。左右食指各有刀光；收起食指即可收刀。另一隻手可隨時加入。切換應用程式會暫停，回來按繼續；手暫時出框不會停表。

水果 +10；炸彈 −50（最低 0）且取消雙手尚未完成的連切，遊戲繼續。每道刀光首顆水果起固定 300ms 內滿 3 顆，額外加 5×顆數（3 顆共 45 分）。兩手不合併。同一物件只計一次。漏接無懲罰。30 秒到期結算，攝影機關閉。設定可靜音或降低畫質，低畫質不改規則。

## 模組

`camera` 串流與錯誤；`tracking` 模型、手勢與映射；`game` 可獨立測試的規則；`scene` 幾何場景與效果；`ui` 聲音與介面。測試頁使用開發限定注入，不屬於正式遊戲輸入。

## 資源與授權

所有樹木、小屋、水果及效果幾何為本專案程式生成，沒有複製參考圖片。音效由 Web Audio 合成。
Three.js：MIT；MediaPipe Tasks Vision / WASM：Apache-2.0，套件內附 LICENSE。Hand Landmarker 模型取自 Google 官方版本 1 公開模型 URL，來源及 SHA-256 記錄於 public/models/manifest.json；模型說明 https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker 。執行 `pnpm assets` 複製鎖定套件的 WASM，模型、WASM 與應用程式同源提供；執行時不向外部伺服器傳送影像。

實機驗證狀態見 docs/verification.md；瀏覽器模擬不能取代真實雙手及手機散熱測試。
