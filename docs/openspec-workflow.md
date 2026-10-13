# OpenSpec 開發流程

專案的 [OpenSpec 設定](../openspec/config.yaml) 採用 `spec-driven` schema。開發前需安裝 OpenSpec CLI（`pnpm install` 不會安裝），可執行 `openspec --version` 確認。

```text
propose：需求 → proposal / specs / design / tasks
    ↓ 審閱提案，明確要求開始實作
apply：依 tasks 實作 → 測試 → 更新任務進度
    ↓ 確認完成狀態與規格差異
archive：同步正式 specs → 封存 change
```

技能指令輸入在 AI 助手的對話框，不是 shell 指令：Codex 使用 `$openspec-...`（`.agents/skills/`），Claude Code 使用 `/openspec-...`（`.claude/skills/`）。也可以直接說「openspec propose …」。以下以 Claude Code 為例。

## 1. Propose：先定義要做什麼

```text
/openspec-propose 新增難度選擇，change 名稱使用 add-difficulty-selection。
提供簡單、普通、困難三種難度，說明生成速度與炸彈比例，維持現有計分規則。
```

助手會讀取既有規格，建立 `openspec/changes/add-difficulty-selection/`：

| 文件 | 內容 |
| --- | --- |
| `proposal.md` | 變更動機、範圍、受影響能力與影響 |
| `specs/<capability>/spec.md` | 此次新增、修改或移除的需求與驗收情境（delta specs） |
| `design.md` | 技術方案、模組調整、取捨與風險 |
| `tasks.md` | 可追蹤的實作及驗證任務 |

此階段只產生規劃文件。先審閱需求與驗收條件，確認後再另行要求 `apply`；若設計需要調整，先修正規劃文件，使提案、規格、設計與任務保持一致。

## 2. Apply：依規格實作並驗證

```text
/openspec-apply-change add-difficulty-selection
```

助手依 `tasks.md` 實作並更新完成勾選。開發時應保留攝影機、追蹤、純遊戲規則與場景的模組界線，並依變更範圍驗證：

```sh
pnpm check
pnpm test
pnpm build
pnpm test:e2e
```

若變更涉及手勢、攝影機或效能，還需依 [驗收紀錄](verification.md) 進行真人實機驗證。模擬測試不能代替真實雙手操作、跨裝置相容性或散熱測試。實作中若發現需求或設計需要改變，先更新變更文件，再繼續實作。

```sh
openspec list
openspec status --change add-difficulty-selection
openspec validate add-difficulty-selection --strict
```

OpenSpec 驗證只檢查規格與變更文件，不代表遊戲功能測試已通過。

## 3. Archive：同步規格並封存

```text
/openspec-archive-change add-difficulty-selection
```

助手會檢查任務完成狀態及 delta specs 與正式規格的差異，依確認結果完成同步與封存：

- `openspec/specs/` 保存同步後的正式功能規格。
- `openspec/changes/archive/YYYY-MM-DD-add-difficulty-selection/` 保存此次提案、設計、delta specs 與任務紀錄。
- 若仍有未完成任務，應先完成或明確記錄接受現況的原因；封存不代表未執行的測試已通過。

Archive 不會自動執行 Git commit、push 或部署。

既有流程範例：[add-gesture-fruit-ninja](../openspec/changes/archive/2026-10-10-add-gesture-fruit-ninja/proposal.md)，可搭配其 [設計](../openspec/changes/archive/2026-10-10-add-gesture-fruit-ninja/design.md) 與 [任務](../openspec/changes/archive/2026-10-10-add-gesture-fruit-ninja/tasks.md) 閱讀。
