# Spec Delta

## ADDED Requirements

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

## MODIFIED Requirements

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

## REMOVED Requirements

### Requirement: Contextual forest dialogue
**Reason**: 角色化對白與新紀錄、空榜等多種邀請增加閱讀負擔，但不提供額外資訊。
**Migration**: 由「Precise result status」取代；預估名次規則與「未提交不得稱為上榜」保留。

### Requirement: Forest themed accessible presentation
**Reason**: 木牌、葉片與前三名徽章屬裝飾，干擾閱讀。
**Migration**: 由「Accessible leaderboard presentation」取代，保留鍵盤、焦點、捲動與長名字等無障礙與版面要求，並移除已不適用的直向手機情境。
