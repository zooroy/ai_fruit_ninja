# gesture-input Specification

## Purpose

讓玩家透過桌機或筆電的攝影機，以單手或左右食指操作刀光，並在授權失敗、手部遮擋與重新追蹤時維持可理解且不誤切的互動體驗。

## Requirements

### Requirement: Camera setup and recovery
系統 SHALL 在玩家主動開始後要求攝影機權限，使用面向玩家的鏡頭，提供鏡像預覽、放置引導及試切；資源尚未就緒時不得開始計時。不支援遊玩的裝置 MUST NOT 要求攝影機權限或載入手勢模型。

#### Scenario: Successful setup
- **WHEN** 玩家授權且模型與影像均已就緒
- **THEN** 顯示取景提示，允許單手完成試切後開始倒數

#### Scenario: Setup failure
- **WHEN** 權限遭拒、找不到攝影機、來源不安全或模型載入失敗
- **THEN** 顯示對應原因與重試方式，且不開始遊戲

#### Scenario: Unsupported device
- **WHEN** 玩家以手機或平板開啟遊戲
- **THEN** 不呼叫攝影機授權、不載入手勢模型，也沒有可啟動攝影機的控制項

### Requirement: Independent index blades
系統 SHALL 支援最多兩隻手各自控制刀光，伸出食指時啟用、收起時停用；不得要求同時出現兩隻手才可遊玩。

#### Scenario: Two simultaneous blades
- **WHEN** 左右食指同時伸出並移動
- **THEN** 兩條可區分的刀光各自跟隨對應指尖並可命中不同水果

#### Scenario: Single hand or retraction
- **WHEN** 只有一隻手可見，或另一隻手收起食指
- **THEN** 可見且啟用的刀光正常運作，停用刀光不產生命中

### Requirement: Consistent mapping and tracking gaps
系統 SHALL 讓刀光符合鏡像预覽方向與遊戲區座標，並在失去追蹤、身分配對不確定、收刀或版面改變時斷開軌跡，不得跨中斷連線計算切割。

#### Scenario: Occlusion and reacquisition
- **WHEN** 雙手交叉遮擋後在新位置重新出現
- **THEN** 不確定的軌跡先中斷，再從新位置開始，不產生橫跨畫面的誤切

#### Scenario: Mirroring and resize
- **WHEN** 玩家向鏡像預覽右方移動指尖或裝置旋轉
- **THEN** 刀光方向與畫面一致，旋轉後不沿用舊座標連線

### Requirement: Camera privacy and lifecycle
系統 SHALL 在裝置端處理攝影機影像，不上傳或儲存影像；離開遊戲或結算時停止攝影機，重玩時重新取得所需串流。

#### Scenario: Session ends
- **WHEN** 玩家離開或到達結算畫面
- **THEN** 停止攝影機串流與追蹤，重玩需在資源再次就緒後開始
