## 1. 后端: 因子系统

- [x] 1.1 新建 `backend/src/market_data/factors.py`:`FactorDef` dataclass、`DEFAULT_FACTORS`(现 7 因子转 preset 定义)、`FACTOR_CATALOG`(含 rsi/atr/vol_ratio/mom 及既有 7 因子)
- [x] 1.2 `indicators.py` 增加目录函数:`rsi(close, n)`、`atr(high, low, close, n)`、`vol_ratio(volume, n)`、`mom(close, n)`(无前视、返回 NaN 而非抛错)
- [x] 1.3 `factors.py` 实现白名单表达式求值器:`ast.parse` + `NodeVisitor`,仅允许数字/列名/算术/白名单函数(`sma/ema/std/pct/rsi/max/min/shift/log/abs/atr/vol_ratio`)
- [x] 1.4 求值器拒绝用例:`__`、方法链 `.`、`[` `]`、`;`、`=`、字符串字面量、`import`、未知函数 → 抛 `ValueError` 且不执行

## 2. 后端: dlquant 因子化与曲线序列

- [x] 2.1 `dlquant.build_features(df, factor_defs=None)` 按配置构造特征;`None` → 默认 7 因子,输出与现状逐列一致
- [x] 2.2 `dlquant.backtest()` 改为返回 `(metrics, series)`,`series` 含对齐 `test_df` 的 `open_time/equity/drawdown/signal/proba`
- [x] 2.3 `run_pipeline()` 接受 `factor_defs` 与 `params`(train_ratio/threshold/fee/slippage);返回字典**加法**扩展 `series` 与 `data_meta` 键,既有标量键与值不变
- [x] 2.4 缺省参数下 `run_pipeline(df)` 行为与现状完全一致(无 `factors`/`params` 传入时)

## 3. 后端: 端点与配置持久化

- [x] 3.1 `/backtest` body 增加可选 `factors` + `params`,`_run_backtest` 透传;缺省走默认
- [x] 3.2 新增 `POST /dl/features`(body = SeriesBody + 可选 factors):返回各因子 `ic`(pandas `corr(method="spearman")`)/`ic_abs`/`mean`/`std`/`coverage`/`last_value` + `n_rows/start/end`
- [x] 3.3 config.json 增加 `factors` 段;`appconfig`/`config` 加载缺键时回退默认因子集(兼容旧配置)
- [x] 3.4 `PUT /config` 透传 `factors`(全量读写,沿用现有机制)

## 4. 后端: 测试

- [x] 4.1 单测:表达式求值器——合法表达式计算正确、非法表达式抛 `ValueError`、相同输入两次结果一致
- [x] 4.2 快照单测:固定数据 + 固定超参下,默认 7 因子回测指标与改造前一致(锁定向后兼容)
- [x] 4.3 单测:自定义因子集训练——`build_features` 仅含所选列、曲线序列对齐时间戳、持仓下一根生效(无前视)
- [x] 4.4 单测:`/dl/features` IC 计算与覆盖率(含大量 NaN 因子仍列出)
- [x] 4.5 `cd backend && python -m pytest -q` 全量通过

## 5. 前端: API 客户端与类型

- [x] 5.1 `frontend/src/api/types.ts` 新增 `FactorDef`、`BacktestParams`、`BacktestSeries`、`FactorIc`、`DlFeaturesResponse`
- [x] 5.2 `frontend/src/api/client.ts`:`backtest` 支持可选 `factors`/`params`;新增 `dlFeatures`;`getConfig`/`putConfig` 复用现有方法
- [x] 5.3 类型检查:`cd frontend && npm run typecheck`

## 6. 前端: 页面骨架与导航接线

- [x] 6.1 `frontend/src/types/trading.ts`:`DesktopViewMode` 增加 `'agent'`
- [x] 6.2 `GlobalNavRail.tsx` 增加 AI Agent 入口(icon `BrainCircuit`/`Bot` + label)
- [x] 6.3 `App.tsx`:工作区路由增加 `activeView === 'agent'` 分支;`handleNewTab`/`handlePromoteTab` 标题映射 `'AI Agent'`
- [x] 6.4 新建 `frontend/src/components/views/AgentView.tsx`:双 Tab 骨架(本地 state `'dl' | 'agent'`,切换不丢状态),接收 `symbols` + `theme` props,自管理标的/周期选择

## 7. 前端: Tab2 Agent 行情分析

- [x] 7.1 `DecisionPanel`:选标的/周期 → `api.agentDecide` → 决策卡片(action/side/reference_price/reason/confidence)
- [x] 7.2 `CyclePanel`:`api.agentCycle` → 渲染执行结果(决策/风控闸门/持仓变化)
- [x] 7.3 `PortfolioPanel`:`api.portfolio` + `api.journal` → 权益/持仓/交易日志表格(含盈亏与原因)
- [x] 7.4 `AgentConfigPanel`:`api.getConfig`/`api.putConfig` 表单(provider/risk/system_prompt/manual_rules)

## 8. 前端: Tab1 DL 量化工作台

- [x] 8.1 `DataAvailability`:选中序列经 `/candles` 采样展示 bar 数/日期范围;bar < 500 显示稀疏警告
- [x] 8.2 `BacktestControls`:标的/周期(1m/1h/4h/1d, 默认 1h)+ 训练参数(train_ratio/threshold/fee/slippage)+ Run(调 `/backtest` + 轮询 `/jobs/{id}`)
- [x] 8.3 `MetricCards` + `SeriesChart`:指标卡(total_return/max_drawdown/win_rate/trades/bars)与内联 SVG 权益/回撤双曲线(沿用 MarketsView Sparkline 先例)
- [x] 8.4 周期列表限定 1m/1h/4h/1d;参数变更重跑时替换上一次结果

## 9. 前端: 因子管理

- [x] 9.1 `FactorManager`:因子列表(启用开关)/目录添加(preset + 参数)/表达式添加(`kind: "expr"` + 校验错误展示)/删除 → `api.putConfig` 持久化
- [x] 9.2 `FactorIcTable`:调 `api.dlFeatures` → 可排序 IC 表(ic/ic_abs/coverage/last_value)

## 10. 验证与回归

- [x] 10.1 `cd frontend && npm run typecheck && npm run test && npm run build` 全部通过
- [x] 10.2 手动冒烟:启动后端 + `npm run dev`,进入 AI Agent 页完成一次回测(默认因子)与一次 `agent/decide`、`agent/cycle`
- [x] 10.3 全量回归 `cd backend && python -m pytest -q` 通过
