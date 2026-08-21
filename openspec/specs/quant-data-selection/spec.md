# quant-data-selection Specification

## Purpose
TBD - created by archiving change quant-engine-vectorbt-rewrite. Update Purpose after archive.
## Requirements
### Requirement: 任意时间区间选取

系统 SHALL 允许用户在量化模块(DL 工作台)指定起止时间区间,并将窗口贯穿到 `/backtest` 与 `/dl/features` 的数据读取。

#### Scenario: 指定区间回测

- **WHEN** `/backtest` 请求体含可选 `start`/`end`(UTC 毫秒)
- **THEN** 系统 SHALL 仅读取该窗口内的蜡烛参与特征构造与回测
- **AND** 结果 `data_meta` SHALL 反映实际窗口起止

#### Scenario: 因子 IC 同窗口

- **WHEN** `/dl/features` 请求体含可选 `start`/`end`
- **THEN** 因子 IC 分析 SHALL 在相同窗口内计算

#### Scenario: 缺省全量

- **WHEN** 请求未含 `start`/`end`
- **THEN** 行为 SHALL 与现状一致(读取全量序列)

#### Scenario: 区间校验

- **WHEN** `start` 晚于或等于 `end`,或窗口与数据无交集
- **THEN** 系统 SHALL 返回明确错误,不得静默回退

### Requirement: 任意有效时间级别

量化模块的周期选择 SHALL 覆盖全部有效时间级别(1m/3m/5m/15m/30m/1h/2h/4h/6h/12h/1d/3d/1w/1mo,不含实时专用 1s)。

#### Scenario: 周期列表放开

- **WHEN** 用户展开 DL 工作台的周期下拉
- **THEN** 选项 SHALL 包含全部有效级别,且默认选中 1h

#### Scenario: 无效周期拒绝

- **WHEN** 传入不在合法集合内的周期(如 1s)
- **THEN** 后端 SHALL 返回明确错误

### Requirement: 前端区间与周期选择器

DL 工作台 SHALL 提供时间区间选择控件(预设区间或自由起止日期)与完整周期下拉,并将所选窗口传给回测与因子分析。

#### Scenario: 选择并运行

- **WHEN** 用户选择区间与周期后点击运行
- **THEN** 请求 SHALL 携带所选 `start`/`end`/`timeframe`
- **AND** 结果展示 SHALL 标注该窗口的数据可用性

