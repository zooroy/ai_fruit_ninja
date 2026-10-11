# Spec Delta

## ADDED Requirements

### Requirement: Unsupported device notice
系統 SHALL 將以觸控為主要輸入且無滑鼠懸停的裝置（手機、平板）視為不支援遊玩，在首頁以森林風格說明請改用電腦遊玩，取代開始遊戲的入口；不得提供任何開始試切、倒數或遊戲的途徑。以滑鼠或觸控板為主要輸入的裝置，即使具備觸控螢幕或視窗很小，仍 SHALL 可正常遊玩。

#### Scenario: Phone or tablet opens the game
- **WHEN** 玩家以手機或平板開啟首頁
- **THEN** 顯示請改用電腦遊玩的說明，沒有啟動攝影機按鈕，也無法進入試切或遊戲

#### Scenario: Touchscreen laptop
- **WHEN** 玩家以具觸控螢幕、但主要以觸控板或滑鼠操作的筆電開啟首頁
- **THEN** 照常顯示啟動攝影機按鈕並可完成遊戲

## MODIFIED Requirements

### Requirement: Responsive playfield
系統 SHALL 在桌機與筆電畫面（包含縮小的窄視窗與矮視窗）保持計時、分數、控制項可讀可操作，不產生水平溢出。水果生成與判定範圍須隨可用區域調整。

#### Scenario: Portrait phone
- **WHEN** 玩家以直向手機開啟首頁
- **THEN** 只顯示請改用電腦遊玩的說明與歷史排行入口，版面無水平溢出，且無法開始遊戲

#### Scenario: Narrow desktop window
- **WHEN** 玩家在約 390 px 寬的桌面瀏覽器視窗完成設定
- **THEN** 可以開始遊戲，目標不會只出現在可視區外，控制項可讀可操作且無水平溢出

#### Scenario: Short desktop window
- **WHEN** 玩家在約 390 px 高的桌面瀏覽器視窗開啟首頁與結算畫面
- **THEN** 主要按鈕與結果仍可透過可見區域或面板捲動操作，無水平溢出
