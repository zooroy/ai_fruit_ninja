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
系統 SHALL 在首頁「啟動攝影機」按鈕下方提供「歷史排行 TOP 10」按鈕；開啟與關閉排行榜不得要求攝影機權限、啟動倒數或重設遊戲設定。

#### Scenario: Browse without camera
- **WHEN** 玩家從首頁開啟排行榜後關閉
- **THEN** 顯示排行榜並返回原首頁，不呼叫攝影機授權，靜音及畫質設定不變

### Requirement: Result comparison and qualification
系統 SHALL 在結算分數區顯示歷史榜單與本局比較。榜單未滿十筆時本局具資格；滿十筆時本局分數 MUST 嚴格大於第十名才具資格。僅已成功取得榜單且本局具資格、尚未提交時顯示名字欄與送出。未達標時 SHALL 顯示追平差距與超越所需分數，後者依現有五分最小計分單位計算。

#### Scenario: Tie at cutoff
- **WHEN** 第十名為 100 分且本局也是 100 分
- **THEN** 不顯示留名欄，提示已追平第十名、再得 5 分即可超越

#### Scenario: Below cutoff
- **WHEN** 第十名為 100 分而本局為 80 分
- **THEN** 顯示相差 20 分、超越還需 25 分，不顯示送出控制項

#### Scenario: Incomplete board
- **WHEN** 榜單有九筆或更少，且本局為 0 分
- **THEN** 本局仍有資格留名，顯示預估名次但不宣稱已儲存

### Requirement: Contextual forest dialogue
系統 SHALL 根據空榜或未滿榜、新最高分、其他合資格成績、未達標、成功、資格失效及服務失敗顯示相應繁體中文森林風格對白。預估名次 SHALL 將既有同分紀錄排在本局之前；未提交不得稱為正式上榜。新最高分指非空榜中嚴格高於第一名。

#### Scenario: New record invitation
- **WHEN** 本局超過非空榜最高分且尚未送出
- **THEN** 邀請留下大名挑戰新紀錄，提供送出，但不顯示已保存訊息

#### Scenario: Qualified ordinary result
- **WHEN** 本局預估為第四名
- **THEN** 對白指出有機會登上第 4 名，並邀請留名

#### Scenario: No new highest score
- **WHEN** 本局追平第一名且仍符合前十名資格
- **THEN** 使用一般入榜或未滿榜邀請，不宣稱打破最高分

### Requirement: Optional public display name
系統 SHALL 只在玩家主動送出時提交本局結果，將名字去除頭尾空白後，空值預設為「不知名的勇者」。名字最多二十個 Unicode code points，超長或包含控制字元時顯示錯誤而不寫入。名字 SHALL 以純文字顯示，並在表單說明會公開出現在排行榜；不得要求帳號或真實姓名。

#### Scenario: Default name
- **WHEN** 合資格玩家未填名字或只填空白後送出
- **THEN** 成功紀錄的名字為「不知名的勇者」

#### Scenario: Unsafe markup and long name
- **WHEN** 玩家送出含 HTML 標記的合法長度名字，或超過二十字的名字
- **THEN** 前者只顯示文字而不執行標記，後者被拒絕且保留可修正內容

#### Scenario: Skip submission
- **WHEN** 玩家未按送出即選擇重玩或返回首頁
- **THEN** 不新增排行榜成績，既有遊戲操作正常完成

### Requirement: Atomic admission and durable submission
系統 SHALL 在伺服器以當下已接受紀錄重新判斷前十名資格，並以不可被並發插入打斷的順序完成檢查及寫入。被拒絕的成績不得新增。接受時保存名字、分數、水果數、炸彈數、最高連切、局提交識別及伺服器時間；已接受但日後跌出前十的紀錄保留，公開榜單只回傳前十名。

#### Scenario: Qualification lost while typing
- **WHEN** 玩家留名期間第十名提升至本局同分或更高
- **THEN** 送出遭拒且無新增紀錄，更新榜單、隱藏留名欄，提示紀錄被超越及最新差距

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

### Requirement: Forest themed accessible presentation
系統 SHALL 沿用森林暖色、木牌與葉片視覺呈現排行榜，以名次數字及前三名徽章輔助辨識。首頁排行視窗 SHALL 支援鍵盤開關、焦點留在視窗內及關閉後回到入口；結算榜單與留名區 SHALL 支援手機橫直向捲動且不遮住重玩，姓名輸入有標籤、狀態有可讀提示，長名字不得撐破版面。

#### Scenario: Mobile and keyboard browsing
- **WHEN** 玩家在直向手機查看十筆長名字，或使用鍵盤開啟並以 Escape 關閉首頁排行
- **THEN** 無水平溢出且可操作所有控制項，關閉後焦點返回歷史排行按鈕
