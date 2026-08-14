## Why

这是 AI 交易/量化系统的**首个实现型 change**,也是全部后续 change 的地基。它验证最关键的技术假设——**Python 能否稳定地通过 `bitget-agent-mcp` 拉取行情数据、落地存储并导出 Excel**。DL 量化(5m)与 AI Agent(日线)两个模式都依赖统一、可靠的数据层。

## What Changes

- 建立 **Python 后端项目骨架**(依赖管理、配置、环境变量读取、日志)。
- 建立 **MCP 客户端桥**:以 stdio 子进程拉起 `bitget-agent-mcp`,从 Python 调用 `market` 相关工具。
- 实现 **K 线拉取**:按「品类 + 币种 + 时间级别 + 手动时间段」拉取,支持所有 MCP 支持的品类/币种;一期聚焦 USDT 永续合约(BTC/ETH/SOL)。
- 实现 **Parquet 存储 + 增量更新 + 缺口校验**。
- 实现 **Excel 导出**(按需 + 实时追加),覆盖 K 线数据。
- 建立 **定时任务骨架**(可周期性增量拉取),供后续编排复用。

## Capabilities

### New Capabilities
- `mcp-data-bridge`: Python 通过 stdio 拉起并调用 `bitget-agent-mcp` 获取行情数据的客户端桥。
- `kline-ingestion`: 按品类/币种/级别/时间段拉取 K 线,支持增量与缺口校验。
- `market-data-store`: Parquet 存储层,负责落地、去重、增量合并与读取。
- `excel-export`: 将 K 线数据按需/实时导出为 Excel。
- `scheduled-ingestion`: 定时任务骨架,周期性触发增量拉取。

### Modified Capabilities
<!-- 无 -->

## Impact

- **新增**:Python 后端项目(建议 `backend/`),依赖 `mcp`(官方 SDK)、`pandas`、`pyarrow`、`openpyxl`、`APScheduler`、`pydantic-settings`。
- **外部依赖**:Node ≥ 20 环境以运行 `@bitget-ai/bitget-agent-mcp`;公共行情无需 API Key。
- **配置**:品类/币种/级别/时间段、存储路径、任务周期均可配置。
- **对齐路线图**:实现 `ai-trading-system-roadmap` 中 #1 `market-data-foundation` 的范围,不越界实现指标/风控/交易。
