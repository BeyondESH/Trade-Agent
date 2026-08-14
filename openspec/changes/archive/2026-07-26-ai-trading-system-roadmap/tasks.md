## 1. 确认未决项

- [x] 1.1 确认风控措辞:「占用保证金合计 ≤ 权益 5%」(敞口=杠杆×保证金)是否为用户本意
- [x] 1.2 确定 LLM provider(多供应商兼容 + 本地 Ollama,统一 LLMProvider 抽象)与 Python 侧 MCP 客户端接线方式
- [x] 1.3 确定 5m 历史数据深度(~3 年)与存储选型(一期 Parquet,后置 TimescaleDB)
- [x] 1.4 确认合约优先(USDT 永续)、现货/raw 后置的品类范围

## 2. 冻结架构基线

- [x] 2.1 评审并确认 design.md 的 D1–D9 决策
- [x] 2.2 确定 Python 后端 + JS 前端的仓库骨架约定(目录结构、依赖清单)
- [x] 2.3 确认安全基线(默认纸面、confirm 门控、kill switch、凭据来源)

## 3. 按依赖顺序立项后续 Change

- [x] 3.1 立项并实现 `market-data-foundation`(#1,首个技术假设验证:Python↔MCP 拉数据 + Excel 导出)
- [x] 3.2 立项 `indicator-structure-engine`(#2)
- [x] 3.3 立项 `risk-position-management`(#3)
- [x] 3.4 立项 `execution-engine`(#4)
- [x] 3.5 立项 `ai-agent-core`(#5)
- [x] 3.6 立项 `trade-memory-reflection`(#6)
- [x] 3.7 立项 `dl-quant-engine`(#7)
- [x] 3.8 立项 `automation-orchestration`(#8)
- [x] 3.9 立项 `web-frontend`(#9;实际拆为 `web-api` + `web-frontend` 两个 change)

## 4. 验收路线图

- [x] 4.1 确认每个后续 change 范围边界互不重叠
- [x] 4.2 确认依赖顺序无环、可逐个推进
