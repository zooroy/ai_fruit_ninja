# historical-leaderboard Specification

## Purpose

提供跨裝置共享的森林水果遊戲歷史前十名，讓玩家在首頁瀏覽紀錄、於結算比較差距，並在符合資格時匿名留名保存本局成績；透過一致排序、提交檢查與失敗恢復，維持可理解且不影響基本遊玩的互動。

## Requirements

### Requirement: Public historical top ten
系統 SHALL 提供免登入的歷史前十名，依分數遞減、伺服器接受順序遞增排序；最多顯示十筆的名次、名字與分數。同一名字的不同局不得合併，所有訪客 SHALL 讀取相同持久化資料，未有紀錄時顯示空榜狀態。

#### Scenario: Stable tied entries
- **WHEN** 兩局同為 150 分且名字相同
- **THEN** 兩筆各自佔一個名次，較早被伺服器接受的排在前面

#### Scenario: Empty and shared board
- **WHEN** 訪客開啟尚未有紀錄的排行榜，之後另一裝置成功提交一局並重新載入榜單
- **THEN** 最初顯示空榜提示，重新載入後看見已提交紀錄而非僅本機資料

### Requirement: Welcome leaderboard access
系統 SHALL 在首頁主要入口（可遊玩裝置為「啟動攝影機」按鈕，不支援的裝置為請改用電腦的說明）下方提供「排行榜」按鈕；開啟與關閉排行榜不得要求攝影機權限、啟動倒數或重設遊戲設定。不支援遊玩的裝置 SHALL 仍可唯讀瀏覽排行榜。

#### Scenario: Browse without camera
- **WHEN** 玩家從首頁開啟排行榜後關閉
- **THEN** 顯示排行榜並返回原首頁，不呼叫攝影機授權，靜音設定不變

#### Scenario: Browse on an unsupported device
- **WHEN** 玩家以手機或平板開啟首頁並點選排行榜
- **THEN** 顯示與桌面相同的前十名資料，沒有留名或開始遊戲的控制項

### Requirement: Result comparison and qualification
系統 SHALL 在結算分數區顯示歷史榜單與本局比較。榜單未滿十筆時本局具資格；滿十筆時本局分數 MUST 嚴格大於第十名才具資格。僅已成功取得榜單且本局具資格、尚未提交時顯示名字欄與送出。未達標時 SHALL 只顯示入榜門檻（需超過第十名的分數），同分與低於第十名使用相同提示。

#### Scenario: Tie at cutoff
- **WHEN** 第十名為 100 分且本局也是 100 分
- **THEN** 不顯示留名欄，提示需超過 100 分

#### Scenario: Below cutoff
- **WHEN** 第十名為 100 分而本局為 80 分
- **THEN** 提示需超過 100 分，不顯示送出控制項

#### Scenario: Incomplete board
- **WHEN** 榜單有九筆或更少，且本局為 0 分
- **THEN** 本局仍有資格留名，顯示預估名次但不宣稱已儲存

### Requirement: Precise result status
系統 SHALL 以簡短、精確的繁體中文提示呈現結算排行狀態，不使用角色化或風格化對白。具資格時 SHALL 顯示預估名次，預估名次將既有同分紀錄排在本局之前；未提交不得稱為已上榜。未達標時 SHALL 顯示入榜門檻。成功、已保存但跌出前十、資格失效、讀取失敗、送出失敗、限流、內容衝突、資料無效及未啟用服務 SHALL 各有一句可區分的說明。

#### Scenario: Qualified result
- **WHEN** 本局預估為第四名且尚未送出
- **THEN** 顯示可排第 4 名並提供留名欄，不顯示已保存

#### Scenario: New highest score
- **WHEN** 本局超過非空榜最高分且尚未送出
- **THEN** 顯示可排第 1 名，與其他合資格成績使用相同格式

#### Scenario: Saved but pushed out
- **WHEN** 送出成功，但回傳榜單已不含本局紀錄
- **THEN** 顯示已保存但未在前十名，不宣稱登上排行榜

### Requirement: Optional public display name
系統 SHALL 只在玩家主動送出時提交本局結果，將名字去除頭尾空白後，空值預設為「不知名的勇者」。名字最多二十個 Unicode code points，超長或包含控制字元時顯示同一則說明這兩項限制的錯誤，且不寫入。名字 SHALL 以純文字顯示，並在表單說明會公開出現在排行榜；不得要求帳號或真實姓名。

#### Scenario: Default name
- **WHEN** 合資格玩家未填名字或只填空白後送出
- **THEN** 成功紀錄的名字為「不知名的勇者」

#### Scenario: Unsafe markup and long name
- **WHEN** 玩家送出含 HTML 標記的合法長度名字，或超過二十字的名字
- **THEN** 前者只顯示文字而不執行標記，後者被拒絕且保留可修正內容

#### Scenario: Invalid name message
- **WHEN** 玩家送出超過二十字的名字，或含控制字元的名字
- **THEN** 兩者顯示相同的錯誤說明，指出最多 20 字且不可含控制字元

#### Scenario: Skip submission
- **WHEN** 玩家未按送出即選擇重玩或返回首頁
- **THEN** 不新增排行榜成績，既有遊戲操作正常完成

### Requirement: Atomic admission and durable submission
系統 SHALL 在伺服器以當下已接受紀錄重新判斷前十名資格，並以不可被並發插入打斷的順序完成檢查及寫入。被拒絕的成績不得新增。接受時保存名字、分數、水果數、炸彈數、最高連切、局提交識別及伺服器時間；已接受但日後跌出前十的紀錄保留，公開榜單只回傳前十名。

#### Scenario: Qualification lost while typing
- **WHEN** 玩家留名期間第十名提升至本局同分或更高
- **THEN** 送出遭拒且無新增紀錄，更新榜單、隱藏留名欄，提示資格已失效及最新入榜門檻

#### Scenario: Concurrent last slot
- **WHEN** 榜單有九筆較高分紀錄，兩個同分低分新成績同時送出
- **THEN** 先被接受者取得第十席，後者重新檢查後遭拒，不會兩者皆以空位為由被接受

### Requirement: Idempotent submission lifecycle
系統 SHALL 為同一局的所有重試沿用相同提交識別，伺服器最多接受一筆；重送成功過的相同資料 SHALL 回傳既有成功結果，不再次插入或重新套用入榜門檻。相同識別搭配不同名字或成績 MUST 拒絕覆寫。提交中禁止連點，成功後不再提供本局送出。

#### Scenario: Response lost after commit
- **WHEN** 資料已寫入但網路中斷，玩家重試相同提交
- **THEN** 回傳原成功紀錄，榜單只有一筆，即使此紀錄已跌出前十也不誤報首次提交失敗

#### Scenario: Replay and stale response
- **WHEN** 玩家離開結算或開始下一局後，上一局請求才返回
- **THEN** 回應不得覆寫新畫面或新局資料；新局使用不同提交識別

### Requirement: Restricted anonymous data access
系統 SHALL 提供公開榜單讀取與受控提交，不允許訪客直接任意新增、修改或刪除資料。服務端 MUST 驗證成績欄位為合理範圍的非負整數、分數符合五分單位、最高連切不超過水果數，並限制短時間大量提交；無效或超限請求不得新增成績。資料庫管理秘密不得出現在前端建置，攝影機影像不得隨成績上傳。

#### Scenario: Forged invalid request
- **WHEN** 訪客繞過介面提交負分、非整數、錯誤統計，或直接要求修改榜單
- **THEN** 服務拒絕且資料不變

#### Scenario: Request throttled
- **WHEN** 同一來源超過提交頻率限制
- **THEN** 回傳可理解的稍後重試訊息，不將失敗顯示為成功

### Requirement: Recoverable leaderboard availability
系統 SHALL 區分載入中、空榜、讀取失敗、提交失敗及未設定服務；未知排行不得當成空榜而開放留名。網路錯誤可重試且保留本局成績；送出結果不明時沿用原識別及送出內容重試。排行榜失效不得阻止重玩、返回首頁或停止攝影機。

#### Scenario: Load failure
- **WHEN** 結算讀榜失敗或服務未設定
- **THEN** 保留成績與重玩控制項，顯示說明；讀榜失敗可重試且不顯示留名欄

#### Scenario: Transient submission failure
- **WHEN** 玩家送出後收到網路錯誤
- **THEN** 不宣稱成功，保留本局與原提交內容，提供重試及離開選項

### Requirement: Accessible leaderboard presentation
系統 SHALL 以簡潔列表呈現排行榜，每列只有名次、名字與分數，不使用木牌、葉片或前三名徽章裝飾；本局成功提交的紀錄 SHALL 以強調色及「你」標示。首頁排行視窗 SHALL 支援鍵盤開關、焦點留在視窗內及關閉後回到入口；結算榜單與留名區 SHALL 在桌面窄視窗與矮視窗可捲動且不遮住重玩，姓名輸入有標籤、狀態有可讀提示，長名字不得撐破版面。

#### Scenario: Keyboard browsing
- **WHEN** 玩家使用鍵盤開啟首頁排行榜並以 Escape 關閉
- **THEN** 焦點在視窗內循環，關閉後返回排行榜按鈕

#### Scenario: Own entry highlighted
- **WHEN** 玩家成功送出並仍在前十名
- **THEN** 該列以強調色與「你」標示，其他列無名次徽章

#### Scenario: Narrow window results
- **WHEN** 玩家在約 390 px 寬的桌面視窗完成一局，結算區顯示十筆長名字與留名欄
- **THEN** 無水平溢出，榜單局部捲動，重玩按鈕可捲動到並操作
