# chart-history-lazy-load Specification

## Purpose
TBD - created by syncing change fix-kline-history-lazy-load.
## Requirements
### Requirement: 后向加载方向正确性

`BitgetDatafeed.getHistoryKLineData` SHALL 区分初始加载与后向加载（拖动查看更早历史），后向加载请求返回的数据 SHALL 全部早于或等于请求区间终点，绝不把最新行情数据当作历史区间返回。

#### Scenario: 初始加载与后向加载可区分

- **WHEN** 某 series 首次调用 `getHistoryKLineData`
- **THEN** 系统 SHALL 将其识别为初始加载
- **AND** 本地库为空时 SHALL 允许以最新数据（`/candles/recent`）打底

#### Scenario: 后向加载不得返回更新数据

- **WHEN** 后向加载请求区间为 `[from, to]`（`to` 早于当前已知最新 bar）
- **THEN** 返回的所有 K 线 `open_time` SHALL 满足 `open_time <= to`
- **AND** 即使本地库在该区间无数据，SHALL NOT 返回 `open_time > to` 的最新数据

### Requirement: 空区间后向请求按需回灌

当后向加载请求区间与本地库**零交集**（`fetchStored` 返回空）且未到交易所最早时，系统 SHALL 触发一次按需历史回灌，完成后重读区间返回更早数据，而不是跳过回灌直接返回兜底数据。

#### Scenario: 零交集触发回灌

- **WHEN** 后向加载请求区间与本地库无交集
- **AND** 该 series 未标记"已到最早"
- **THEN** datafeed SHALL 触发一次回灌（复用 in-flight 请求去重）
- **AND** 回灌完成后重读 `[from, to]` 区间
- **AND** 重读有数据 SHALL 返回该数据并更新已知最早 bar

#### Scenario: 回灌并发去重

- **WHEN** 同一 series 的相同 `before` 回灌已在执行中
- **THEN** 新的请求 SHALL 复用该 in-flight 请求，不重复发起

### Requirement: 回灌失败或已到最早时干净终止

当后向加载且按需回灌失败（异常、频控）或已到交易所最早时，`getHistoryKLineData` SHALL 返回空列表，使 klinecharts 关闭后续加载（`applyMoreData([], false)`），图表干净停在边界，不进入无限加载、不产生重复 K 线。

#### Scenario: 回灌失败返回空

- **WHEN** 后向加载触发回灌但回灌异常失败
- **THEN** `getHistoryKLineData` SHALL 返回空列表
- **AND** 系统 SHALL NOT 以最新数据兜底（不返回 `open_time > to` 的 bar）
- **AND** 后续重新加载（symbol/周期切换或图表重挂载，重置加载开关）可再次尝试回灌

#### Scenario: 已到最早返回空

- **WHEN** 后向加载且该 series 已标记"已到最早"（交易所无更早历史）
- **THEN** `getHistoryKLineData` SHALL 返回空列表
- **AND** 返回空列表使加载关闭，不重复拉取已存数据

### Requirement: 拼接数据不重叠已渲染 bar

后向加载返回给 `applyMoreData` 的数据 SHALL 与图表已渲染的 bar 按时间戳不重叠，保证拼接后相邻 bar 时间戳严格递增、无重复。

#### Scenario: 重叠数据被裁剪

- **WHEN** 后向加载返回数据中包含与已渲染 bar 相同的时间戳
- **THEN** datafeed SHALL 裁剪/剔除这些重叠 bar
- **AND** 返回数据仅含 `open_time` 早于已渲染最早 bar 的部分

#### Scenario: 拼接后时间戳严格递增

- **WHEN** `applyMoreData` 拼接完成
- **THEN** 图表中相邻 bar 时间戳 SHALL 严格递增且无重复时间戳
