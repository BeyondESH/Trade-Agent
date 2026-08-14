## Context

路线图 design D3 已定风控模型:全仓、占用保证金 ≤ 权益 5%(可配)、单笔/组合回撤 15%(可配)、杠杆可拉满。数学结论:全仓下 100x、50u 保证金、5000u 敞口于 1000u 权益,爆仓约需逆向 ~20%,而 15% 权益回撤熔断 ≈ 逆向 ~3%,**熔断远早于爆仓**。本 change 把该模型落成可复用、可测的引擎,是执行层(#4)下单前的强制闸门。

## Goals / Non-Goals

**Goals:**
- 可配置风控参数,安全默认,全部可调。
- 确定性仓位测算(保证金/敞口)与上限钳制。
- 下单前多项校验,返回可解释决策(通过/缩减/拒绝 + 原因)。
- 回撤熔断 + 「熔断先于爆仓」的定量保证。

**Non-Goals:**
- 不与交易所交互(下单/持仓同步属 #4)。
- 不含逐仓逻辑(全仓)。
- 不做策略/信号/LLM(#5)、不做前端(#9)。

## Decisions

### D1:配置模型 `RiskConfig`
纯 dataclass(可从环境/前端注入),字段与默认:
- `margin_pct=0.05`:占用保证金合计上限(占权益)。
- `max_drawdown_pct=0.15`:单笔/组合回撤熔断阈值。
- `max_leverage=100`:杠杆上限。
- `max_adds=3`:单币种加仓次数上限。
- `max_symbol_margin_pct=0.05`:单币种占用保证金上限(占权益)。
全部可调;校验范围(0<pct≤1,leverage≥1)。

### D2:仓位测算(全仓)
- `notional = leverage * margin`,`margin = equity * margin_pct`(意图值)。
- 钳制:杠杆 → min(intended, max_leverage);保证金 → 使「新增后总占用保证金 ≤ margin_pct·equity」且「单币种 ≤ max_symbol_margin_pct·equity」;不足以下单时返回 0(拒绝)。
- 输出 `Sizing(margin, notional, leverage, clamped: bool, reason)`。

### D3:下单校验 `RiskEngine.check_order`
输入意图单(symbol, side, intended_leverage, intended_margin 或按 margin_pct)+ 当前 `Portfolio`。顺序校验:
1. 杠杆 ≤ 上限(否则钳制)。
2. 单币种加仓次数 < max_adds(否则拒绝)。
3. 单币种占用保证金 ≤ 上限(否则缩减)。
4. 组合总占用保证金 ≤ 上限(否则缩减/拒绝)。
返回 `OrderDecision(approved, margin, notional, leverage, reason)`。

### D4:回撤熔断与「熔断先于爆仓」
- `Portfolio` 跟踪 `equity`、`peak_equity`、`positions`。
- `drawdown_pct = (peak_equity - equity)/peak_equity`;≥ `max_drawdown_pct` → `circuit_breaker=True`(应平掉相关/全部仓位)。
- 定量保证:对某敞口,权益回撤 d 对应价格逆向 `move = d*equity/notional`;全仓爆仓 ≈ `equity/notional`。故 `stop_move/liq_move = max_drawdown_pct`(<1),**熔断必早于爆仓**。提供 `liquidation_move_pct` 与 `stop_move_pct` 及断言其关系的函数。

### D5:接口
- `risk.py`:`RiskConfig`、`Position`、`Portfolio`、`size_position(...)`、`RiskEngine.check_order(...)`、`RiskEngine.check_circuit_breaker(portfolio)`、`liquidation_move_pct`/`stop_move_pct`。
- 可选 CLI `risk-check` 演示:给定 equity/leverage 输出测算与决策。

## Risks / Trade-offs

- **爆仓公式为近似**(忽略维持保证金/资金费/手续费) → 标注为保守估计;实际维持保证金会让爆仓更早,但 15% 熔断仍显著早于爆仓,结论稳健。
- **全仓连锁**:多仓共享权益,单仓浮亏拖累整体 → 组合级回撤熔断覆盖此风险;加仓次数与单币种敞口上限限制集中度。
- **参数误配**(如 margin_pct 过大) → 配置校验范围 + 保守默认。

## Open Questions

- 回撤基准用「权益峰值」还是「起始权益」?默认用峰值(更严格),可配。
- 熔断动作是平相关仓位还是全平?本 change 只产出熔断信号与建议,具体执行在 #4。
