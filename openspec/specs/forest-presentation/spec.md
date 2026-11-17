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
系統 SHALL 為水果提供兩半分離、果肉、短暫果汁粒子與切割音效，為連切提供數量及加分提示，為炸彈提供獨特的扣分回饋；一般水果的得分只反映在分數上，不另外顯示飄字。兩道刀光須可區分，並提供靜音控制。

#### Scenario: Fruit hit while muted
- **WHEN** 玩家開啟靜音並切中水果
- **THEN** 顯示切半與粒子、分數增加，不播放音效，也不出現 +10 飄字

#### Scenario: Combo and bomb feedback
- **WHEN** 玩家完成 3 連切，之後切到炸彈
- **THEN** 先出現連切數量與加分提示，再出現扣分提示

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

### Requirement: Startup failure messaging
系統 SHALL 在無法啟動必要的渲染或追蹤功能時顯示明確錯誤與可行的處理方式，不得呈現可開始遊戲的假狀態。

#### Scenario: WebGL unavailable
- **WHEN** 瀏覽器無法建立 3D 渲染環境
- **THEN** 顯示需要支援 WebGL 的說明，啟動攝影機按鈕不可使用

### Requirement: Unsupported device notice
系統 SHALL 將以觸控為主要輸入且無滑鼠懸停的裝置（手機、平板）視為不支援遊玩，在首頁以一句簡短說明請改用電腦遊玩，取代開始遊戲的入口；不得提供任何開始試切、倒數或遊戲的途徑。以滑鼠或觸控板為主要輸入的裝置，即使具備觸控螢幕或視窗很小，仍 SHALL 可正常遊玩。

#### Scenario: Phone or tablet opens the game
- **WHEN** 玩家以手機或平板開啟首頁
- **THEN** 顯示請改用電腦遊玩的說明，沒有啟動攝影機按鈕，也無法進入試切或遊戲

#### Scenario: Touchscreen laptop
- **WHEN** 玩家以具觸控螢幕、但主要以觸控板或滑鼠操作的筆電開啟首頁
- **THEN** 照常顯示啟動攝影機按鈕並可完成遊戲

### Requirement: Focused interface
系統 SHALL 只顯示當下步驟必要的資訊與控制項，不疊加暗角、標語、頁尾或裝飾標籤。首頁 SHALL 只有遊戲名稱、標題、一行規則、啟動與排行榜入口及一行隱私說明。遊玩中 SHALL 只顯示分數、剩餘時間、暫停與靜音控制及攝影機預覽；追蹤提示文字只在未偵測到手時出現。最高連切 SHALL 只在結算顯示。

#### Scenario: Home screen
- **WHEN** 可遊玩裝置開啟首頁
- **THEN** 規則只出現一次，畫面沒有頁尾、標語或英文裝飾標籤

#### Scenario: Playing HUD
- **WHEN** 遊戲進行中且有手被偵測到
- **THEN** 只顯示分數、剩餘時間、暫停、靜音與攝影機預覽，不顯示最高連切或追蹤提示文字

#### Scenario: Hand not detected
- **WHEN** 試切或遊戲中沒有偵測到手
- **THEN** 攝影機預覽旁顯示一行請把手放進畫面的提示

### Requirement: Consistent controls
系統 SHALL 讓相同層級的控制項在所有畫面呈現一致的外觀與互動狀態：主要動作、次要動作、文字動作與圖示按鈕各自一致，只以預先定義的顏色與尺寸變化區分。所有按鈕 SHALL 具備可見的鍵盤焦點樣式，停用狀態 SHALL 可辨識；圖示按鈕 SHALL 有可讀的無障礙名稱。

#### Scenario: Primary actions across screens
- **WHEN** 玩家依序看到首頁啟動、結算重玩與排行榜送出
- **THEN** 三者使用相同的主要動作外觀，只在尺寸上不同

#### Scenario: Keyboard focus
- **WHEN** 玩家以 Tab 移動到任一按鈕
- **THEN** 按鈕顯示一致的焦點外框
