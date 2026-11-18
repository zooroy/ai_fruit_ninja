# quality-gates Specification

## Purpose

定義程式碼進入 main 與部署上線前必須通過的自動化品質閘門，以及檢查結果、驗收證據與安全掃描的保存方式，讓每次發布都有可追溯的驗證。

## Requirements

### Requirement: 品質閘門檢查項目
品質閘門 SHALL 執行型別檢查、靜態 lint、單元測試、瀏覽器端對端測試與正式相依套件稽核；各項可平行執行，任一項失敗，閘門即判定失敗。

#### Scenario: 全部通過
- **WHEN** 型別檢查、lint、單元測試、端對端測試與相依套件稽核都成功
- **THEN** 閘門判定通過

#### Scenario: lint 違規
- **WHEN** 原始碼有 lint 錯誤等級的違規
- **THEN** 閘門判定失敗，並在執行紀錄中指出違規的檔案與行號

#### Scenario: 端對端測試失敗
- **WHEN** 任一端對端測試失敗
- **THEN** 閘門判定失敗

### Requirement: Pull request 必須經過品質閘門
對 main 開啟或更新 pull request 時，系統 SHALL 自動執行品質閘門，並在 pull request 上回報結果。

#### Scenario: 開啟 pull request
- **WHEN** 有人對 main 開啟 pull request 或推送新的 commit 到該 pull request
- **THEN** 品質閘門自動執行，結果顯示在 pull request 的檢查狀態中

### Requirement: 部署前必須通過品質閘門
推送到 main 時，系統 SHALL 對同一個 commit 執行品質閘門，只有閘門通過後才建置並部署到 GitHub Pages。

#### Scenario: 閘門通過後部署
- **WHEN** 推送到 main 的 commit 通過品質閘門
- **THEN** 系統建置並部署該 commit

#### Scenario: 閘門失敗不部署
- **WHEN** 推送到 main 的 commit 未通過品質閘門
- **THEN** 系統不部署，線上網站維持上一個成功版本

### Requirement: 保存驗收證據
每次執行端對端測試後，無論成功或失敗，系統 SHALL 把測試截圖、HTML 測試報告與失敗時的 trace 保存為該次執行的下載檔案，至少保留 30 天。

#### Scenario: 測試成功
- **WHEN** 端對端測試全部通過
- **THEN** 該次執行可下載截圖與 HTML 報告

#### Scenario: 測試失敗
- **WHEN** 有端對端測試失敗
- **THEN** 該次執行仍可下載截圖、HTML 報告與失敗測試的 trace

### Requirement: 相依套件漏洞稽核
品質閘門 SHALL 稽核正式相依套件（不含開發相依），只要有 high 或 critical 等級的已知漏洞就判定失敗；較低等級只列在紀錄中，不阻擋。

#### Scenario: 發現高風險漏洞
- **WHEN** 正式相依套件有 high 或 critical 等級的已知漏洞
- **THEN** 閘門判定失敗，紀錄中列出套件與漏洞等級

#### Scenario: 只有低風險漏洞
- **WHEN** 正式相依套件只有 moderate 以下的漏洞
- **THEN** 稽核不阻擋閘門

### Requirement: 程式碼安全掃描
系統 SHALL 對 JavaScript 與 TypeScript 原始碼執行靜態安全掃描，觸發時機為對 main 的 pull request、推送到 main，以及每週一次的排程；結果 SHALL 發布在 repository 的程式碼掃描警示中。

#### Scenario: pull request 掃描
- **WHEN** 有人對 main 開啟或更新 pull request
- **THEN** 系統執行安全掃描，新發現的警示顯示在 pull request 上

#### Scenario: 每週排程
- **WHEN** 每週排程時間到達，即使期間沒有新的 commit
- **THEN** 系統以最新的掃描規則掃描 main，並更新程式碼掃描警示
