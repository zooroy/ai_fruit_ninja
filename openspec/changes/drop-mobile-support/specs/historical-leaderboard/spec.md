# Spec Delta

## MODIFIED Requirements

### Requirement: Welcome leaderboard access
系統 SHALL 在首頁主要入口（可遊玩裝置為「啟動攝影機」按鈕，不支援的裝置為請改用電腦的說明）下方提供「歷史排行 TOP 10」按鈕；開啟與關閉排行榜不得要求攝影機權限、啟動倒數或重設遊戲設定。不支援遊玩的裝置 SHALL 仍可唯讀瀏覽排行榜。

#### Scenario: Browse without camera
- **WHEN** 玩家從首頁開啟排行榜後關閉
- **THEN** 顯示排行榜並返回原首頁，不呼叫攝影機授權，靜音及畫質設定不變

#### Scenario: Browse on an unsupported device
- **WHEN** 玩家以手機或平板開啟首頁並點選歷史排行
- **THEN** 顯示與桌面相同的前十名資料，沒有留名或開始遊戲的控制項

### Requirement: Forest themed accessible presentation
系統 SHALL 沿用森林暖色、木牌與葉片視覺呈現排行榜，以名次數字及前三名徽章輔助辨識。首頁排行視窗 SHALL 支援鍵盤開關、焦點留在視窗內及關閉後回到入口；結算榜單與留名區 SHALL 在桌面窄視窗與矮視窗可捲動且不遮住重玩，姓名輸入有標籤、狀態有可讀提示，長名字不得撐破版面。

#### Scenario: Mobile and keyboard browsing
- **WHEN** 玩家在直向手機開啟首頁排行查看十筆長名字，或使用鍵盤開啟並以 Escape 關閉首頁排行
- **THEN** 無水平溢出且可操作所有控制項，關閉後焦點返回歷史排行按鈕

#### Scenario: Narrow window results
- **WHEN** 玩家在約 390 px 寬的桌面視窗完成一局，結算區顯示十筆長名字與留名欄
- **THEN** 無水平溢出，榜單局部捲動，重玩按鈕可捲動到並操作
