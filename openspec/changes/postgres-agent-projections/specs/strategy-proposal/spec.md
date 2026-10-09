## MODIFIED Requirements

### Requirement: 提案持久化与投影

系统 SHALL 将每个合法提案持久化到 PostgreSQL `proposals` 表（`record` 列为完整 `model_dump`，并索引 `proposal_id`/`produced_at`/`kind`），支持按时间与标的检索；持久化 MUST 记录 `provenance`（模型、prompt 版本、研究 `thread_id`）。

#### Scenario: 可检索

- **WHEN** 按标的查询历史提案
- **THEN** SHALL 返回该标的的提案列表（含时间与出处）
