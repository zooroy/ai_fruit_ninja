# forest-presentation Specification

## Purpose

以低多邊形森林童話場景呈現刺激的水果切割遊戲，延續參考圖片的微縮小屋、草地與暖光質感，同時讓玩家在桌機與筆電上清楚辨識水果、炸彈、刀光與遊戲狀態；手機與平板僅提供改用電腦的說明。

## Requirements

### Requirement: Forest art direction and readability
系統 SHALL 呈現 low-poly 樹木、小屋、草地、暖色光線與立體水果，中央操作區不得被背景遮擋；炸彈須以輪廓及標記與水果區別，水果不得套用妨礙辨識的景深模糊。

#### Scenario: Active game view
- **WHEN** 水果與炸彈一起出現
- **THEN** 玩家可從形狀及標記區分兩者，背景不遮擋目標或 HUD

### Requirement: Slice and score feedback
系統 SHALL 為水果提供兩半分離、果肉、短暫果汁粒子與切割音效，為連切提供數量及加分提示，為炸彈提供獨特的扣分回饋；兩道刀光須可區分，並提供靜音控制。

#### Scenario: Fruit hit while muted
- **WHEN** 玩家開啟靜音並切中水果
- **THEN** 顯示切半、粒子與分數回饋且不播放音效

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

### Requirement: Quality fallback
系統 SHALL 提供較低畫質以降低背景、陰影與粒子成本，而不移除水果、炸彈、雙刀或改變計分規則；無法啟動必要渲染或追蹤功能時提供明確錯誤，不呈現可開始的假狀態。

#### Scenario: Low quality mode
- **WHEN** 玩家使用低畫質
- **THEN** 背景效果簡化但兩道刀光、目標、分數與時間仍正常呈現

### Requirement: Unsupported device notice
系統 SHALL 將以觸控為主要輸入且無滑鼠懸停的裝置（手機、平板）視為不支援遊玩，在首頁以森林風格說明請改用電腦遊玩，取代開始遊戲的入口；不得提供任何開始試切、倒數或遊戲的途徑。以滑鼠或觸控板為主要輸入的裝置，即使具備觸控螢幕或視窗很小，仍 SHALL 可正常遊玩。

#### Scenario: Phone or tablet opens the game
- **WHEN** 玩家以手機或平板開啟首頁
- **THEN** 顯示請改用電腦遊玩的說明，沒有啟動攝影機按鈕，也無法進入試切或遊戲

#### Scenario: Touchscreen laptop
- **WHEN** 玩家以具觸控螢幕、但主要以觸控板或滑鼠操作的筆電開啟首頁
- **THEN** 照常顯示啟動攝影機按鈕並可完成遊戲
