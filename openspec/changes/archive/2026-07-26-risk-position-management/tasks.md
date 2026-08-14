## 1. 配置

- [x] 1.1 `risk.py`:`RiskConfig` dataclass(margin_pct/max_drawdown_pct/max_leverage/max_adds/max_symbol_margin_pct)+ 默认
- [x] 1.2 配置范围校验(0<pct≤1,leverage≥1),越界报错

## 2. 数据模型

- [x] 2.1 `Position`(symbol/side/margin/notional/entry_price/leverage/adds)
- [x] 2.2 `Portfolio`(equity/peak_equity/positions)+ 已用保证金合计、单币种保证金查询

## 3. 仓位测算

- [x] 3.1 `size_position(equity, intended_leverage, config, portfolio, symbol)`:敞口=杠杆×保证金
- [x] 3.2 杠杆钳制到上限
- [x] 3.3 保证金钳制到总额/单币种上限,无额度返回 0

## 4. 下单校验

- [x] 4.1 `RiskEngine.check_order`:杠杆→加仓→单币种→组合 顺序校验
- [x] 4.2 返回 `OrderDecision(approved, margin, notional, leverage, reason)`

## 5. 回撤熔断

- [x] 5.1 `check_circuit_breaker(portfolio)`:按峰值算回撤,达阈值触发
- [x] 5.2 `liquidation_move_pct`/`stop_move_pct` 及断言 stop<liq(比例=回撤阈值)

## 6. CLI(可选演示)

- [x] 6.1 `risk-check` 子命令:给定 equity/leverage 输出测算与决策

## 7. 测试

- [x] 7.1 测算:1000/100x/5% → 保证金 50、敞口 5000
- [x] 7.2 杠杆超限钳制;保证金超总额/单币种上限缩减或拒绝
- [x] 7.3 加仓次数超限拒绝;组合无额度拒绝
- [x] 7.4 熔断:回撤达阈值触发、未达不触发
- [x] 7.5 熔断先于爆仓:stop_move < liq_move 且比例=max_drawdown_pct
- [x] 7.6 配置越界报错
