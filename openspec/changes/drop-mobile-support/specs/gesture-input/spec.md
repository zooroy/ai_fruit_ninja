# Spec Delta

## MODIFIED Requirements

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
