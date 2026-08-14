## Why

我们要基于 Bitget 官方 AI Agent 生态(`bitget-agent-hub`:SDK / MCP / signal)构建一套面向 Bitget 加密货币**合约**(后续扩展现货、raw 等品类)的 **AI 自动交易 + 量化系统**。系统提供两种交易大脑:

1. **深度学习量化模式(5 分钟级)** —— 数据驱动、可回测、低延迟。
2. **AI Agent 模式(日线级)** —— LLM 综合技术指标、市场结构与新闻/宏观面,以「左侧交易、寻找支撑/压力位」为主策略,并具备**记忆-反思-迭代**能力。

整套系统体量为数月工程,单个 OpenSpec change 无法承载。本 change 是一份**总体路线图提案**:锁定系统愿景、能力边界、跨模块架构决策与**按依赖排序的后续 change 序列**,作为所有后续实现型 change 的母提案与共识基线。

## What Changes

- 建立系统**能力全景图**与**分层架构**(数据层 / 分析层 / 风控执行层 / AI Agent 层 / DL 量化层 / 自动化编排 / 前端)。
- 确定**两条执行通道**:DL 量化走 Bitget 直连(REST/WS)低延迟;AI Agent 走 `bitget-agent-mcp` 工具调用。
- 确定**主语言为 Python**,消费 `bitget-agent-*` 作为依赖(不 fork)。
- 确定**风控-仓位模型**:全仓模式;占用保证金合计 ≤ 权益的 5%(可配);单笔/组合最大回撤 15%(可配);单币种杠杆可拉满(资金效率),真实风险由名义敞口 + 回撤熔断控制。
- 确定 **AI Agent 交易记忆-反思系统**同时实现三种反哺:(a) RAG 检索历史交易、(b) 策略参数自调、(c) 经验规则库沉淀。
- 定义**后续 change 的执行序列**(见下表),每个后续 change 独立立项、独立实现。
- 明确**安全基线**:默认纸面交易、硬性风控上限、可配置、实盘需显式开启。

### 后续 Change 路线图(按依赖排序)

| # | Change (建议名) | 内容 | 依赖 |
|---|---|---|---|
| 1 | `market-data-foundation` | MCP 拉任意币种/品类/级别/时间段 K 线 + 存储 + 实时导出 Excel + 定时任务骨架 | — |
| 2 | `indicator-structure-engine` | Fib/MACD/KDJ/布林/VEGAS/SMC(流动性·订单块)+ 趋势线/箱体自动标注 | 1 |
| 3 | `risk-position-management` | 全仓·保证金 5%·回撤 15%·杠杆帽·全参数可配 | 1 |
| 4 | `execution-engine` | 纸面 ⇄ 实盘;AI Agent 走 MCP、DL 走直连;统一下单/持仓封装 | 1,3 |
| 5 | `ai-agent-core` | 指标+结构+新闻宏观 → LLM 决策(左侧/S/R)| 2,3,4 |
| 6 | `trade-memory-reflection` | 交易记忆库 + 反思(a RAG / b 参数自调 / c 规则库)闭环迭代 | 5 |
| 7 | `dl-quant-engine` | 5m 特征 + 开源 DL 框架模型 + 回测 + 定时训练 | 1,3,4 |
| 8 | `automation-orchestration` | 全流程定时任务:拉数据→训练→分析→自动交易 | 全部 |
| 9 | `web-frontend` | 切换 agent、策略编辑器、K线/指标/趋势线/箱体图、盈亏、Excel 导入导出、时间段选择 | 2-8 |

## Capabilities

### New Capabilities
- `system-architecture`: 系统分层架构、两条执行通道、Python 主语言、对 `bitget-agent-hub` 的依赖边界与集成方式。
- `risk-position-model`: 全仓风控与仓位模型的**规格级**要求(保证金上限、回撤熔断、杠杆帽、可配置项)。
- `ai-agent-strategy`: AI Agent 的交易策略规格(左侧交易、S/R 识别输入、决策输出契约)与**记忆-反思**机制要求。
- `change-roadmap`: 后续 change 的序列、依赖关系与每个 change 的范围边界(作为立项契约)。

### Modified Capabilities
<!-- 无(项目初始,尚无既有 specs) -->

## Impact

- **新增依赖**:`@bitget-ai/bitget-agent-sdk`、`@bitget-ai/bitget-agent-mcp`、`@bitget-ai/bitget-signal`(Node ≥ 20);Python 侧 FastAPI、pandas、pandas-ta/TA-Lib、PyTorch(或同类开源 DL 框架)、数据存储(Parquet/TimescaleDB)、Excel 导出(openpyxl)、LLM/MCP 客户端。
- **外部账户**:Bitget API Key(建议先用 Demo Key + `--paper-trading`)。
- **代码结构**:确立 Python 后端 + JS 前端的仓库骨架(具体在各后续 change 落地)。
- **风险面**:涉及真实资金与杠杆合约;本路线图确立「默认纸面 + 硬风控 + 可配置 + 实盘显式开启」的安全基线。
- **已定关键项**:占用保证金合计 ≤ 权益 5%(敞口=杠杆×保证金);LLM 多供应商兼容 + 本地 Ollama;5m 数据 ~3 年、一期 Parquet;USDT 永续合约优先。
