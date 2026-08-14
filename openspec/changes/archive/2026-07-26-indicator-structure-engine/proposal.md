## Why

路线图 #1(`market-data-foundation`)已能拉取并存储 K 线。实测确认**交易所 MCP 不提供 MACD/KDJ 等计算好的指标**,只给原始行情。因此右侧指标与市场结构必须**本地计算**。本 change 实现指标+结构引擎,把已存 K 线转化为结构化的技术态势与**支撑/压力候选位**,供后续 AI Agent(#5)决策使用(对齐 design D4)。

## What Changes

- 新增**技术指标引擎**:MACD、KDJ、布林带(BOLL)、VEGAS 通道、斐波那契回撤——**自研 pandas/numpy 实现**,不引入 TA-Lib/pandas-ta 原生依赖(兼容 Python 3.14)。
- 新增**市场结构引擎**:摆动高低点(swing)、自动趋势线、箱体/盘整区识别。
- 新增 **SMC 分析**:流动性位(前高/前低、等高/等低)、订单块(order block)、结构突破 BOS/CHOCH。
- 新增**支撑/压力聚合**:将指标与结构产出的位聚合、去重、按强度排序,输出统一 S/R 候选列表(结构化,供 LLM 取舍)。
- 全部以**已存 K 线(ParquetStore)或传入 DataFrame** 为输入,纯确定性、可离线测试。

## Capabilities

### New Capabilities
- `technical-indicators`: MACD/KDJ/BOLL/VEGAS/Fibonacci 计算,输出到 OHLCV 帧的附加列或结构化结果。
- `market-structure`: swing 点、趋势线、箱体识别。
- `smc-analysis`: 流动性位、订单块、BOS/CHOCH。
- `support-resistance`: 聚合上述来源的 S/R 候选位,去重并按强度排序。

### Modified Capabilities
<!-- 无 -->

## Impact

- **依赖**:仅用现有 `pandas`/`numpy`(随 pandas 引入),不新增原生库。
- **代码**:`backend/src/market_data/` 下新增 `indicators.py`、`structure.py`、`smc.py`、`levels.py`;CLI 增加 `analyze` 子命令输出某 series 的指标+S/R。
- **对齐路线图**:实现 #2,消费 #1 的存储;不实现风控/交易/LLM(后续 change)。
