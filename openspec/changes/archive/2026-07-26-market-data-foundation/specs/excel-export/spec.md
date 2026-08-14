## ADDED Requirements

### Requirement: K 线导出 Excel

系统 SHALL 支持将 K 线数据导出为 Excel(.xlsx),**按 UTC 自然日每日一个文件**(`<YYYY-MM-DD>.xlsx`)。支持两种模式:按查询一次性导出;拉取过程中实时追加。实时写 MUST 采用批量/节流以避免高频阻塞。

#### Scenario: 按查询导出(按日分文件)

- **WHEN** 用户对某品类/币种/级别/时间段请求导出
- **THEN** 系统 SHALL 为区间内每个 UTC 自然日生成一个 `<YYYY-MM-DD>.xlsx`

#### Scenario: 实时追加导出

- **WHEN** 拉取任务持续产出新 K 线且开启实时导出
- **THEN** 系统 SHALL 批量追加写入 Excel
- **AND** 不因逐条写入造成明显阻塞
