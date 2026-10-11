## Purpose

定義可重複遊玩的三十秒水果切割挑戰，讓玩家透過切水果及連切累積分數，遇到炸彈時扣分但繼續遊玩，並以一致的時間邊界、唯一命中與結算規則維持公平回饋。

## ADDED Requirements

### Requirement: Thirty second session
系統 SHALL 在準備完成後顯示 3、2、1 倒數，再開始恰為 30 秒的遊戲時間；到期停止生成、命中與加扣分，顯示最終分數、水果數、炸彈數及最大連切數，並提供重玩。

#### Scenario: Timer boundary
- **WHEN** 遊戲時間達 30 秒
- **THEN** 先結束遊戲，不接受時間等於或晚於終點的命中；尚未結算的連切以終點前事件結算一次

#### Scenario: Replay
- **WHEN** 玩家選擇重玩且攝影機再次就緒
- **THEN** 清除上一局物件、分數及連切狀態，重新倒數

### Requirement: Fruit and bomb outcomes
系統 SHALL 依初始預設每顆水果加 10 分、每顆炸彈扣 50 分並中斷雙手尚未完成的連切；炸彈不結束遊戲，漏接不扣分，分數最低為零。

#### Scenario: Bomb does not end round
- **WHEN** 剩餘 12 秒、分數 30 時切到炸彈
- **THEN** 分數降至 0、待結算連切取消，遊戲繼續且不重設時間

#### Scenario: Missed fruit
- **WHEN** 水果未被切中而離開遊戲區
- **THEN** 移除水果且不扣分或縮短遊戲

### Requirement: Unique swept hits
系統 SHALL 依有效刀光移動路徑判斷命中，每個水果或炸彈只能被處理一次；同一時刻有水果與炸彈命中時，先處理水果基本分，再處理炸彈扣分及連切取消。

#### Scenario: Two blades share a target
- **WHEN** 左右刀光同時掃過同一顆水果
- **THEN** 只加 10 分且只增加一顆水果計數，水果只歸屬其中一條刀光的連切

#### Scenario: Fast swipe
- **WHEN** 兩次有效指尖採樣的連線穿過水果而兩端都在水果外
- **THEN** 水果仍被切中一次

### Requirement: Per blade combo
系統 SHALL 分別累積左右刀光的連切：首顆命中起 300 毫秒內的不同水果為一組，不延長窗口；滿 3 顆時額外加上 5 乘以該組水果數的分數。窗口結束、收刀、追蹤中斷或遊戲到期時結算；炸彈取消待結算組且不追回既得加分。

#### Scenario: Three fruit combo
- **WHEN** 同一刀光在窗口內切中 3 顆水果且未中炸彈
- **THEN** 基本分為 30，結算時額外加 15 並顯示 3 連切

#### Scenario: Independent hands
- **WHEN** 左右刀光在各自窗口分別切中 2 顆水果
- **THEN** 總基本分為 40，不合併成 4 連切

### Requirement: Interruption handling
系統 SHALL 在頁面隱藏或攝影機串流中斷時暫停時間及物件，清除未結算連切與刀光；回到可用狀態後由玩家主動繼續。短暫手部離開畫面只停用對應刀光，計時繼續。

#### Scenario: Background and resume
- **WHEN** 剩餘 15 秒時切換應用程式，之後返回並選擇繼續
- **THEN** 從剩餘 15 秒恢復，沒有暫停期間的命中或跳接軌跡
