## Context

`execution.py` 定义两个 broker：

- `PaperBroker.close`（81-90 行）已正确结算：`direction = 1.0 if long else -1.0`、`pnl = notional*(price-entry)/entry*direction`、`equity += pnl`、`peak_equity = max(peak_equity, equity)`、`del positions[symbol]`、`return pnl`；无持仓返回 `0.0`。
- `LiveBroker.close`（137-155 行）在 `_gate()` 通过后，对存在的持仓发 reduce-only `order`（`side` 取反、`size = notional/price`、`reduceOnly="true"`），随后 `del positions[symbol]` 并硬编码 `return 0.0`。

调用方：`ExecutionEngine.close`（190-191 行）直接委托 `self.broker.close(...)`；`orchestration.AgentCycle.close_position`（116-143 行）用其返回值填 `TradeRecord.pnl`。因此实盘平仓在日志中 PnL 恒为 0，且权益/峰值不更新——回撤熔断（`risk.drawdown_pct` 基于 `peak_equity`）随之失真。

`ExecutionEngine.place`（169-188 行）只捕获 `PermissionError`（live 闸门拒绝）。`LiveBroker.open`/`close` 里的 `self._client.call_tool(...)` 失败会抛出 `mcp_client.McpError`（`RuntimeError` 子类，`mcp_client.py:51-52`）或传输层异常，穿透执行层。`POST /order/confirm` 的实盘分支（`webapi.py:925-938`）调 `live.place(...)`，未捕获即成为未处理 500。`webapi.py` 现有 `@app.exception_handler(ValueError)`（342 行）与若干 `HTTPException(502)` 用法（414/503/529/536 行），说明 502 是上游依赖失败的既有约定。

约束：`api-core` 要求“统一 JSON 错误（非 500 未处理异常）”；`live-safety` 要求实盘经 MCP `order` 下单；`paper-broker` 已固化纸面平仓 PnL 语义。MCP `order` 工具的响应形状无仓库内契约：`McpDataClient.call_tool` 仅返回 `structuredContent` 或解析后的 JSON 文本（`mcp_client.py:196-221`），字段名不可假设。

## Goals / Non-Goals

**Goals:**
- `LiveBroker.close` 与 `PaperBroker.close` 的 PnL/权益/峰值语义完全一致，并返回真实的已实现 PnL（无持仓时才为 `0.0`）。
- 平仓结算价优先使用 MCP 响应里可解析的实际成交价，缺失时回退传入价。
- `LiveBroker.open`/`close` 的 MCP 失败成为可判别的执行层错误；`POST /order/confirm` 返回结构化 4xx/5xx（502）而非 500。
- 结算逻辑单点实现，纸面/实盘不分叉。

**Non-Goals:**
- 不改 `LiveBroker.open` 的成交价来源（仍取传入 `price`），也不做部分平仓/分批成交撮合。
- 不新增平仓 API 路由（当前 `LiveBroker.close` 由 agent/orchestration 路径经 `ExecutionEngine.close` 触达）。
- 不改动 MCP 客户端桥本身（`mcp_client.py`）、风控模型或纸面撮合的其他行为。
- 不引入手续费/滑点建模。

## Decisions

**决策 1：抽取共用结算 helper，`PaperBroker`/`LiveBroker` 都调用它**

在 `execution.py` 增加模块级 `settle_close(portfolio, symbol, exit_price) -> float`：无持仓返回 `0.0`；否则按方向算 PnL、`equity += pnl`、`peak_equity = max(...)`、`del positions[symbol]`、返回 `pnl`。`PaperBroker.close` 与 `LiveBroker.close` 都改为“先下单（实盘）/直接（纸面）→ 再 `settle_close`”。

- 理由：消除两 broker 语义漂移的根因；新增测试只需覆盖一处公式。与 `paper-broker` 既有公式逐字节一致。
- 备选：在 `LiveBroker.close` 内复制纸面公式——短期改动更小，但保留了分叉风险，弃用。

**决策 2：成交价“尽力解析 + 回退传入价”，提取集中为 `_extract_fill_price`**

新增模块级 `_extract_fill_price(payload) -> float | None`：若 payload 是 dict，按优先级在上层与 `data`/`result` 嵌套层查找候选键 `avgPrice`/`averagePrice`/`fillPrice`/`price`/`lastPrice` 的数值；若 payload 是字符串先尝试容错解析为数值。任何异常/缺失均返回 `None`。`LiveBroker.close` 下单后取 `fill = _extract_fill_price(resp) or price` 再 `settle_close(..., fill)`。

- 理由：MCP 响应无仓库内契约，硬绑定字段名会因上游变更而失败；“优先真实成交价、缺失回退”满足需求且不引入脆弱依赖。
- 备选：完全忽略响应、恒用传入价——实现最简但放弃更准确的 PnL，弃用；强制要求 MCP 返回成交价——会在响应无此字段时直接失败，弃用。

**决策 3：新增 `BrokerError`，让执行层与传输层解耦，由 API 层映射为 502**

在 `execution.py` 定义 `class BrokerError(RuntimeError)`（执行层可判别错误）。`LiveBroker.open`/`close` 用 `try/except Exception` 包住 `call_tool`，捕获后 `raise BrokerError(f"live order failed: {exc}") from exc`（`PermissionError` 来自 `_gate()`，不在 `call_tool` 内，故不受影响）。`ExecutionEngine.place` 保持只捕获 `PermissionError`（闸门拒绝仍是 `ExecutionResult(filled=False)`）；`BrokerError` 有意向上传播。`webapi.py` 注册 `@app.exception_handler(BrokerError)`（并一并处理 `McpError`，覆盖 `client.start()` 失败）返回 `JSONResponse(status_code=502, content={"error": ...})`。

- 理由：与 `api-core` 统一错误、`webapi.py` 既有 502 约定一致；执行层不再依赖 `mcp_client`（避免 `execution.py` 反向 import MCP 模块），API 层负责把“上游依赖失败”翻译为 HTTP。
- 备选：在 `LiveBroker` 内直接抛 `HTTPException`——把 web 依赖注入执行层，弃用；在 `ExecutionEngine.place` 里捕获 `BrokerError` 并返回 `filled=False`——会把上游故障伪装成业务拒绝（200 + filled=false），无法区分，弃用。

**决策 4：下单失败时不删除持仓、不改动权益**

`settle_close` 只在下单成功之后调用；`call_tool` 抛出时持仓保留、权益不变，`BrokerError` 上抛调用方重试。实盘闸门（live 未开启/未确认）仍在 `_gate()` 内先于任何下单，语义不变。

- 理由：平仓单未成功却删仓会造成组合与真实账户背离；保留持仓使重试安全。
- 备选：先删仓再下单——失败即丢仓位，不可接受，弃用。

**决策 5：测试直接驱动，不依赖网络**

复用 `test_execution.py` 现有 `_FakeClient`（返回 `{"ok": True}`）验证回退价；新增会抛 `McpError` 的 fake client 验证 `BrokerError` 与持仓保留；新增带成交价字段（如 `{"avgPrice": "101.0"}` 与 `{"data": {"price": "99.0"}}`）的 fake client 验证成交价优先。全部为纯 `LiveBroker`/`ExecutionEngine` 单测。

## Risks / Trade-offs

- [MCP `order` 响应成交价字段名未知，可能漏解析] → 回退传入价保证不失败；`_extract_fill_price` 覆盖多个候选键与嵌套，若后续确认实际字段可单点扩展。
- [把 MCP 失败映射为 502 会改变 `/order/confirm` 的既有 500 行为，前端若有“按 500 处理”的逻辑需同步] → 502 更准确地表达上游失败；响应仍为 `{"error"/"detail": ...}` 结构化 JSON。
- [`_extract_fill_price` 误把响应里非成交价的 `price` 当成交价] → 候选键按 `avgPrice`/`averagePrice`/`fillPrice` 优先、泛用 `price` 最后；实盘 size 为市价单，误差仅影响 PnL 结算基准，不影响下单正确性。
- [`ExecutionEngine.place` 同时存在 PermissionError→拒绝 与 BrokerError→上抛 两条路径，调用方需知晓] → 在 `BrokerError` docstring 与 spec scenario 中显式说明；由异常处理器兜底，未处理的 `BrokerError` 不会变成 500。

## Migration Plan

1. 先落地 `settle_close` 并让 `PaperBroker.close` 改用它（纯重构，现有纸面测试必须全绿）。
2. 再改 `LiveBroker.close`/`open` 的错误包装与成交价解析。
3. 最后在 `webapi.py` 注册 `BrokerError`/`McpError` 异常处理器。
4. 回归：`cd backend && python -m pytest tests/test_execution.py tests/test_webapi.py -q`，再跑 `python -m pytest -q`。
5. 回滚：改动集中在单文件与一个异常处理器，`git revert` 对应提交即可，无数据迁移。

## Open Questions

- MCP `bitget-agent-mcp` 的 `order` 工具成功响应实际字段名待真机确认（当前按候选键尽力解析）。
- 是否需要在 `GET /portfolio` 上暴露“最近一次平仓 PnL/结算价”供前端展示（超出本次范围，暂不做）。
