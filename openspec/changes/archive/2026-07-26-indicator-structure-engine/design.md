## Context

`market-data-foundation` 提供 `ParquetStore`(按 UTC 日分文件的 OHLCV,列 `open_time,open,high,low,close,volume`)。交易所 MCP 无指标能力(已实测)。本 change 在其上做纯本地、确定性的指标与结构计算。AI Agent(#5)以左侧交易、找 S/R 为主策略,需要结构化的指标态势 + S/R 候选,而非 LLM 目测(design D4)。

## Goals / Non-Goals

**Goals:**
- 自研实现 MACD/KDJ/BOLL/VEGAS/Fibonacci,结果确定、可测。
- 识别 swing 点、趋势线、箱体;SMC 流动性/订单块/BOS-CHOCH。
- 聚合出去重、按强度排序的 S/R 候选列表。
- 以 DataFrame/Store 为输入,离线可测(不依赖 MCP)。

**Non-Goals:**
- 不做风控/仓位/交易(#3/#4)、不做 LLM 决策(#5)、不做前端(#9)。
- 不追求学术级 SMC 精度;提供实用、可解释的启发式实现。
- 不引入 TA-Lib/pandas-ta(兼容性 + 可控性)。

## Decisions

### D1:自研 pandas/numpy 指标,不用 TA-Lib/pandas-ta
pandas-ta 在新版 numpy/Python 3.14 下有已知导入问题(`from numpy import NaN`),TA-Lib 需原生编译。MACD/KDJ/BOLL 实现简单,自研更可控、零额外依赖、便于单测对拍。
- **算法**:
  - MACD:EMA(fast=12)−EMA(slow=26) 为 DIF,DEA=EMA(DIF,9),hist=2·(DIF−DEA)。
  - KDJ:RSV=(close−LL(n))/(HH(n)−LL(n))·100(n=9),K=EMA-like(RSV,1/3),D=EMA-like(K,1/3),J=3K−2D。
  - BOLL:MA(20)±2·STD(20)。
  - VEGAS 通道:EMA144/EMA169 为主通道,EMA576/EMA676 为长通道。
  - Fibonacci:取最近一段 swing 高低,给 0/0.236/0.382/0.5/0.618/0.786/1 回撤位。

### D2:市场结构 —— swing / 趋势线 / 箱体
- **swing 点**:分形法(fractal),窗口 `k`(默认 2)内的局部极值为 swing high/low。
- **趋势线**:对最近若干 swing highs / lows 分别做线性拟合,得上/下趋势线(斜率+截距+当前投影值)。
- **箱体**:检测近段价格在一个 [low,high] 区间内震荡(区间宽度/触碰次数阈值),输出箱体上下沿。

### D3:SMC —— 流动性 / 订单块 / BOS-CHOCH
- **流动性位**:近期 swing 高/低,及近似等高/等低(容差内聚簇)作为流动性目标。
- **订单块**:在结构突破前的最后一根反向 K(下跌前最后阳线=看跌 OB,上涨前最后阴线=看涨 OB),输出其价格区间。
- **BOS/CHOCH**:基于 swing 序列判断结构突破(Break of Structure)与结构反转(Change of Character)。

### D4:S/R 聚合与强度
把来源(BOLL 轨、VEGAS、Fib 位、swing、箱体沿、OB、流动性)统一成候选位 `{price, kind, sources[], strength}`。按价格容差(相对 close 的比例,默认 0.1%)聚簇合并,`strength` = 命中来源数 + 触碰次数加权。输出按强度降序、去重后的 S/R 列表。

### D5:接口与 CLI
- `IndicatorSet.compute(df) -> df(+列)`;`StructureEngine.analyze(df) -> {swings,trendlines,boxes}`;`SmcEngine.analyze(df) -> {liquidity,order_blocks,bos_choch}`;`build_levels(df, ...) -> list[Level]`。
- CLI `analyze --category --symbol --timeframe [--start --end]`:从 Store 读数,打印指标末值 + Top-N S/R 候选。

## Risks / Trade-offs

- **启发式参数敏感** → 参数(窗口、容差、阈值)集中可配,给合理默认;后续可由 #6 反思调参。
- **SMC 定义多样、无统一标准** → 采用清晰、文档化的启发式,标注为可迭代。
- **数据不足/缺口**(#1 已能检测)→ 计算前校验最小长度,不足则返回空结构而非报错。
- **前视偏差(look-ahead)** → 指标/结构只用截至当前 bar 的数据,swing 确认需右侧 `k` 根,输出标注“已确认/暂定”。

## Open Questions

- S/R 聚簇容差与强度权重的默认值需实盘/回测校准(留待 #5/#6)。
- 趋势线选取几条、箱体最小持续长度的默认阈值,实现时给经验值。
