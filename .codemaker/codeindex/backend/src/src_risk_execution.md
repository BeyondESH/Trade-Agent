---
type: "Fragment"
id: backend/src/risk_execution
title: "风控闸门与订单执行"
description: "下单前必须依次通过哪些检查、全仓保证金怎么测算、熔断为什么要绕开 kill-switch？"
parent: /backend/src/_overview.md
fragment: risk_execution
entity_names:
  constants:
    - name: RiskConfig.margin_pct
      value: "0.05"
      source: backend/src/market_data/risk.py
    - name: RiskConfig.max_drawdown_pct
      value: "0.15"
      source: backend/src/market_data/risk.py
    - name: RiskConfig.max_leverage
      value: "100.0"
      source: backend/src/market_data/risk.py
    - name: RiskConfig.max_adds
      value: "3"
      source: backend/src/market_data/risk.py
    - name: RiskConfig.max_symbol_margin_pct
      value: "0.05"
      source: backend/src/market_data/risk.py
    - name: PaperBroker add 计数起点
      value: "首仓 adds=1；加仓 adds+=1 且入场价按 notional 加权平均"
      source: backend/src/market_data/execution.py
    - name: LiveBroker MCP 下单参数
      value: "action=place, category=<per-order>, symbol, side=buy|sell, orderType=market, size=notional/price, [reduceOnly='true']"
      source: backend/src/market_data/execution.py
    - name: _FILL_PRICE_KEYS
      value: "avgPrice, averagePrice, fillPrice, price, lastPrice"
      source: backend/src/market_data/execution.py
    - name: DEFAULT_MAX_EVENTS
      value: "200（EventLog 上限，超限整文件重写保留最新 N 条）"
      source: backend/src/market_data/events.py
retrieval_hints:
  - "一笔单在真正下单前要过几道检查、顺序是什么？"
  - "为什么会触发熔断、触发后系统怎么处理持仓？"
  - "全仓模式下保证金与名义敞口是怎么算出来的，杠杆超额是被拒绝还是被钳制？"
  - "实盘下单要满足什么条件？只开 `live_enabled` 够不够？"
  - "平仓时已实现盈亏按什么公式结算？"
  - "⚠️ 如果你找的是「回测撮合（vectorbt 的 fee/slippage）」，不在这里，在 `src_quant.md`"
  - "⚠️ 如果你找的是「Agent 决策与策略信号」，不在这里，在 `src_agent_orchestration.md`"
  - "本模块也叫『风控层 / 执行层 / 下单闸门 / 熔断』"
  - "架构归属：任何新的下单入口（GM 工具、新端点、新调度任务）MUST 复用 `ExecutionEngine.place/close`，禁止直接调用 `McpDataClient.call_tool(\"order\", …)`"
architectural_role: "安全闸门层（纯计算、不触交易所），是全系统唯一合法的下单/平仓出口"
---

## 业务意图

本层解决的业务问题是：**在一个会自己决定买卖的系统里，保证「模型或脚本报错」最坏也只是少赚，而不是把账户打爆**。它承担四件事：把意图仓位换算成全仓保证金口径、拒绝或缩减越界的订单、在组合回撤达到阈值时阻断新开仓并给出应平持仓、以及把每一次熔断相关的判断留痕（供前端提示与排障）。它被刻意写成纯函数 + 纯状态对象（无网络、无日志副作用），因为它是整个系统里最该被单测穷举的一块。

## 对外接口（进程内；订单语义的 HTTP 契约见 `src_api_stores.md` 的 `/order` 与 `/order/confirm`）

| 接口 | 方向 | 关键字段 | 业务说明 | 入口符号 |
|------|------|---------|---------|---------|
| `RiskEngine.check_order(portfolio,symbol,intended_leverage)` | 内部调用 | `OrderDecision(approved,margin,notional,leverage,reason)` | 四道检查的唯一入口，MUST 在执行 broker 之前 | `risk.py` |
| `size_position(equity,intended_leverage,cfg,portfolio,symbol)` | 内部调用 | `Sizing(clamped,reason)` | 全仓测算：杠杆钳制、总/单币种上限缩减；无余额时 `margin=0` | `risk.py:size_position` |
| `check_circuit_breaker(portfolio)` | 内部调用 | `(tripped, reason)` | `drawdown >= max_drawdown_pct` 即触发；只阻断新开仓 | `risk.py` |
| `ExecutionEngine.place(OrderRequest, price)` | 内部调用 | `ExecutionResult(approved,filled,reason,decision,position)` | 固定顺序：熔断 → 风控 → broker | `execution.py` |
| `ExecutionEngine.close(symbol, price)` | 内部调用 | 返回 realized PnL | 纸面/实盘共用 `settle_close` 语义 | `execution.py` |
| `ExecutionEngine.enforce_circuit_breaker()` | 内部调用 | `list[Position]` | 触发时返回全部应平持仓（并记 `enforced` 事件），保护性平仓由 `src_agent_orchestration.md` 的任务驱动 | `execution.py` |
| `settle_close(portfolio,symbol,exit_price)` | 内部函数 | `pnl` | 平仓结算的唯一公式出口；无持仓返回 `0.0` 且不动 `equity/peak_equity` | `execution.py:settle_close` |
| `PaperBroker` / `LiveBroker`（`Broker` Protocol） | 可插拔实现 | `open` / `close(portfolio,symbol,exit_price)` | 纸面默认、实盘必经双闸门 | `execution.py` |
| `EventLog.append(kind,payload)` / `.list(kind,limit)` | 持久化 | `id/ts/kind/payload` | 熔断事件留痕，默认 kind 为 `circuit_breaker` | `events.py` |

## 跨模块依赖

| 依赖 | 引用原因 | 关键符号 | confidence |
|---------|---------|---------|------------|
| `mcp_client.py`（`src_ingestion.md`） | 实盘下单经 `bitget-agent-mcp` 的 `order` 工具（`McpDataClient.call_tool`），非直连 REST | `McpDataClient.call_tool("order", …)` | extracted |
| `events.py` | broker 与引擎共享 `EventSink` 协议 | `EventLog.append` | extracted |
| `src_agent_orchestration.md` | `AgentCycle` 复用本层，并在平仓后写交易日志 | `ExecutionEngine`、`enforce_circuit_breaker` | extracted |

**反向调用方**

| 调用方 | 调用场景 | 关键符号 |
|---|---|---|
| `agentTradingAgent.act` | 把结构化决策路由为下单 | `agent.py` |
| `webapi` 的 `/order` 与 `/order/confirm` | 手工下单与纸面/实盘下单 | `ExecutionEngine.place` |
| `orchestration` 的熔断与 Agent 自动循环 | 定时循环与 `run_circuit_breaker` | `AgentCycle.step/enforce` |
| `cli risk-check / trade` 子命令 | 演示闸门与纸面开平仓 | `risk-check`、`trade` |
| `appconfig.py`（`src_api_stores.md`） | 持久化的风控配置 | `ConfigStore.risk_config()` |

## 典型调用链

```
手工下单
  POST /api/order {symbol,side,leverage,price}     ← 接口层闸门一：kill-switch（不通过 403）
    → RiskEngine.check_order(portfolio, symbol, leverage)   ← 本模块预校验（仅用于生成 preview）
    → pending[token] = (body, monotonic + PENDING_TOKEN_TTL_SECONDS=300)
  POST /api/order/confirm {token}                   ← 接口层：token 一次性消费，用后即 pop
    → 若 live（paper_only=False）：新建 McpDataClient + LiveBroker(enabled=True, confirm=lambda:True)
    → ExecutionEngine.place(req, price)              ← 本模块：闸门二
        1) risk.check_circuit_breaker → 触发则拒单并记事件
        2) risk.check_order          → 四道检查顺序 + 拒绝原因文案（`no available margin room` 等）
        3) broker.open|close           ← LiveBroker._gate() 重复校验，PermissionError → rejected（filled=False）
    → ExecutionResult{approved,filled,reason,decision,position 的 margin/notional/leverage/adds}
```

```
熔断保护性平仓
  调度任务 run_circuit_breaker(cycle, store, settings)
    → ExecutionEngine.enforce_circuit_breaker(portfolio)  ← 本模块，返回应平集合
    → 逐 symbol 取 store 最新收盘定价（无价则记告警并跳过） ← 跨模块 src_data_store
    → ExecutionEngine.close(...)                          ← 本模块
    → AgentCycle.close_position → 反思与 journal 写入      ← 跨模块 src_agent_orchestration
```

## 实现约束清单

### 必须定义的常量/枚举

| 标识符 | 值 | 所在文件 | 说明 | 约束由来 |
|-------|----|---------|------|---------------------|
| `margin_pct` | `0.05` | `risk.py:RiskConfig` | 意图保证金 = 权益×比例 | `risk-config` 默认值（保证金/回撤/杠杆/加仓/单币种） |
| `max_drawdown_pct` | `0.15` | `risk.py` | 组合回撤熔断阈值 | 同上 |
| `max_leverage` | `100.0` | `risk.py` | 杠杆上限（超出为**钳制**而非拒绝） | 同上 |
| `max_adds` | `3` | `risk.py` | 单币种加仓次数上限（达到即**硬拒绝**） | 同上 |
| `max_symbol_margin_pct` | `0.05` | `risk.py` | 单币种保证金上限 | 同上 |
| 取值校验 | 三个比例 ∈ (0,1]、`max_leverage>=1`、`max_adds>=0` | `risk.py:__post_init__` | 非法配置直接构造期抛错；配置持久化复用同一构造器校验 | `risk-config` + `config-persistence` |
| `BrokerError` / `PermissionError` | 两类语义严格区分 | `execution.py` | live 闸门不过 → `PermissionError` → 返回 `approved/filled=False`；上游下单失败 → `BrokerError` 冒泡，由接口层译为 502 | `live-safety` + `execution-core` |

### 必须实现的函数 / 不可省略的行为

| 函数 | 所在文件 | 说明 |
|---|---|---|
| `size_position()` | `risk.py` | 杠杆钳制与两级上限缩减 MUST 经它；**不得用常量直接算出 margin/notional 绕过**（`clamped` 与 `reason` 是前端与日志的可解释性来源） |
| `RiskEngine.check_order()` | `risk.py` | 四道闸门顺序不可重排，且 MUST 在校验 `approved` 后才进入 broker |
| `ExecutionEngine.place()` | `execution.py` | 全系统唯一合法下单入口：`place → risk.check → broker` |
| `settle_close()` | `execution.py` | 平仓结算 MUST 用 `settle_close` 语义（含 `peak_equity = max(...)` 的单调更新、以及无持仓时的 `0.0` 返回），纸面与实盘共用 |
| `check_circuit_breaker()` | `risk.py` | 熔断比较用 `>=`；未触发时仍返回当前回撤值供展示 |

**设计决策（选型记录）**

- **仓位单位**：用「margin / notional 记账口径」，下单时向 MCP 换算 `size = notional / price`，**不直接以币数量为单位**。改动会导致闸门口径与市场实际占位不一致。
- **熔断后的行为**：只「阻断新开仓 + 返回应平集合 + 记 `circuit_breaker` 事件」，**不在风控层自己平仓**，避免风控逻辑耦合交易所执行。且熔断执行 MUST NOT 被 kill-switch 阻断——保护性平仓与自动下单属不同语义。
- **平仓盈亏**：`direction = 1.0(long) / -1.0(short)`，`pnl = notional*(exit_price-entry_price)/entry_price*direction`，`equity += pnl`、`peak_equity = max(peak_equity, equity)`、随后移除持仓。

## 边界

- ✅ 可新增 broker（实现 `Broker` Protocol 即可，如接入其他模拟撮合），可新增风控项（须同时补 `OrderDecision.reason` 文案与单测）。
- ❌ 禁止绕过熔断/风控直连交易所；禁止为实盘下单放宽闸门：live **同时**满足两个条件才成交——`RunControl.paper_only=False`（显式开启）AND `confirm()` 通过（二次确认）。实盘 MUST 经 `bitget-agent-mcp` 的 `order` 工具。
- ❌ 禁止让事件日志成为故障源：`EventLog.append` 内部捕获并只记 warning；写失败也不得影响闸门结论。
- ❌ 禁止改 `_FILL_PRICE_KEYS` 的回退语义：响应中解析不到成交价时必须用传入价结算；`McpDataClient.call_tool("order", …)` 的 category MUST 随下单品类正确取值。
- ❌ 禁止把 `LiveBroker` 当成「已支持撤单改单」：当前 `action` 只用 `place`（撤单/改单未实现）。

## 变更风险

| 改动 | 破坏什么 | 后果 |
|---|---|---|
| 改 `PaperBroker` 的均价/计数路径：加仓用加权平均 `(existing.entry_price*existing.notional + price*decision.notional)/total` 并 `adds+=1` | `max_adds` 的计数口径（首仓 adds=1）与 `settle_close` 的盈亏基准 | 加仓被误拒，或 PnL 偏离纸面账户 |
| 把 `drawdown_pct` 的分母改用当前权益而非 `peak_equity` | 熔断阈值语义（回撤按峰值口径）；且 `peak_equity` 只升不降 | 该熔断时不熔断 |
| 把熔断改为「阻断一切交易」 | **`ExecutionEngine`/`check_order` 本身不读 kill-switch**；kill-switch 只在 `webapi` 与 `orchestration` 的 `_agent_job` 层判定，因此「熔断中仍允许平仓」是刻意的 | 熔断中无法平仓，风险敞口无法释放 |
| 让 `enforce_circuit_breaker` / 定时熔断任务受 kill-switch 影响 | 保护性平仓 MUST 始终可执行（与 `can_trade()` 无关）；若被阻断则敞口无法释放 | 熔断后敞口无法释放（与规格相违） |
| 在 MCP 不可用时静默回退到纸面 | 实盘语义的一致性；静默降级比失败更危险 | 用户以为已实盘；`backend/tests/test_webapi.py`（`status=="error" and "forbidden" in error`）会失败 |

## 附：OpenSpec 摘要

> 📋 本节内容来源于 OpenSpec：`openspec/`（仅提炼约束与边界要点，非完整转录）

- **闸门顺序是规范级要求，不是实现细节**：执行任何订单前 MUST 先过熔断检查、再过下单风控校验，任一不通过 MUST 拒绝且不得下单；决策为 open 但风控拒绝（无额度、加仓超限、熔断）时 MUST 返回「未成交」而不调用任何下单，决策为 hold MUST 不产生订单。（来源: `openspec/specs/execution-core/spec.md`、`openspec/specs/agent-execution/spec.md`）
- **四道检查的先后与可解释性**：顺序覆盖「杠杆上限 → 单币种加仓次数上限 → 单币种保证金上限 → 组合总保证金上限」，结果 MUST 可解释为**通过 / 缩减 / 拒绝**三态并附原因——「缩减」与「拒绝」是两种不同结论，MUST NOT 合并为布尔。（来源: `openspec/specs/risk-checks/spec.md`）
- **全仓测算口径**：保证金 = 权益 × 保证金比例（意图值），名义敞口 = 杠杆 × 保证金；意图杠杆超上限时 MUST **钳制后测算并标记已钳制**（不是拒单）；新增保证金使总占用越界时 SHALL 缩减至上限内，无可用额度时返回 `margin=0`（等价拒绝）。（来源: `openspec/specs/position-sizing/spec.md`）
- **默认值与安全校验成对出现**：保证金 5% / 最大回撤 15% / 杠杆上限 100 / 加仓上限 3 / 单币种保证金 5%，均 MUST 可由用户调整，且配置 MUST 校验取值（比例 >1 或杠杆 <1 之类非法值直接拒绝）。这使「改默认」与「加校验」必须同步进行。（来源: `openspec/specs/risk-config/spec.md`）
- **熔断 MUST 先于爆仓**：回撤按 `peak_equity` 口径；全仓下 SHALL 同时给出「爆仓价逆向距离」与「熔断价逆向距离」的估算，且 MUST 保证熔断触发距离严格小于爆仓距离。这是回撤阈值不得随意调高的量化理由。（来源: `openspec/specs/drawdown-circuit-breaker/spec.md`）
- **熔断执行的三条禁令 + 一条幂等**：触发时按各自最新可得 store 收盘价保护性平掉**全部**持仓并逐笔写含盈亏与反思的交易日志；某持仓无可用价格时 SHALL 记录告警并跳过该标的，MUST NOT 中断其他标的平仓；SHALL NOT 新开任何仓位；SHALL NOT 被 kill-switch 阻断；同一持仓 MUST NOT 被重复平仓（幂等）。（来源: `openspec/specs/circuit-breaker-enforcement/spec.md`）
- **PnL 与权益更新对所有 broker 语义一致**：`direction = 1.0`(long) / `-1.0`(short)，`pnl = notional * (exit - entry) / entry * direction`，随后 `equity += pnl`、`peak_equity = max(peak_equity, equity)` 并移除持仓；目标标的无持仓时 MUST 返回 `0.0` 且 MUST NOT 改动 `equity`/`peak_equity`。（来源: `openspec/specs/execution-core/spec.md`、`openspec/specs/paper-broker/spec.md`）
- **执行层错误的可判别性**：broker（含 MCP `order` 调用）失败 MUST 包装为可判别的执行层错误，MUST NOT 以未处理异常形式冒成 500，上层 API SHALL 译为结构化 JSON + 合适 5xx；而实盘闸门（未开启/未确认）导致的拒绝 MUST 保持为**执行结果的拒绝**（`filled=false`），与传输失败严格区分。（来源: `openspec/specs/execution-core/spec.md`）
- **实盘双条件与 MCP 唯一通道**：未显式开启实盘时所有订单 MUST 走纸面、不触及真实账户；实盘执行 MUST 同时满足「显式开启」AND「二次确认通过」，且 MUST 经 `bitget-agent-mcp` 的 `order` 工具（long→buy、short→sell）。平仓 MUST 提交 **reduce-only 市价单**，`size = notional / price`；结算价优先取 MCP 响应中可解析的实际成交价，解析不到时用传入平仓价（MUST NOT 因缺成交价而失败）；MCP 平仓调用失败时 MUST NOT 移除持仓或改动权益，并抛出可判别错误供重试。（来源: `openspec/specs/live-safety/spec.md`）
