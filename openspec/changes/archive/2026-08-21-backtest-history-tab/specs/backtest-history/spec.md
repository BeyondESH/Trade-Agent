## ADDED Requirements

### Requirement: 回测历史自动落盘

系统 SHALL 在每次 `/backtest` job 完成后将结果自动持久化为一条历史记录,记录 SHALL 包含序列引用(category/symbol/timeframe)、参数(factors/params)、指标标量、逐笔交易列表与降采样曲线序列,以及创建时间戳与唯一 id。

#### Scenario: job 完成即落盘

- **WHEN** `/backtest` 提交的任务状态变为 done
- **THEN** 系统 SHALL 写入一条历史记录并可通过列表/详情端点查询

#### Scenario: 上限与淘汰

- **WHEN** 历史记录数超过上限(20 条)
- **THEN** 系统 SHALL 淘汰最旧的一条,并 SHALL 保持最新记录可查询

#### Scenario: 落盘失败不阻断

- **WHEN** 历史写入抛错(如文件不可写)
- **THEN** job 结果 SHALL 仍正常返回,失败仅记录日志

### Requirement: 历史查询与删除端点

系统 SHALL 提供 `GET /backtest/history`(列表)、`GET /backtest/history/{id}`(详情)、`DELETE /backtest/history/{id}`(删除)三个端点。列表 SHALL 仅返回轻量元数据(不含 trade_list 与曲线),详情 SHALL 返回完整记录;查询不存在的 id SHALL 返回 404。

#### Scenario: 列表返回元数据

- **WHEN** 客户端请求 GET /backtest/history
- **THEN** 返回 SHALL 为按创建时间倒序的元数据数组,且不含 trade_list/series 字段

#### Scenario: 详情返回完整记录

- **WHEN** 客户端请求 GET /backtest/history/{id} 且 id 存在
- **THEN** 返回 SHALL 含该记录的 trade_list 与降采样 series

#### Scenario: 删除记录

- **WHEN** 客户端请求 DELETE /backtest/history/{id} 且 id 存在
- **THEN** 记录 SHALL 被移除并返回删除确认
- **AND** 再次查询该 id SHALL 返回 404

#### Scenario: 不存在的 id

- **WHEN** 客户端查询或删除不存在的 id
- **THEN** 返回 SHALL 为 404

### Requirement: 曲线降采样存储

系统 SHALL 在持久化时对曲线序列均匀降采样至每 lane 不超过 500 点,以控制历史文件体积;逐笔交易列表 `trade_list` SHALL 全量保留。

#### Scenario: 长序列降采样

- **WHEN** 某序列 lane 点数超过 500
- **THEN** 持久化的该 lane SHALL 至多 500 点且下标均匀分布

#### Scenario: 短序列不抽稀

- **WHEN** 某序列 lane 点数不超过 500
- **THEN** 持久化的该 lane SHALL 保持原样
