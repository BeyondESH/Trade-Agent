## Context

`ai-trading-system-roadmap` 已锁定架构基线:Python 主语言、AI Agent 走 `bitget-agent-mcp`、默认纸面、合约优先。本 change 落地数据地基,是首个技术假设验证点(Python↔MCP 拉数据 + Excel 导出)。仓库当前除 OpenSpec 外无代码,需同时建立后端骨架。

## Goals / Non-Goals

**Goals:**
- 打通 Python → `bitget-agent-mcp` → 行情数据 的稳定通路。
- 按品类/币种/级别/时间段拉 K 线,落 Parquet,支持增量与缺口校验。
- 支持导出 Excel(按需 + 实时追加)。
- 提供可复用的定时任务骨架。

**Non-Goals:**
- 不实现任何指标/结构/风控/交易(属后续 change)。
- 不实现实时 WebSocket 推送(DL 5m 的直连 WS 留待 `dl-quant-engine`);本 change 用 MCP REST 式拉取。
- 不做前端(属 `web-frontend`)。

## Decisions

### D1:MCP 客户端桥用官方 `mcp` Python SDK + stdio 子进程
Python 侧以子进程拉起 `npx @bitget-ai/bitget-agent-mcp`,通过 stdio 走 MCP 协议调用 `market` 工具(如 `tickers`/`candles`)。封装成 `McpDataClient`,连接/重连/超时集中管理。
- **备选**:Python 直连 Bitget REST——放弃(本 change 目标就是验证 MCP 通路);调 `bgc` CLI——放弃(解析 stdout 脆弱)。

### D2:数据模型与存储布局
统一 OHLCV 模型:`(symbol, category, timeframe, open_time, open, high, low, close, volume)`。Parquet 按 `category/symbol/timeframe/` 分区,并**按 UTC 自然日每日一个文件**(`<YYYY-MM-DD>.parquet`);Excel 导出同样每日一个文件。便于按日检索、增量与管理。
- 增量:以 `open_time` 为主键去重合并;拉取前先查已存最新时间(取最新日文件的 max),只补缺口。
- 缺口校验:按 timeframe 步长检测缺失 bar,记录并可补拉。

### D3:Excel 导出
用 `openpyxl` 导出。两种模式:一次性按查询导出;实时追加(拉取时增量写入)。实时写采用批量/节流,避免高频阻塞。

### D4:定时任务骨架
用 `APScheduler`(轻量、进程内)提供周期性增量拉取的骨架接口,供后续 `automation-orchestration` 复用。本 change 只做骨架 + 一个增量拉取 job。

### D5:配置与项目骨架
`backend/` 目录;`pydantic-settings` 读环境变量与配置(品类/币种/级别/时间段、存储路径、任务周期);统一日志。凭据(如后续需要)仅从环境变量读取。

## Risks / Trade-offs

- **MCP 子进程稳定性/启动开销** → 连接复用 + 超时重连;本 change 即为验证该假设。
- **`bitget-agent-mcp` 的 candles 工具参数/分页限制未知** → 先用 `discover` 探明工具契约,分页循环拉取。
- **时区/时间戳单位不一致** → 统一以 UTC 毫秒存储,读取层转换。
- **Excel 实时写性能** → 批量/节流落盘,大数据量优先 Parquet,Excel 仅按需导出。
- **Node 环境缺失** → 启动前检测 Node ≥ 20,给出明确报错。

## Open Questions

已在实现中探明并解决:

- **candles 契约**:`market` verb;历史区间用 `action=candlesHistory`,参数 `category/symbol/interval/endTime/limit`(无 startTime);`interval` 取值 `1m,3m,5m,15m,30m,1H,4H,6H,12H,1D`;**单次 limit 上限 100**;按 `endTime` 向过去翻页。行格式 `[ts,open,high,low,close,baseVol,quoteVol]`。
- **依赖管理**:环境无 uv,改用 `python -m venv` + pip(pyproject 仍兼容 uv)。
- **pydantic-settings 列表字段**:env 传 CSV 需用 `NoDecode` 注解跳过 JSON 解码,再由验证器切分。

遗留(非本 change 阻塞):真实 5m 数据存在零星缺口(交易所侧),`find_gaps` 已能识别,补拉策略留待后续增强。
