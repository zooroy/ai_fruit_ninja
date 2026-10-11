# forest-presentation Specification

## Purpose

以低多邊形森林童話場景呈現刺激的水果切割遊戲，延續參考圖片的微縮小屋、草地與暖光質感，同時讓玩家在筆電與固定擺放的手機上清楚辨識水果、炸彈、刀光與遊戲狀態。

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
系統 SHALL 在筆電及手機橫直向畫面保持計時、分數、控制項可讀可操作；手機提示固定擺放與建議橫放，但不得因直向而禁止遊玩。水果生成與判定範圍須隨可用區域調整。

#### Scenario: Portrait phone
- **WHEN** 玩家在直向手機完成設定
- **THEN** 可以開始遊戲，目標不會只出現在可視區外，介面避開螢幕安全區

### Requirement: Quality fallback
系統 SHALL 提供較低畫質以降低背景、陰影與粒子成本，而不移除水果、炸彈、雙刀或改變計分規則；無法啟動必要渲染或追蹤功能時提供明確錯誤，不呈現可開始的假狀態。

#### Scenario: Low quality mode
- **WHEN** 玩家使用低畫質
- **THEN** 背景效果簡化但兩道刀光、目標、分數與時間仍正常呈現
