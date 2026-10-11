# Tasks

## 1. 裝置判斷

- [x] 1.1 新增 `src/device.ts`：以注入的 `matchMedia` 判斷 `(pointer: coarse) and (hover: none)`，並提供 change 訂閱；Vitest 覆蓋手機／平板（coarse + none）判定為不支援，觸控筆電（fine + hover）、一般桌面與只有 `any-pointer: coarse` 的裝置判定為支援，以及 change 事件會回報新結果。

## 2. 首頁說明卡與流程阻擋

- [x] 2.1 首頁在不支援的裝置以森林風格說明卡取代「啟動攝影機」，隱藏攝影機隱私提示，「歷史排行 TOP 10」保留在說明卡下方；只在首頁狀態套用 change 結果，遊戲中與結算不受影響。以 `pnpm check` 與 2.3 的 E2E 驗證。
- [x] 2.2 `setup()` 在不支援的裝置直接返回，涵蓋首頁、結算重玩與開發 `__test.setup()`；Playwright 驗證呼叫這些入口都不會觸發 `getUserMedia`、不請求 `hand_landmarker.task`、模式維持在首頁。
- [x] 2.3 新增 E2E：以 `hasTouch` + `isMobile` 的手機直向、手機橫向與平板 context，確認 media query 實際命中（不命中則改用 CDP 觸控模擬或注入假 `matchMedia`，並記錄採用方式）、顯示說明卡、沒有啟動攝影機按鈕、無水平溢出，首頁排行可開啟並以 Escape 關閉、焦點回到排行按鈕；另以具觸控但主要指標為 fine 的 context 確認仍可開始遊戲。截圖存為 `docs/unsupported-phone.png`、`docs/unsupported-tablet.png` 並檢視。

## 3. 桌面窄／矮視窗驗收

- [x] 3.1 將 `tests/e2e/game.spec.ts` 與 `tests/e2e/leaderboard.spec.ts` 中 390×844、844×390 的「手機」測試改名為桌面窄視窗、矮視窗，截圖改為 `docs/narrow-window*.png`、`docs/short-window*.png` 並刪除舊的 `docs/mobile*.png`、`docs/leaderboard-mobile-*.png` 等檔名；確認窄視窗可開始遊戲、結算榜單局部捲動、重玩可操作、無水平溢出，`pnpm test:e2e` 通過。

## 4. 文件

- [x] 4.1 更新 README：開頭與遊玩方式改為支援桌機與筆電、手機與平板會看到說明卡但可瀏覽排行榜；移除手機 HTTPS 前鏡頭與「手機建議橫放」說明；模組表的 `style.css` 改為桌面及窄／矮視窗版面、新增 `src/device.ts`；功能規格摘要同步。逐項以 `grep -n 手機 README.md` 確認剩餘提及皆為「不支援」語意。
- [x] 4.2 更新 `docs/verification.md`：真人實機矩陣移除 iPhone 列並註明手機與平板已不支援，新增本變更的自動化與觸控模擬結果，未在實機確認的項目明確列出。

## 5. 整合驗收與發布

- [x] 5.1 執行 `pnpm check`、`pnpm test`、`pnpm build`、`pnpm test:e2e` 與 `openspec validate drop-mobile-support --strict`，全部通過。
- [x] 5.2 正式建置以 `vite preview` 在 `/ai_fruit_ninja/` 檢查：桌面 Chrome 可載入模型到試切，觸控模擬顯示說明卡且沒有攝影機或模型請求，排行榜可讀取，無 page error。
- [ ] 5.3 推送至 `main` 並確認 GitHub Pages 部署成功；以正式網址重做 5.2 的桌面與觸控模擬檢查，請使用者以手機確認看到說明卡並可瀏覽排行榜，結果記錄於 `docs/verification.md`。

## Workflow follow-up

- 封存並同步規格後，直接編輯 `openspec/specs/forest-presentation/spec.md` 與 `openspec/specs/gesture-input/spec.md` 的 Purpose，將「固定擺放的手機」改為桌機與筆電。
- Git commit 訊息依專案提交技能確認。
