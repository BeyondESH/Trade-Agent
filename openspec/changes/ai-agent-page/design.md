## Context

路线图 `ai-trading-system-roadmap` 定义了双大脑系统,但 `web-frontend` change 未交付 AI Agent 页面。现状:

- **后端能力已齐备**: `dlquant.py`(特征→logreg→信号→回测)、`agent.py` + `orchestration.py`(AgentCycle)、`memory.py`(RAG/反思)、`webapi.py`(`/agent/decide`、`/agent/cycle`、`/backtest`、`/portfolio`、`/journal`、`/config`、`/control`)。
- **前端 API 封装已就绪**: `api.backtest/job/agentDecide/agentCycle/portfolio/journal/getConfig/putConfig`。
- **缺口是 UI**: `DesktopViewMode` 无 `agent` 类型,`GlobalNavRail` 无入口,无任何消费上述端点的页面。
- `App.tsx` 存在零调用者的死代码 `handleRunStrategy`(backtest 入口),以及已下传 `BottomDock` 的 `backtestResult` state——可作为接线锚点。
- **数据盘实况**(BTCUSDT): 1h/4h/1d 稠密(≥300 文件),5m 稀疏(8 文件,中间有洞),1m 薄(10 文件,近 3 个月)。DL 引擎锚定 5m 但盘面数据不满足,页面按周期展示可用性。
- 前端无独立图表库(仅 `klinecharts-pro` K线 + 内联 SVG 先例),无 scipy 依赖。

## Goals / Non-Goals

**Goals:**
- 交付 `agent` 视图,接入桌面外壳(视图类型、导航、路由、标题映射、命令面板)。
- `AgentView` 双 Tab: DL 量化工作台(回测 + 曲线 + 因子管理 + IC)与 Agent 行情分析(决策/循环/组合/日志/配置)。
- 因子体系可配置化: 预设目录 + 白名单表达式 DSL,持久化到 `/config`,`build_features` 按配置构造特征。
- 回测输出曲线化: 权益/回撤/信号/概率序列对齐时间戳返回,前端内联 SVG 渲染。
- **后端向后兼容**: `run_pipeline(df)` 缺省行为与现状完全一致;`/backtest` body 扩展为可选参数。

**Non-Goals:**
- 真 HFT(1s/1m 在线重训、亚秒级下单);页面不做实盘下单(默认纸面)。
- 因子参数自动寻优(如 RSI 周期扫描);只做「选因子 → 训练 → 回测」。
- 数据回填自动化;页面只提示可用性,回填走既有 `/candles/backfill`。
- Tab2 的反思/记忆**可视化**(RAG 命中详情、规则库编辑器);本期只展示决策/循环/组合/日志。
- 引入新图表依赖或 scipy。

## Decisions

### D1: 页面集成方式 —— 新增 `agent` 视图类型,AgentView 自管理状态

`DesktopViewMode` 增加 `'agent'`;`GlobalNavRail` 增加入口(图标 `Bot`/`BrainCircuit`);`App.tsx` 工作区路由增加 `activeView === 'agent'` 分支;`handleNewTab`/`handlePromoteTab` 标题映射 `'AI Agent'`。`AgentView` 接收 `symbols` + `theme` props,内部自管理标的/周期选择(不污染全局 `activeSymbol`,避免与图表 tab 互相干扰),可回调 `onOpenChartWithTicker` 跳转图表。

**备选**: 复用全局 `activeSymbol`。放弃——页面内选 1m 与图表选 1h 会互相覆盖,职责耦合。

### D2: 回测输出曲线化 —— 加法扩展返回结构,不破坏标量

`dlquant.backtest()` 现内部已算 equity/position/gross/cost,仅丢弃。改造为返回 `(metrics, series)`,`series` = {open_time[], equity[], drawdown[], signal[], proba[]}(对齐 `test_df` 的 `open_time`)。`run_pipeline()` 在现有标量键**之外**增加 `series` 与 `data_meta`(n_train/n_test/日期范围)键,现有键名与值不变。`webapi._run_backtest` 直传 `run_pipeline(df)` 的返回值,因此 `/jobs/{id}` 结果自动带曲线,前端无需新端点。

**备选**: 新端点 `/backtest/result`。放弃——jbo 轮询已存在,加法扩展零成本。

### D3: 因子配置模型 —— 可选参数,缺省即现状

```
FactorDef = {
  id: str,            # 唯一标识,如 "rsi_14"
  name: str,          # 展示名
  kind: "preset"|"expr",
  fn: str,            # preset: 目录 id;  expr: 忽略
  params: {k: number} # preset 参数
  expr: str,          # kind=expr 时有效,如 "log(close / sma(close, 20))"
  enabled: bool,
}
```
`build_features(df, factor_defs: list[FactorDef] | None = None)`:`None` → `DEFAULT_FACTORS`(现 7 个因子转成 preset 定义,保持逐字节一致)。`/backtest` body 增加可选 `factors` + `params`(train_ratio/threshold/fee/slippage),缺省走默认。

### D4: 因子目录 + 白名单表达式 DSL(新模块 `factors.py`)

- **目录**: `FACTOR_CATALOG = {id → {name, fn(df, params)→Series, default_params}}`。首批: 现 7 因子 + RSI(n)、ATR(n)、vol_ratio(n)(volume/roll_mean)、mom(n)。`fn` 放 `indicators.py`。
- **表达式**: 用 `ast.parse` + 自定义 `NodeVisitor` 白名单求值(新模块 `factors.py`):
  - 允许: 数字、列名(open/high/low/close/volume + 预计算指标列)、算术 `+ - * / % ( )`、一元负号、白名单函数。
  - 白名单函数(全部为对 pandas Series 的安全封装): `sma/ema/std/pct/rsi/max/min/shift/log/abs/atr/vol_ratio`。
  - 拒绝(抛出 `ValueError`): `__`、`.` 方法链、`[ ]`、`;`、`=`、`:`,字符串字面量、`import`、`lambda`、任何非白名单名字。
  - 结果用受限 `eval`(globals 仅含列/函数映射)计算,确定性、无任意代码执行。
- `dlquant.build_features` 通过 `factors.py` 解析 factor_defs → 因子列;行级非有限值 drop 行为不变。

**备选**: 直接 `pandas.eval`。放弃——`.rolling()` 方法链不兼容且无法白名单管控,安全与表达能力双输。结构化 op+params JSON(无表达式)——表达能力不足,用户明确要「自定义」。

### D5: 因子分析端点 `POST /dl/features`

body = SeriesBody + 可选 factors。服务端: 读 df → 按配置构造特征 → 计算方向标签(同 `build_features`)→ 对每个因子算 `ic`(Spearman 秩相关,用 pandas `.corr(method="spearman")`,纯 numpy 实现,无 scipy)、`ic_abs`、`mean`、`std`、`coverage`(非 NaN 比例)、`last_value`。返回 `{factors: [...], n_rows, start, end}`。IC 在全部有效行上计算(帧 < 100k 行,秩相关可接受)。

### D6: 配置持久化 —— `/config` 增加 `factors` 段

`config.json` 新增 `factors: FactorDef[]`。加载时缺键 → 默认因子集(兼容旧配置文件);前端因子管理面板经 `api.getConfig`/`api.putConfig` 全量读写(与现有 provider/risk 段同机制,不新增端点)。

### D7: 前端结构 —— 自包含双 Tab,曲线用内联 SVG

```
components/views/AgentView.tsx
  ├─ AgentTabs                        # 本地 state: 'dl' | 'agent'
  ├─ DlQuantTab/
  │   ├─ DataAvailability.tsx         # /candles 一次采样 → bar 数/日期范围/稀疏警告
  │   ├─ BacktestControls.tsx         # 标的/周期(1m/1h/4h/1d, 默认1h)/训练参数 + Run(轮询 /jobs)
  │   ├─ MetricCards.tsx              # total_return/max_drawdown/win_rate/trades/bars
  │   ├─ SeriesChart.tsx              # 通用内联 SVG: 权益 + 回撤双区(沿用 Sparkline 先例)
  │   ├─ FactorManager.tsx            # 因子列表(开关)/目录添加/表达式添加/删除 → /config
  │   └─ FactorIcTable.tsx            # 调 /dl/features → IC 排序表 + 覆盖率
  └─ AgentAnalysisTab/
      ├─ DecisionPanel.tsx            # decide → AgentDecision 卡片(action/side/价位/理由/置信)
      ├─ CyclePanel.tsx               # cycle → 执行结果
      ├─ PortfolioPanel.tsx           # /portfolio + /journal 列表
      └─ AgentConfigPanel.tsx         # provider/risk/system_prompt/manual_rules 表单 → /config
```

`SeriesChart` 泛化 MarketsView 的 `Sparkline` 为可复用的 path 绘制组件(多序列、Y 归一、填充区),不引依赖。

## Risks / Trade-offs

- **表达式 DSL 注入面** → 白名单 AST NodeVisitor 双保险(解析期拒绝 + 受限 eval);对拒绝样例(含 `__`/`import`/方法链)写单元测试锁定。
- **向后兼容破裂** → `run_pipeline(df)` 缺省路径行为不变,加法扩展返回 dict;为当前 7 因子行为加「快照测试」(固定数据+超参,断言指标不变)。
- **5m 盘面稀疏** → 默认周期 1h;DataAvailability 面板展示 bar 数与日期范围,5m 不入选周期列表(数据回填后可加回)。
- **内联 SVG 交互有限**(无缩放/平移) → 指标卡+曲线足以支撑回测结论;klinecharts-pro 不复用,保持 AgentView 自包含、不牵动图表生命周期。
- **`/config` 全量读写频繁** → 配置量小,PUT 已存在;因子面板仅保存时提交一次。
- **`/dl/features` 大帧秩相关耗时** → 帧 <100k 行,秩相关 O(n log n);若未来超限可加采样/分桶(本期不做)。

## Migration Plan

1. 后端先行(独立可测): `factors.py` → `dlquant` 因子化 + 曲线序列 → `webapi` 端点扩展 → 配置段 → 单测/快照测试。
2. 前端随后: `api/client.ts` 类型与方法 → `AgentView` 骨架 + 导航接线 → Tab2(纯消费现有端点)→ Tab1(曲线→因子管理→IC)。
3. 无数据迁移(`/config` 加法字段);旧前端 + 新后端、新前端 + 旧后端均可运行(端点/参数均向后兼容)。
4. 回滚: 按任务粒度 revert 提交即可,无 schema 变更。

## Open Questions

- 因子参数自动寻优(周期扫描)是否进入后续迭代 —— 默认不做,Non-Goal。
- Tab2 是否需要展示反思/规则库详情 —— 本期只做基础展示,可视化留给后续 change。
- 5m 数据回填后是否将 5m 加回周期列表 —— 届时作为 catalog/时间周期选项补充,不阻塞本 change。
