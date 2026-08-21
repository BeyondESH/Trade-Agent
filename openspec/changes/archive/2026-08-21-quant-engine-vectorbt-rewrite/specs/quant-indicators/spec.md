# quant-indicators Specification

## Purpose
将技术指标计算迁移至 vectorbt `Indicator` 体系,替代自实现 `indicators.py`,保留无前视与确定性要求。

## ADDED Requirements

### Requirement: vectorbt 指标计算

系统 SHALL 使用 vectorbt Indicator 体系计算 MACD、KDJ、布林带、VEGAS、RSI、ATR、成交量比与动量指标,替代自实现 `indicators.py` 中的对应函数。

#### Scenario: 指标输出对齐

- **WHEN** 对同一 OHLCV 帧调用迁移后的指标
- **THEN** 返回的指标列(如 MACD dif/dea/hist、KDJ k/d/j、BOLL mid/upper/lower)SHALL 与旧实现列名一致
- **AND** 底层计算 SHALL 由 vectorbt Indicator 完成

#### Scenario: 数据不足

- **WHEN** 数据长度不足以计算某指标
- **THEN** 系统 SHALL 返回 NaN 而非抛错

### Requirement: 因子目录适配

系统 SHALL 保持 `factors.py` 预设因子目录与白名单表达式 DSL 的对外行为,底层指标函数适配到 vectorbt 输出。

#### Scenario: 预设因子结构不变

- **WHEN** 使用默认 7 因子配置调用特征构造
- **THEN** 特征列名与顺序 SHALL 与迁移前一致,数值按 vectorbt 标准口径(指标数学以 vectorbt 为准)

#### Scenario: 表达式因子

- **WHEN** 求值白名单表达式(如 `log(close / sma(close, 20))`)
- **THEN** 结果 SHALL 与迁移前一致

### Requirement: 指标无前视与确定性

迁移后的指标 SHALL 仅使用截至当前 bar 的数据,且对相同输入产出相同结果。

#### Scenario: 无前视

- **WHEN** 校验某指标在第 t 行的值
- **THEN** 其 SHALL 仅依赖 t 及之前的数据

#### Scenario: 确定性

- **WHEN** 以相同输入计算两次
- **THEN** 两次结果 SHALL 完全一致
