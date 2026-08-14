## 1. 项目骨架

- [x] 1.1 创建 `backend/` Python 项目(依赖管理 uv,pyproject.toml)
- [x] 1.2 添加依赖:`mcp`、`pandas`、`pyarrow`、`openpyxl`、`APScheduler`、`pydantic-settings`
- [x] 1.3 配置层:`pydantic-settings` 读环境变量与配置(品类/币种/级别/时间段、存储路径、任务周期)
- [x] 1.4 统一日志初始化

## 2. MCP 数据客户端桥

- [x] 2.1 实现 `McpDataClient`:stdio 子进程拉起 `bitget-agent-mcp`
- [x] 2.2 启动前检测 Node ≥ 20,缺失时明确报错
- [x] 2.3 用 `discover` 探明 candles 工具的 operationId/参数/单次上限
- [x] 2.4 封装超时、重连与错误返回

## 3. K 线拉取

- [x] 3.1 实现按 品类/币种/级别/时间段 拉取,归一为 OHLCV(UTC)
- [x] 3.2 超出单次上限时分页循环拉取并拼接
- [x] 3.3 增量拉取:查询已存最新时间,仅补缺口
- [x] 3.4 缺口校验:按步长检测缺失 bar

## 4. Parquet 存储

- [x] 4.1 实现按 `category/symbol/timeframe` 分区写入
- [x] 4.2 以 open_time 去重合并
- [x] 4.3 实现按品类/币种/级别/时间段读取接口(时间升序)

## 5. Excel 导出

- [x] 5.1 实现按查询一次性导出 .xlsx
- [x] 5.2 实现实时追加导出(批量/节流)

## 6. 定时任务

- [x] 6.1 用 APScheduler 搭定时任务骨架 + 一个增量拉取 job
- [x] 6.2 周期可配置;失败记录日志且不影响下次调度

## 7. 验证

- [x] 7.1 端到端:拉取 BTCUSDT 永续 5m/1d 指定区间 → 存 Parquet → 导出 Excel
- [x] 7.2 增量二次拉取只补缺口、无重复
- [x] 7.3 定时任务按周期成功触发一次增量拉取
