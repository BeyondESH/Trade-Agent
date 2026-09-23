## Why

实盘经纪商 `LiveBroker.close`（`backend/src/market_data/execution.py:137-155`）在向 MCP `order` 工具发出 reduce-only 平仓单后，直接 `del portfolio.positions[symbol]` 并 `return 0.0`——从未按方向结算已实现盈亏，也从不更新 `portfolio.equity` / `portfolio.peak_equity`。同一文件里纸面路径 `PaperBroker.close`（81-90 行）已正确执行 `pnl = notional*(price-entry)/entry*direction; equity += pnl; peak_equity = max(...)`。两条 broker 语义不一致，导致经实盘平仓的交易日志（`orchestration.AgentCycle.close_position` → `TradeRecord.pnl`）被记为 0，权益峰值（回撤熔断 `risk.drawdown_pct` 的直接输入）也随之失真。

同时 `LiveBroker.open`/`close` 直接调用 `self._client.call_tool(...)` 且不做错误包装，`McpError` 会穿透 `ExecutionEngine.place`（其仅捕获 `PermissionError`，见 184-187 行）直达 `POST /order/confirm`（`webapi.py:917-938`），以未处理的 500 暴露，违反 `api-core` “对异常返回统一 JSON 错误（非 500 未处理异常）”的要求。

## What Changes

- `LiveBroker.close` 按与 `PaperBroker.close` 完全一致的方向公式结算已实现 PnL，更新 `portfolio.equity` 与 `portfolio.peak_equity`，移除持仓，并返回该 PnL；仅当标的不存在持仓时返回 `0.0`。
- 结算价优先取 MCP `order` 工具响应中可解析到的实际成交价（容忍 `avgPrice`/`averagePrice`/`price`/`fillPrice` 等字段及 `data` 嵌套），解析不到时回退为 `close(symbol, price)` 传入价；提取逻辑集中为单一 helper，避免 broker 内散落。
- 将 `LiveBroker.open`/`close` 的 `call_tool` 失败包装为可判别的执行层错误（新增 `BrokerError`），`POST /order/confirm` 的实盘分支（含 `client.start()` 的 `McpError`）统一映射为结构化 502 JSON 响应而非 500。
- 抽取纸面与实盘共用的平仓结算 helper，保证两条 broker 的 PnL/权益更新语义只实现一次。
- 新增/扩展 `backend/tests/test_execution.py` 单测：实盘多头盈利平仓、实盘空头盈利/亏损平仓、权益与峰值更新、无持仓返回 0.0、MCP 失败抛出可判别错误且保留持仓不动。
- 不改动 `LiveBroker.open` 的入场价取值（仍取传入价 `price`）；成交价优先仅用于平仓结算，`open` 侧的成交价回填留待后续。
- `trade-journal` 既有要求（持久化 PnL）本身不变，本次是恢复合规：实盘平仓后日志 PnL 不再为 0。

## Capabilities

### New Capabilities
- (none)

### Modified Capabilities
- `execution-core`: 新增“平仓 PnL 结算与权益更新”（对所有 broker 统一）与“broker 执行失败的可判别错误”两项要求。
- `live-safety`: 新增“实盘平仓 reduce-only 下单、成交价优先与失败保留持仓”要求。

## Impact

- **代码**：`backend/src/market_data/execution.py`（`PaperBroker`/`LiveBroker` 共用结算 helper、`BrokerError`、实盘 `open`/`close` 错误包装）、`backend/src/market_data/webapi.py`（`/order/confirm` 实盘分支或全局异常处理器映射 `BrokerError`/`McpError` → 502 结构化响应）。
- **测试**：`backend/tests/test_execution.py`（新增平仓 PnL/权益/失败路径用例）；`backend/tests/test_webapi.py` 视需要补充实盘失败返回结构化错误的用例。
- **API**：`POST /order/confirm` 在 MCP 失败时的返回由 500 变为 502 + `{"detail": ...}`；成功路径的响应体结构不变。
- **数据/行为**：实盘平仓后 `Portfolio.equity`/`peak_equity` 与交易日志 `pnl` 变为真实已实现盈亏；回撤熔断判据随之恢复正确。
- **风险**：低。MCP `order` 响应的成交价字段名未在本仓库固化（`mcp_client._extract_payload` 只做 JSON 透传），故采用“尽力解析 + 回退传入价”的保守策略，不会因字段缺失而失败。
