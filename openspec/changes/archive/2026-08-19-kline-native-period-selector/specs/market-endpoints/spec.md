## MODIFIED Requirements

### Requirement: 行情与分析端点

系统 SHALL 提供读取 K 线、技术分析(指标末值 + Top-N 支撑/压力)、市场结构(趋势线/箱体/订单块)与 S/R 候选的端点,数据来自本地存储。K 线端点 SHALL 接受时间级别原生全集中的任一级别作为参数。端点 SHALL 将月级与分钟级视为不同级别,MUST NOT 因大小写归一化而将二者混淆。

#### Scenario: 读取 K 线

- **WHEN** 请求某品类/币种/级别(可带时间段)的 candles
- **THEN** 系统 SHALL 返回该区间的 OHLCV 数据

#### Scenario: 分析端点

- **WHEN** 请求某 series 的 analyze
- **THEN** 系统 SHALL 返回指标末值与 Top-N S/R 候选

#### Scenario: 数据不足

- **WHEN** 该 series 数据不足以分析
- **THEN** 系统 SHALL 返回明确的提示而非 500

#### Scenario: 接受原生全集级别

- **WHEN** 以时间级别原生全集中的任一级别请求 candles
- **THEN** 系统 SHALL 正常受理该请求
- **AND** MUST NOT 因级别未登记而返回未支持错误

#### Scenario: 月级与分钟级不混淆

- **WHEN** 分别以月级与分钟级请求同一品种的 candles
- **THEN** 系统 SHALL 分别返回月级序列与分钟级序列
- **AND** 两者返回的 series 标识 MUST 不同

#### Scenario: 拒绝非原生级别

- **WHEN** 以交易所未原生支持的级别请求 candles
- **THEN** 系统 SHALL 返回明确的未支持提示
- **AND** MUST NOT 静默返回其他级别的数据

### Requirement: 实时缓存 K 线端点

系统 SHALL 提供读取实时流缓存 K 线的端点 `GET /candles/recent`，返回与 `/candles` 相同的数据形状。对仅实时级别,该端点 MUST NOT 尝试通过交易所历史接口补种数据。

#### Scenario: 读取实时缓存 K 线

- **WHEN** 请求某 series 的 `candles/recent`
- **THEN** 系统 SHALL 返回该 series 最近 N 根 OHLCV（无数据返回空列表）

#### Scenario: 仅实时级别不补种历史

- **WHEN** 请求仅实时级别的 `candles/recent` 且实时缓存为空
- **THEN** 系统 SHALL 返回空列表
- **AND** MUST NOT 调用交易所历史接口补种
- **AND** SHALL 建立该 series 的实时订阅
