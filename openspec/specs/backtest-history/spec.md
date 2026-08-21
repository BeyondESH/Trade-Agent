# backtest-history Specification

## Purpose
Persist completed backtest runs to a bounded JSON store and expose list/detail/delete endpoints so results can be reviewed later.
## Requirements
### Requirement: 回测历史自动落盘

系统 SHALL 在每次 `/backtest` job 完成后将结果自动持久化为一条历史记录,记录 SHALL 包含序列引用(category/symbol/timeframe)、参数(factors/params/model)、指标标量、逐笔交易列表、降采样曲线序列、绩效摘要 `stats` 与模型评估 `model_metrics`(如存在),以及创建时间戳与唯一 id。

#### Scenario: job 完成即落盘

- **WHEN** `/backtest` 提交的任务状态变为 done
- **THEN** 系统 SHALL 写入一条历史记录并可通过列表/详情端点查询

#### Scenario: 上限与淘汰

- **WHEN** 历史记录数超过上限(20 条)
- **THEN** 系统 SHALL 淘汰最旧的一条,并 SHALL 保持最新记录可查询

#### Scenario: 落盘失败不阻断

- **WHEN** 历史写入抛错(如文件不可写)
- **THEN** job 结果 SHALL 仍正常返回,失败仅记录日志

#### Scenario: stats 与 model_metrics 落盘

- **WHEN** 回测结果含 stats 或 model_metrics
- **THEN** 持久化记录 SHALL 包含这些字段;缺失时该字段 SHALL 省略或为空

#### Scenario: 旧记录兼容

- **WHEN** 读取 schema 旧于当前版本的历史记录(缺失 stats/model_metrics)
- **THEN** 详情响应 SHALL 正常返回,字段缺失由客户端占位处理

### Requirement: 历史查询与删除端点

系统 SHALL 提供 `GET /backtest/history`(列表)、`GET /backtest/history/{id}`(详情)、`DELETE /backtest/history/{id}`(删除)三个端点。列表 SHALL 仅返回轻量元数据(不含 trade_list、曲线、stats 与 model_metrics),详情 SHALL 返回完整记录(含 stats/model_metrics);查询不存在的 id SHALL 返回 404。

#### Scenario: 列表返回元数据

- **WHEN** 客户端请求 GET /backtest/history
- **THEN** 返回 SHALL 为按创建时间倒序的元数据数组,且不含 trade_list/series/stats/model_metrics 字段

#### Scenario: 详情返回完整记录

- **WHEN** 客户端请求 GET /backtest/history/{id} 且 id 存在
- **THEN** 返回 SHALL 含该记录的 trade_list、降采样 series 与 stats/model_metrics(如存在)

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

### Requirement: 新字段历史持久化

回测历史记录 SHALL 在存在时持久化 `feature_weights`、`roc_curve` 与 `series.benchmark` 新字段;字段缺失(旧记录)时 SHALL 保持兼容,详情返回 SHALL 省略缺失字段,前端按现有降级规则处理。

#### Scenario: 新记录持久化新字段

- **WHEN** 一次回测结果含 feature_weights/roc_curve/benchmark 且被保存为历史记录
- **THEN** 历史详情 SHALL 返回这些字段,列表元数据 SHALL 不含曲线级字段

#### Scenario: 旧记录兼容

- **WHEN** 历史记录为旧 schema(无新字段)
- **THEN** 详情返回 SHALL 不包含新字段,前端诊断视图 SHALL 显示空态而非报错

