## ADDED Requirements

### Requirement: 技术指标计算

系统 SHALL 从 OHLCV 数据本地计算 MACD、KDJ、布林带、VEGAS 通道与斐波那契回撤位,不依赖交易所指标接口或 TA-Lib/pandas-ta 原生库。计算 MUST 为确定性的,且只使用截至当前 bar 的数据(无前视偏差)。

#### Scenario: 计算 MACD/KDJ/BOLL

- **WHEN** 传入足够长度的 OHLCV 帧
- **THEN** 系统 SHALL 返回附带 MACD(dif/dea/hist)、KDJ(k/d/j)、BOLL(mid/upper/lower)列的结果

#### Scenario: VEGAS 与斐波那契

- **WHEN** 传入 OHLCV 帧
- **THEN** 系统 SHALL 输出 VEGAS 通道(EMA144/169 等)与基于最近 swing 的斐波那契回撤位(0/0.236/0.382/0.5/0.618/0.786/1)

#### Scenario: 数据不足

- **WHEN** 数据长度不足以计算某指标
- **THEN** 系统 SHALL 返回该指标为空/NaN 而非抛错
