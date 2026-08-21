## Context

QUANT LAB 当前是 sklearn + vectorbt 的"窄管道":因子集 → 固定默认参数的模型 → 阈值 → 固定 fee/slippage → 固定输出。后端能力远超 UI 暴露面——scikit-learn 的 `**kwargs` 透传通道存在但 webapi 不传任何超参;`pf.stats()`、逐 bar series、trade_list 已经返回,但 `coef_`/`feature_importances_`/ROC 曲线/基准序列从未吐出。前端交互停留在裸数字输入框,无引导、无预设、错误被静默吞掉(见 proposal)。本次改动把 QUANT LAB 升级为完整交互式量化工作台,让用户通过 UI 完整使用后端量化框架。

已确认的需求决策:参数滑杆化 + 4 套预设模板(稳健 lr / 激进 lr / HGB 快速 / 自定义);QUANT LAB 内新增**自包含** `KLineChartProView` 模块(不与主界面 K 线联动);回测完成后自动切换到"信号K线" tab;后端改动可接受。

## Goals / Non-Goals

**Goals:**

- 暴露 sklearn 模型超参(lr: C/max_iter/solver;hgb: max_depth/learning_rate/min_samples_leaf)与回测执行参数(init_cash/size/fee/slippage),全部滑杆化 + 预设模板化
- 4 套预设模板一键切换,任一参数偏离模板自动降级为"自定义"
- QUANT LAB 内独立 K 线模块:显示当前 symbol/timeframe 行情 + 回测买卖点 overlay 标记
- 模型诊断可视化:ROC 曲线(AUC)、特征权重条形图(lr `|coef_|` / hgb `feature_importances_`)
- 曲线增强:权益 vs buy&hold 基准、proba + 阈值带、月度收益年×月热力图
- 修复 `result.error` 静默吞掉与 legacy 历史回看空态

**Non-Goals:**

- 不做实时交易/下单入口
- 不修改主界面(Dashboard 等)现有 K 线图行为,不与主图做联动
- 不做跨标的组合优化/多标的统一回测
- 不引入新的前端图表库(复用 klinecharts/recharts)

## Decisions

### D1: 预设模板系统(前端静态定义,状态驱动降级)

模板是前端常量,定义完整参数快照:

```ts
interface ModelPreset {
  id: "conservative-lr" | "aggressive-lr" | "hgb-fast" | "custom";
  label: string;                 // 稳健 lr / 激进 lr / HGB 快速 / 自定义
  model: "lr" | "hgb";
  params: BacktestParams;        // 含超参: C, max_iter, solver | max_depth, learning_rate, ...
  backtest?: { init_cash?: number; size?: number; fee?: number; slippage?: number };
}
```

- 当前参数快照与某模板全等 → 显示该模板选中;任一字段不等 → `custom`
- 备选:模板由后端 `/config` 存储。否——模板是 UI 层交互概念,后端只消费参数值;静态定义免去接口往返,后续可平滑升级为可持久化。

### D2: 滑杆 + 数字输入双模式

Radix `Slider` + 原生 number input 同步(单一状态源)。滑杆适合连续小范围(fee/slippage/C),输入框用于精确值(init_cash/max_iter)。沿用现有 `--tv-*` 主题 token,不做硬编码色。

### D3: 独立 K 线模块(自包含,不联动主图)

- 复用 `KLineChartProView`,传入 `symbol`/`period` 由 QUANT LAB 参数条派生,`datafeed` 用 `useMemo(() => new BitgetDatafeed(), [])` 独立实例(参照 `NativeChart.tsx:77`),避免与主界面共享 WS 订阅。
- 买卖标记通过 `onReady(chart)` 拿到的 `Chart` 实例调用 `createOverlay`:多单(entry)与空单(exit)用 `mark` 图元,分别置于 K 线下方/上方,颜色沿用 `#089981`(多)/`#f23645`(空)。
- overlay 由 `signal==1 / signal==-1` 序列映射,时间戳对齐 `series.open_time`。
- 备选:在 QUANT LAB 内用手写 SVG 轻量 K 线。否——复用成熟组件获得缩放/十字线/指标能力,成本最低。

### D4: 后端参数透传白名单

webapi 增加 `_MODEL_PARAM_KEYS`(`C`/`max_iter`/`solver`/`max_depth`/`learning_rate`/`min_samples_leaf`)与 `_BACKTEST_MONEY_KEYS`(`init_cash`/`size`),与现有 `_BACKTEST_PARAM_KEYS` 模式一致,校验后透传:

- 模型超参 → `SklearnModel(kind=..., **kwargs)`(`dlquant.py:70` 已支持 `**kwargs`)
- 资金/仓位 → `vbt.Portfolio.from_signals(init_cash=..., size=...)`(`dlquant.py:214`)

前端 `BacktestParams`/`api/types.ts` 同步扩展。

### D5: 后端新增输出字段(全部是"已有能力未吐出")

| 字段 | 来源 | 说明 |
|---|---|---|
| `result.feature_weights` | lr: `np.abs(clf.coef_[0])`;hgb: `clf.feature_importances_` | 特征名对齐 `FEATURE_COLUMNS` |
| `result.roc_curve` | `sklearn.metrics.roc_curve(y_test, proba)` | `{fpr[], tpr[]}`,前端画曲线 + AUC(现有 `roc_auc`) |
| `series.benchmark` | vectorbt:`close / close[0]` | 与 equity 等长,作为权益曲线基准 |

新字段全为**可选**(前端缺失时降级隐藏),保证旧后端/旧历史记录兼容。

### D6: 错误透出与自动跳转

- `QuantLabPanel.run()`:job done 后检测 `job.result?.error`,非空则 `setError(...)` 并保留空态,不再静默。
- 回测成功完成后 `setActiveTab("signals")`,用户第一眼看到买卖点。Tab 状态从本地 `useState` 提升为可在 run 完成后编程切换(现有 `Tabs defaultValue` 改为受控 `value` + `onValueChange`)。

### D7: 月度收益热力图

现有月度柱状图(`EconCharts.tsx:86`)升级为年×月格子热力图(收益为负红/为正绿,参照 TradingView 风格),沿用 `monthlyReturns()` 数据源,保留柱状图作为切换视图(默认热力图)。

## Risks / Trade-offs

- **vectorbt 资金/仓位改动影响现有断言** → `init_cash`/`size` 默认值与当前行为一致(`init_cash=1_000_000`、`size` 默认),后端测试沿用默认快照;仅在显式传入时生效。
- **KLineChartProView 双实例并存**(主图 + QUANT LAB) → QUANT LAB 使用独立 `BitgetDatafeed` 实例(useMemo 单例),两实例互不共享订阅;复用组件已内置 StrictMode 双挂载防护。
- **overlay 与 datafeed 历史加载冲突** → 标记用 `mark` overlay 而非 indicator;`onReady` 在首次渲染完成后叠加,历史向后加载不重建 overlay(标记锚定时间戳)。
- **hgb `feature_importances_` 需模型为树模型** → lr 分支读 `coef_`、hgb 分支读 `feature_importances_`,前端按 `model_weights.kind` 渲染条形图,缺失显示空态。
- **response 体积增大**(roc_curve 数百点、benchmark 与 equity 等长) → 与现有 `series` 同量级,且 history 降采样沿用 `MAX_SERIES_POINTS` 通道;可接受。
- **月度热力图是破坏性视觉变更** → 保留柱状图切换按钮,默认热力图,用户可回退。

## Migration Plan

1. 后端先行:`dlquant.py` 输出新字段 + `webapi.py` 白名单透传,跑 `test_dlquant.py`/`test_webapi.py` 回归(新字段可选,旧断言不受影响)。
2. 前端类型层:`api/types.ts` 扩展 `BacktestParams`/`BacktestJobResult`/`BacktestSeries`。
3. 前端组件按依赖序接入:`ModelPanel`(预设+滑杆)→ `BacktestControls` 滑杆化 → `SignalKLineChart` → `ModelDiagnostics` → 曲线增强 → sweep/walkforward/IC 增强 → 修复与自动跳转。
4. 全量回归:后端 `python -m pytest -q`、前端 `npm run test && npm run typecheck`、L3 `npm run test:e2e`。
5. 回滚:所有新字段与控件可选;`result.error` 修复与自动跳转为纯前端改动,无数据层迁移。

## Open Questions

- 信号 K 线 overlay 是否支持点击标记联动开单明细 tab / 高亮对应交易?(建议本期做基础版:标记可见即可,联动留待后续)
- 新输出字段是否同步持久化到 `backtest_history.py`(建议是,与现有 series/trade_list 一致,便于历史回看完整呈现)?
