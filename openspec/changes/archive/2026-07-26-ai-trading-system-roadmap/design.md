## Context

项目初始,仓库仅有 OpenSpec 脚手架,无既有代码。目标是在 Bitget 官方 AI Agent 生态(`bitget-agent-hub` = SDK / MCP / signal)之上,构建 Bitget 合约(后续扩展现货、raw)的 AI 自动交易 + 量化系统,含两种大脑:DL 量化(5m)与 AI Agent(日线,左侧交易/找 S/R)。

`agent_hub-main` 本身只是**元安装器 + 文档**;真正能力在 npm 包:`bitget-agent-sdk`(109 操作、HMAC 签名、限流、mock server)、`bitget-agent-mcp`(stdio MCP server)、`bitget-signal`(5 个免 key 行情分析 skill)。本文件锁定跨模块架构决策,供后续 9 个实现型 change 遵循。

## Goals / Non-Goals

**Goals:**
- 确立分层架构、两条执行通道、Python 主语言与对 `bitget-agent-hub` 的依赖边界。
- 锁定风控-仓位模型的数学与安全基线(全仓、保证金 ≤5%、回撤 15%、杠杆帽、默认纸面)。
- 确立 AI Agent 的输入契约(确定性指标+结构+新闻宏观)与记忆-反思三层机制。
- 给出后续 change 的排序、依赖与边界,作为立项契约。

**Non-Goals:**
- 不在本 change 内写任何业务代码(纯规划/规格)。
- 不最终敲定 LLM provider、历史数据深度、前端框架细节(留待各自 change)。
- 不覆盖现货/raw 的一期实现(合约优先,架构预留扩展)。

## Decisions

### D1:Python 主语言,消费 `bitget-agent-hub` 作为依赖(不 fork)
DL 生态在 Python(PyTorch 等)。`bitget-agent-*` 为 TS/Node,以依赖形式消费而非改造。
- **备选**:全 TS(DL 用 ONNX)——放弃,DL 研究效率低;双栈重桥接——保留但仅在必要处。

### D2:两条执行/数据通道
- **DL 量化(5m)**:低延迟,走 **Bitget 直连 REST + WebSocket**(实时 K 线),不绕 MCP。
- **AI Agent(日线)**:走 **`bitget-agent-mcp`**(Python 以子进程 + MCP stdio 客户端调用 `order/position/market` verbs 及 `bitget-signal` 的新闻/宏观 skill)。
- **理由**:MCP 为「AI 工具调用」优化(intent verbs、progressive disclosure),契合低频 LLM;量化要毫秒~秒级、要 WS 推送,直连更合适。

### D3:风控-仓位模型(全仓)
- 全仓模式;占用保证金合计 ≤ 权益 5%(可配);单币种杠杆可拉满;名义敞口 = 杠杆 × 保证金。
- 单笔/组合最大回撤 15%(可配)触发熔断平仓;所有阈值前端可调。
- **数学依据**:全仓下 100x、50u 保证金、5000u 敞口于 1000u 权益 → 爆仓约需逆向 ~20%;而 15% 权益回撤熔断 ≈ 逆向 ~3% 即平仓,**熔断远早于爆仓**,故高杠杆仅为资金效率,真实风险由敞口 + 回撤控制。
- **备选**:逐仓——放弃,与「左侧加仓」冲突(~1% 即爆),且亏损被单仓保证金封顶达不到 15% 目标。

### D4:S/R 由确定性算法产出,LLM 只做取舍择时
- 右侧指标(Fib 回撤、MACD、KDJ、布林、VEGAS 通道、SMC 流动性/订单块)用 `pandas-ta`/TA-Lib + 自研;结构(趋势线、箱体)用算法/开源框架自动标注。
- 把候选 S/R 位与指标态势喂给 LLM 决策,而非让 LLM 目测价格。
- **理由**:便宜、稳定、部分可测;避免 LLM 幻觉出价。

### D5:记忆-反思三层(a/b/c)分阶段落地
- (a) RAG:决策前检索相似历史交易 + 反思注入 prompt —— **先做**。
- (c) 规则库:反思提炼「经验规则」注入系统提示。
- (b) 参数自调:反思产出可执行的风控/策略参数变更 —— 最后做(需灰度/防过拟合)。
- **存储**:关系库存交易流水/PnL/参数;向量库存反思文本供 RAG。

### D6:数据层与导出
- 从 MCP 按「币种/品类 + 时间级别 + 手动时间段」拉 K 线;支持所有 MCP 支持的品类。
- 存储 Parquet/TimescaleDB;**实时导出 Excel**(openpyxl),支持盈亏、K 线导入导出。

### D7:前后端
- 后端 FastAPI(REST + WebSocket 推送);前端 React + 图表库(lightweight-charts/ECharts)。
- 前端:切换 agent、策略编辑器、图表(K线/指标/趋势线/箱体)、导入导出、时间段选择。

### D8:安全基线
默认 `--paper-trading`;高危操作 `confirm` 门控;全局 kill switch;实盘需显式开启 + 二次确认;凭据仅从环境变量读取。

### D9:自动化编排
定时任务(APScheduler/Celery)串起:拉数据 → 训练/计算分析 → 决策 → 自动交易,全流程可无人值守,但受风控与 kill switch 约束。

### D10:LLM Provider 抽象(多供应商 + 本地)
后端封装统一 `LLMProvider` 接口,SHALL 兼容市面绝大多数主流供应商(Anthropic、OpenAI、以及 OpenAI 兼容端点如 DeepSeek/通义等)与**本地化部署(Ollama)**。供应商、模型、密钥、base_url 均可配置切换。
- **接线**:Python 用官方 `mcp` SDK 以 stdio 子进程拉起 `bitget-agent-mcp` 与 `bitget-signal`,在 agent 循环里做工具调用;工具层与 LLM 层解耦,换 provider 不影响工具调用。
- **理由**:避免绑死单一厂商;本地 Ollama 便于低成本/离线/隐私场景。
- **注意**:本地小模型的工具调用/长上下文能力较弱,记忆-反思(RAG)与 S/R 结构化输入需对弱模型做降级容错。

## Risks / Trade-offs

- **高杠杆 + 左侧 + 全仓连锁爆仓** → 硬风控:回撤熔断先于爆仓、加仓次数上限、单币种敞口帽、默认纸面。
- **LLM 幻觉/错误下单** → 决策与执行分离,执行前经确定性风控校验 + confirm 门控;S/R 由算法出、LLM 只择时。
- **回测-实盘差距(滑点/手续费/延迟)** → 回测计入费用滑点;实盘先纸面前向验证。
- **DL 过拟合** → 时间序列切分、walk-forward、样本外验证。
- **Python↔MCP 桥接复杂度/稳定性** → 早期(change #1)先验证该技术假设。
- **Excel 实时写性能** → 批量/异步落盘,避免高频阻塞。
- **数据质量/缺口** → 增量校验、缺失补拉。
- **资金安全** → 凭据仅环境变量、默认 Demo、密钥轮换。

## Migration Plan

初始项目无回滚面。推进策略:严格按路线图 #1→#9 依赖顺序逐个立 change;每个 change 独立实现、独立验证;先纸面闭环跑通再考虑实盘。change #1(数据地基)作为首个技术假设验证点。

## Open Questions

已解决(见对应决策):

- **保证金措辞**:确认为「占用保证金合计 ≤ 账户权益 5%(可配),名义敞口 = 杠杆 × 保证金」。见 D3 / `risk-position-model`。
- **LLM provider 与接线**:多供应商兼容 + 本地 Ollama,统一 `LLMProvider` 抽象;Python `mcp` SDK 以 stdio 子进程接 `bitget-agent-mcp`/`bitget-signal`。见 D10。
- **5m 数据深度与存储**:BTC/ETH/SOL 各 ~3 年 5m K 线;一期用 Parquet,实时服务后置 TimescaleDB。见 D6。
- **品类范围**:USDT 本位永续合约优先(BTC/ETH/SOL);现货/raw 架构预留、后置;前端选币列表仍展示所有 MCP 支持品类。

剩余待后续 change 细化:本地小模型工具调用降级策略;walk-forward 具体切分参数。
