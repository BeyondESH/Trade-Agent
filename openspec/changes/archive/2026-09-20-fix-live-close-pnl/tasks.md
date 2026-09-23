## 1. 执行层重构：共用结算 helper

- [x] 1.1 在 `backend/src/market_data/execution.py` 新增模块级 `settle_close(portfolio, symbol, exit_price) -> float`：无持仓返回 `0.0`；否则按 `direction = 1.0 if side=="long" else -1.0`、`pnl = notional*(exit-entry)/entry*direction` 结算，执行 `equity += pnl`、`peak_equity = max(peak_equity, equity)`、`del positions[symbol]`，返回 `pnl`
- [x] 1.2 将 `PaperBroker.close` 改为调用 `settle_close`，保持对外行为不变（`test_paper_close_profit`/`test_paper_close_loss` 必须仍通过）

## 2. 实盘平仓 PnL 与成交价解析

- [x] 2.1 在 `execution.py` 新增模块级 `_extract_fill_price(payload) -> float | None`：对 dict 按优先级查找 `avgPrice`/`averagePrice`/`fillPrice`/`price`/`lastPrice`（含 `data`/`result` 嵌套），对字符串尝试容错转数值，任何异常/缺失返回 `None`
- [x] 2.2 `LiveBroker.close` 在下单成功后用 `fill = _extract_fill_price(resp) or price` 作为结算价调用 `settle_close(..., fill)` 并返回其结果；无持仓时返回 `0.0` 且不改动权益
- [x] 2.3 确认 `LiveBroker.close` 的下单参数保持 reduce-only（多头 `sell`/空头 `buy`、`size = notional/price`、`reduceOnly="true"`）

## 3. 可判别错误与 API 映射

- [x] 3.1 在 `execution.py` 定义 `BrokerError(RuntimeError)`；`LiveBroker.open`/`close` 用 `try/except Exception` 包住 `self._client.call_tool(...)`，失败时 `raise BrokerError(...) from exc`（`_gate()` 的 `PermissionError` 不受影响）
- [x] 3.2 在 `webapi.py` 注册针对 `BrokerError`（并覆盖 `McpError`，含 `client.start()` 失败）的 `@app.exception_handler`，返回 `JSONResponse(status_code=502, content={"error": ...})`
- [x] 3.3 确认 `ExecutionEngine.place` 仍仅捕获 `PermissionError`；`BrokerError` 有意上抛至异常处理器，不被伪装成 `filled=false`

## 4. 单元测试（`backend/tests/test_execution.py`）

- [x] 4.1 实盘多头盈利平仓：`LiveBroker(enabled=True, confirm=True)` 平 `price=101.0`，断言 `pnl ≈ +50`、`equity ≈ 1050`、`peak_equity ≈ 1050`、持仓被移除
- [x] 4.2 实盘空头盈利/亏损平仓：断言方向符号正确、权益增减与 `peak_equity` 更新正确
- [x] 4.3 实盘无持仓平仓：断言返回 `0.0` 且 `equity`/`peak_equity` 不变、未调用 MCP
- [x] 4.4 成交价优先：fake client 返回 `{"avgPrice": "101.0"}`（及 `{"data": {"price": "99.0"}}` 嵌套用例），断言结算价取响应成交价而非传入价
- [x] 4.5 无成交价回退：fake client 返回 `{"ok": True}`，断言结算价回退为传入价
- [x] 4.6 MCP 失败路径：fake client 抛 `McpError`，断言 `LiveBroker.close` 抛 `BrokerError`、持仓仍存在、`equity`/`peak_equity` 不变
- [x] 4.7 实盘 `open` MCP 失败：断言抛 `BrokerError` 且 `portfolio.positions` 未新增

## 5. API 层测试（`backend/tests/test_webapi.py`）

- [x] 5.1 用会抛 `McpError`/`BrokerError` 的 fake MCP client 走 `POST /order/confirm` 实盘分支，断言返回 502 且响应体为结构化 JSON（非 500），持仓未被移除

## 6. 验证

- [x] 6.1 运行 `cd backend && python -m pytest tests/test_execution.py -q` 全绿
- [x] 6.2 运行 `cd backend && python -m pytest tests/test_webapi.py -q` 全绿（确认纸面路径与既有 confirm-token 流程无回归）
- [x] 6.3 运行 `cd backend && python -m pytest -q` 全量回归通过
