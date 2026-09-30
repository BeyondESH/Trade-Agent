---
type: "Fragment"
id: frontend/src/quant_lab
title: "量化研究工作台的薄前端"
description: "回测/参数扫描/Walk-forward/因子/信号K线/历史这些面板点了按钮之后到底发什么请求、状态如何保持、哪些字段口径必须与后端一致？"
parent: /frontend/src/_overview.md
fragment: quant_lab
entity_names:
  constants:
    - name: DL_TIMEFRAMES
      source: frontend/src/components/views/agent/BacktestControls.tsx:8
      value: "14 项（1m…1mo，**不含 1s**）；注释写明「mirrors backend models.VALID_TIMEFRAMES」"
    - name: DEFAULT_PARAMS
      source: frontend/src/components/views/agent/BacktestControls.tsx:24
      value: "`{ train_ratio: 0.7, thresh: 0.55, fee: 0.0004, slippage: 0.0005 }`"
    - name: RANGE_PRESETS
      source: frontend/src/components/views/agent/BacktestControls.tsx:36
      value: "全部(0) / 近3月(90) / 近6月(180) / 近1年(365) 天"
    - name: 作业轮询节拍
      source: frontend/src/components/views/agent/QuantLabPanel.tsx:80-83
      value: "每 400ms 一次 `GET /jobs/{job_id}`，上限 120 次（≈48s）后报「回测失败」"
    - name: POLL_MAX / POLL_INTERVAL（同一处）
      source: frontend/src/components/views/agent/QuantLabPanel.tsx:80
      value: "循环计数上限 120、节拍 400ms；`runSeq` 计数用于丢弃过期结果"
    - name: MODEL_PRESETS
      source: frontend/src/components/views/agent/ModelPanel.tsx:16-72
      value: "4 个预设 id：`conservative-lr` / `aggressive-lr` / `hgb-fast` / `custom`；前三个各打包 model+scale+超参+执行档（init_cash/size/fee/slippage）"
    - name: SPARSE_THRESHOLD
      source: frontend/src/components/views/agent/DataAvailability.tsx:21
      value: "500（采样 bar 数低于此值即提示数据稀疏）"
    - name: FACTOR_CATALOG / DEFAULT_FACTORS
      source: frontend/src/components/views/agent/factorCatalog.ts:9,28
      value: "6 个预设因子（rsi/atr/vol_ratio/mom/roll_mean/roll_std）+ 引擎默认 7 因子集；注释「mirrors backend FACTOR_CATALOG ids」"
    - name: EXPR_FORBIDDEN
      source: frontend/src/components/views/agent/FactorManager.tsx:14
      value: "`[\"__\",\"import\",\"lambda\",\";\",\"=\",\":\",\"[\",\"]\",\"'\",'\"']` —— 因子表达式黑名单"
    - name: DEFAULT_THRESHOLDS / DEFAULT_FEES / DEFAULT_SLIPPAGES
      source: frontend/src/components/views/agent/SweepView.tsx:15-17
      value: "`[0.5,0.55,0.6,0.65,0.7]` / `[0.0002,0.0004]` / `[0.0005]`（sweep 网格默认；fees×slippages 组合上限 40）"
    - name: "颜色常量（图内硬编码）"
      source: frontend/src/components/views/agent/ModelDiagnostics.tsx（ACCENT/WIN/LOSS）、WalkForwardView.tsx（WINDOW_STROKES/SEED_COLORS）、EconCharts.tsx（UP=LONG_COLOR/DOWN=SHORT_COLOR）
      value: "accent `#2962ff`、win `#089981`、loss `#f23645` —— 与主壳走 `--tv-*` 的规则不同，此处未 token 化"
retrieval_hints:
  - "点「开始回测」之后前端做了什么？为什么 48 秒后报失败？"
  - "回测的模型/超参/执行档要发哪些字段？加一个新旋钮要改哪几处？"
  - "因子清单（`/dl/features`）和因子管理面板的启用状态怎么持久化？"
  - "为什么历史列表里有些记录不能回看；删除为什么没确认？"
  - "在 Agent 页里换标的/周期，会不会把主图的品种也换掉？"
  - "回测跑完为什么自动跳到信号K线？失败了跳不跳？买卖标记按什么对齐？"
  - "因子表达式里写方法链会被谁拦住？前端黑名单够不够？"
  - "⚠️ 主图表实例、datafeed、overlay 生命周期不在此文档——见 `frontend/src/chart`（信号K线复用同一 KLineChartProView）。"
  - "⚠️ 后端回测引擎实现（vectorbt、模型训练、因子计算）不在这里——在 `backend/src`。"
  - "本模块也叫『量化实验室』『QUANT LAB』『DL 工作台』『回测分析面板』，对应需求文档里的「向量化回测分析 UI」变更。"
  - "架构归属：本模块新 UI 一律放 `components/views/agent/`，控件样式走 `ui.tsx` 导出的 `cardCls/inputCls/selectCls/btnCls/Check/Panel`；不要再往旧 `ui.tsx` 原语上叠新组件。"
architectural_role: "研究层：后端量化/Agent 引擎的薄客户端，只做参数装配、轮询与结果图形化，不做任何指标或权益计算"
---

## 业务意图：这一层解决什么问题

量化研究员要回答的问题是"**这套因子 + 这个模型 + 这组执行假设，历史回测表现如何、能不能实盘**"。本模块的业务价值不是画图表，而是**把一次研究变成可复核的证据**：参数快照、数据窗口、因子集合、训练/测试 bar 数、指标卡、权益曲线、开单明细必须来自同一次运行，否则结论无从解释。因此本层的每条约束都在防同一件事——**"UI 看起来是一组参数，实际跑的是另一组参数"**。

关键含义：本层**不做任何指标/权益/收益计算**（`/backtest` 返回什么就画什么）；`lib/chartData.ts` 只做归月、直方图这类展示期聚合。想在前端"顺手补算一次 Sharpe"就是新的事实来源，属于禁止项。

## 对外接口（与后端的契约）

| 接口 | 方向 | 关键字段 | 业务说明 | 入口符号 |
|------|------|---------|---------|---------|
| `POST /backtest` | 前端→后端 | `SeriesRef + {factors, params(BacktestParams), start, end}` → `{job_id}` | 异步作业提交；**因子只发启用集**（`enabledFactors`） | `api.backtest` → `QuantLabPanel.run` |
| `GET /jobs/{job_id}` | 轮询 | `{status:"running"\|"done"\|"error", result?, error?}` | 400ms 节拍、120 次上限；过期 `runSeq` 结果直接丢弃 | `api.job` |
| `POST /backtest`（错误载荷语义） | 后端→前端 | `result.error` 非空 | **作业成功但管线失败**（如样本行数不足）：必须显式报错并清空 result，MUST NOT 画空图 | `QuantLabPanel.run` 内分支 |
| `POST /backtest/sweep` | 前端→后端 | `thresholds[], fees?, slippages?, factors?, params?, start?, end?` | 网格搜索；网格积上限 40 防炸 | `api.sweep` → `SweepView` |
| `POST /backtest/walkforward` | 前端→后端 | `n_splits?, …factors/params/window` | 按时间前推切分训练/测试，每 fold 独立评估 | `api.walkforward` → `WalkForwardView` |
| `POST /dl/features` | 前端→后端 | `{series, factors?}` → `DlFeaturesResponse{factors: FactorIc[]}` | 因子 IC（按启用集，`enabled=false` 也要发给后端，否则后端看不到面板状态） | `api.dlFeatures` → `FactorIcTable` |
| `GET+PUT /config` | 前端→后端 | `AppConfig{provider,risk,system_prompt,manual_rules,factors?}` | 因子集与 LLM/风控配置的持久通道；**必须先读再写**，否则覆盖别的字段 | `api.getConfig`/`putConfig` → `persistFactors` / `AgentConfigPanel` |
| `GET /backtest/history[/{id}]`、`DELETE /backtest/history/{id}` | 前端↔后端 | `BacktestHistoryMeta{params,factors,metrics,schema?,legacy?}` | 运行留痕；`legacy` 记录只可查看/删除 | `HistorySidebar` |
| `POST /agent/decide`、`POST /agent/cycle` | 前端→后端 | `SeriesRef` → `AgentDecision` | 单次决策 / 纸面循环；MUST NOT 自动定时触发 | `DecisionPanel`/`CyclePanel` |
| `GET /portfolio`、`GET /journal` | 前端→后端 | 持仓/成交流水 | 面板内本地聚合 | `PortfolioPanel` |

## 跨模块依赖

| 依赖 | 引用原因 | 关键符号 | confidence |
|---|---|---|---|
| `frontend/src/chart` | 信号K线内嵌 chart 模块并叠加买卖标记 | `KLineChartProView`（`groupId: "backtest-signals"`） | extracted |
| `frontend/src/data_access` | 信号K线要自取历史/实时 | `BitgetDatafeed` | extracted |
| `frontend/src/app_shell` | 页面宿主（AI Agent 页 tabs） | `AgentView` | extracted |
| `frontend/vendor` | 图表引擎 | `@klinecharts/pro` | extracted |
| `backend/quant`（vectorbt 引擎） | 结果字段 `stats`/`series.equity` 全来自它 | — | extracted |

> MUST NOT：在 QUANT LAB 之外发量化类请求；把 QUANT LAB 参数塞进主图 datafeed 状态；在 `api/types.ts` 之外的地方声明回测返回体的 TS 类型。

## 典型调用链

```
[曲线分析] 参数条(标的/周期/区间) + 训练参数 + 模型档 + 因子集
  → run() → runSeq++  ← 新运行作废仍在轮询的旧任务
    → POST /backtest → 每 400ms GET /jobs/{id}，最多 120 次
      → status=done → result 落地 → MetricCards + SeriesChart(权益/回撤/proba+阈值带) + EconCharts
                        └→ setActiveTab("signals") 运行完自动跳信号K线
      → status=error 或 result.error → setError(...) 且 result 置 null（不渲染空图）
      → 120 次未终态 → setError("回测超时") + 置 null
[历史回看] HistorySidebar → GET /backtest/history → onSelect(id)
  → GET /backtest/history/{id} → legacy ? (提示 + 只可删) : setResult(…) + setHistoryId(id)
[因子闭环] DL tab 勾选/新增因子 → onFactorsChange → POST /dl/features（IC）
  → 点「保存」 → PUT /config { …cfg, factors }（失败仅提示，本次运行仍发本次因子集）
```

## 实现约束清单（逐条核对）

### A. 参数与口径一致性

| 标识符 | 值 | 所在文件 | 说明 | 约束由来 |
|-------|----|---------|------|---------|
| `DL_TIMEFRAMES` | 14 项 | `BacktestControls.tsx:8` | 必须等于后端 `VALID_TIMEFRAMES`；两处白名单不一致时前端选了跑不了 | 注释 mirror |
| `FACTOR_CATALOG[].fn` | 6 个 | `factorCatalog.ts:9` | 必须命中后端 factor id，否则后端静默忽略 | 注释 mirror |
| `BacktestSeries` | `open_time/equity/drawdown/signal/proba/benchmark?` | `api/types.ts` | 曲线按 `open_time` 逐点对齐，**MUST NOT 用等间隔 index 补时间轴** | 时间戳非等间隔 |
| `BacktestJobResult.stats` | 自由 map | `api/types.ts` | 新增指标必须后端产出 + `MetricCards` 登记，缺一即不显示 | 「缺失字段以占位展示而非报错」 |

- **[页面级标的/周期隔离] Agent 页（含 QUANT LAB 参数条）内选择的标的/周期 MUST NOT 写回全局 `activeSymbol`/`timeframe`："信号K线"跟随 QUANT LAB 参数条，主图跟随外壳状态，两者即使同时存在也各自独立加载与订阅。由来：研究员在 Agent 页换标的时不应把正在盯的图换掉。**（来源: openspec/specs/ai-agent-page/spec.md §页面级标的/周期隔离 + openspec/specs/quant-signal-kline/spec.md §独立实例不联动主图）
- **[双 Tab 状态互不丢失；入口三处一致] `AgentView` 的两个 Tab（深度学习量化 / AI Agent 分析）切换 MUST NOT 丢对方已加载的状态（常挂载不卸载）；`agent` 视图的入口有三处且行为必须一致：全局导航栏、标签栏、命令面板。**（来源: openspec/specs/ai-agent-page/spec.md §双 Tab 布局 / §导航入口）
- **[信号K线用私有 datafeed 实例] `SignalKLineChart` 自己 `new BitgetDatafeed()`（`:33`，组件注释 :22 明确"自包含、不与主图共享订阅或联动"），MUST NOT 复用主图的 `bitgetDatafeed` 单例——共享会让 QUANT LAB 的订阅与主图订阅互相覆盖（`subscribe()` 进门就先 `unsubscribe()` 同一 `market/ticker/period.text` 键）。**（来源: openspec/specs/quant-signal-kline/spec.md §QUANT LAB 内独立 K 线模块 + `components/views/agent/SignalKLineChart.tsx:22-33` + `api/datafeed.ts:287-296`）
- **[标记按 `open_time` 对齐；无信号就什么都不画] `result.series.signal` 中 `1`→多、`-1`→空（多/空用不同颜色与朝向），位置按 `series.open_time` 对齐到对应 K 线；signal 全 0 或缺失时正常显示行情且不渲染任何标记。由来：按索引对齐会在历史长度与信号长度不等时把点画到错误的 bar 上。**（来源: openspec/specs/quant-signal-kline/spec.md §回测买卖标记叠加）
- **[自动跳 tab 只代表成功] 回测成功返回结果后才 `setActiveTab("signals")`（`QuantLabPanel.tsx:93`）；作业失败或返回管线错误时 tab MUST NOT 切换，错误以横幅呈现。由来：跳 tab 是"给你看结果"的信号，失败时跳过去等于把错误页藏起来。**（来源: openspec/specs/quant-signal-kline/spec.md §回测完成自动定位信号K线）
- **[因子 IC 字段是契约] `/dl/features` 每项必须渲染 `ic`（Spearman 秩相关，对下一根方向标签）、`ic_abs`、`coverage`、`last_value`，表格可排序；大部分为 NaN 的因子其 `coverage` 要如实反映非 NaN 比例并仍列在结果里——MUST NOT 因为"看着没用"在前端过滤掉（过滤 = 替研究员下结论）。不传因子配置时后端用默认 7 因子集，前端 `DEFAULT_FACTORS` 必须与之等价。**（来源: openspec/specs/factor-workbench/spec.md §因子 IC 分析 / §可配置因子集）
- **Agent Tab2 只出建议不下单**：`POST /agent/decide` 渲染决策卡片（action/side/reference_price/reason/confidence）时 MUST NOT 顺带触发下单通路；`POST /agent/cycle` 是一次纸面循环（含风控闸门结果与持仓变化），且 MUST NOT 被自动定时调用。（来源: openspec/specs/agent-analysis-ui/spec.md §决策面板 / §纸面循环面板）
- **[单一参数状态] 六个 tab 共享同一份 `params`/`factors`/`series`/`range`；MUST NOT 各 tab 自建局部参数副本。由来：口径漂移 = 研究结论无意义。**（来源: openspec/quant-lab-panel § QUANT LAB 单入口 + `QuantLabPanel.tsx:37-41` 组件注释）
- **[所有量化请求必须带 factors + params + start/end 三件套] 少一处即口径不一致。**
- **[range 可选而 `start>0` 必要] `start/end` 缺省时不发给后端（`qs` 过滤 undefined）；后端要求 `end > start` 并校验周期合法。**（来源: openspec/quant-data-selection）
- **[模型档即参数快照] 选预设会整体覆盖参数——用户手改一项 → `matchPreset` 归 `custom`。**由来：若手改只覆盖单个字段，回测实际用的就不是被选中的那一档。由来与验证见 openspec/quant-model-control + `quant-model-config` 规格；实现 `matchPreset`（`ModelPanel.tsx:85`，比较前用 `normalize()` 剔除 `undefined` 键）。
- **[面板切换不丢状态] 所有 tab 保持挂载，切 tab 不重置状态。**理由：回测要等约 1 分钟；`runSeq` 也依赖同一不变量——切换时仍要能作废过期结果。（来源: openspec/backtest-analysis-ui 场景 + `AgentView.tsx:~30-45` 注释）

### B. 结果完整性与占位

- **空值/0 必须可区分显示 `-`/占位，MUST NOT 把 0 当缺失、把缺失当 0；指标为空时输出 `-` 或显式说明，MUST NOT 输出 NaN/undefined。**由来：后端会把缺失写成 null、真 0 是有效数字；`NaN%` 上屏会被误读为真实收益率。
- **旧 schema（`schema==="v1-window"`（后端写 `"v1-window"`，前端写 `"v1-window"`）或 `legacy`）记录 MUST NOT 直接重绘曲线/指标**：`historyId != null` 时隐藏指标卡组，只留可复核部分并注明字段口径不同。理由：旧引擎字段语义已变，静默套用等于造假。
- **`benchmark` 为可选（旧 run 缺失）→ 折线不画该条；`roc_curve` 缺失（单一类别跳过）时显示提示而非空图；`feature_weights` 两形态都要接（`lr` 是带符号 coef、`hgb` 是非负 importance）。**（来源: openspec/quant-model-diagnostics + `quant-engine-vectorbt`）
- **历史对比只比同名键 + 全部非空键；MUST NOT 用 `JSON.stringify` 顺序或 `undefined` 键入比较** 做严格相等比较（字段增删会产生假差异）。来源：`api.backtestHistory()` 返回的 `params` 是完整快照，新增字段会让"看起来不一样"但实际等价。（对应实现：`matchPreset` 的归一化比较与 `HistorySidebar` 摘要）

### C. 数据可用性前置检查

- **运行前回显 `{bar 数, 起止}`，行数 `< SPARSE_THRESHOLD(500)` 提示样本不足。**由来：样本不足会让回测"成功但无意义"。（来源: openspec/dl-quant-workbench §数据可用性提示）
- **因子面板必须区分后端错误与空列表，并支持手动重载（缓存失败也返回空表会永久卡在「加载中/取不到」）；因子名列表 MUST NOT 硬编码——从响应 `factors[].name` 提取。**（来源: openspec/quant-factor-ic）

### D. 因子表达式安全边界（安全红线）

- **前端 `EXPR_FORBIDDEN` 黑名单只是第一道；后端有独立 AST 白名单校验（允许列名、算术与安全函数，白名单之外一律拒绝并返回明确错误），两边必须同步维护。** 由来：表达式最终会在后端求值，**任何求值都发生在后端**；前端放松就是把任意代码执行交给输入框，而前端收紧会让合法表达式在服务端被拒且无提示。⚠️ 已知口径差：规格还要求拒绝方法链 `.`、字符串字面量与未知函数，而前端 `EXPR_FORBIDDEN`（`["__","import","lambda",";","=",":","[","]","'","'"]`）**未包含 `.`**——即"前端放行 ≠ 可执行"，最终判定以后端错误信息为准；若要把 `.` 加入前端黑名单，必须在同一提交里确认后端白名单行为不变。（来源: openspec/specs/factor-workbench/spec.md §白名单表达式因子 + `components/views/agent/FactorManager.tsx:14`）
- **[表达式必须确定性] 同一表达式 + 同一数据两处求值结果必须完全一致：新增因子时不得引入随机性、时间相关或跨 bar 前视的写法（前端无法校验前视，但 `DataAvailability` 的样本回显 + 后端 IC 是发现手段）。**（来源: openspec/specs/factor-workbench/spec.md Scenario 表达式确定性）
- **`addExpr` 校验失败必须留在原输入态，MUST NOT 写入未校验表达式；`newId(prefix, factors)` 冲突递增（MUST NOT 用 `Date.now()` 或随机后缀）。**（来源: `factorCatalog.ts` 的 newId + `FactorManager.tsx:16-21`）

### E. 控件与主题

- **[新控件走 shadcn/Radix + `--tv-*` token] 旧 `ui.tsx` 原语只允许兼容修 bug，新增控件改 `ui.tsx` 兼容层或迁 shadcn。由来：QUANT LAB 的硬编码中文 + 字面量色已被豁免双语扫除，但颜色不 token 化会让双主题不一致。**（来源: openspec/quant-lab-panel § shadcn/ui 组件接入与主题融合）
- **`AgentView` 的 tab 状态本地 `useState` 且不落本地存储——刷新回到默认 tab 是可接受行为；若将来要持久化，须按上例开一个明确豁免。**
- **sweep 参数网格上限 40 组保护**：超出必须显式拒绝，不要静默截断。
- **图表全部由 `result.series` 驱动，MUST NOT 二次采样时间戳。新增「X 轴按 index」的画法会让 bar 时间轴与后端不一致。**

### 设计决策

| 决策点 | 选定方案 | 备选方案 | 理由 |
|---|---|---|---|
| 异步训练/回测 | 提交作业 + 400ms 轮询 `/jobs/{id}`，120 次上限 | WebSocket 推进度 | 作业最长约 45s，轮询足够且不建第二条连接 |
| 过期结果处理 | `runSeq` 计数守卫 | AbortController | 后端已提交作业，取消无意义；只需丢弃结果 |
| 参数与因子清单一致性 | 所有端点透传同一 `params/factors/window` | 各端点各自默认 | 否则 sweep/walkforward 与曲线跑的是不同策略，面板仍显示同一组——最危险的静默错误 |
| 因子持久化 | best-effort `PUT /config`，整体替换语义 | 乐观更新 / 增量 patch | 配置是整体对象，读-改-写更不易丢字段 |

## 变更风险（改这里会破坏什么）

- `DL_TIMEFRAMES`/`FACTOR_CATALOG`/`DEFAULT_PARAMS` 与后端默认任一漂移 → 前端能选、后端报错或跑另一套（"静默口径错"）。
- 轮询节拍或上限改动 → 要么长训练被误报失败，要么面板卡在 loading。
- 切 tab 卸载重挂 → 运行中状态丢失，回测必须重跑。
- 绕过 `runSeq` → 旧任务结果覆盖新任务；用户看到参数/结果不一致。
- 在指标卡里"顺手补算 Sharpe" → 前端数字与后端/离线脚本不一致，研究结论无法复核，且 E2E 断言随之失配。
- 用 `JSON.stringify` 比较参数快照 → 字段增删产生假差异，历史对比失效。
- 在 QUANT LAB 复用主图 chart cell / 共享 store → 与主终端生命周期纠缠（主图重挂会打断研究视图，反之亦然）。
- 前端表达式黑名单被放宽而后端不同步 → 后端成为任意代码执行入口（安全红线）。
- 让 QUANT LAB 复用主图的 `bitgetDatafeed` 单例 → 两处订阅互相覆盖，主图与信号K线同时出现"看着有数据、周期/品种却不对"。
- 回测失败也跳 `signals` tab → 错误横幅被切走的 tab 隐藏，用户以为跑成功但没有买卖点。
- 在 IC 表里过滤掉 `coverage` 低的因子 → 研究员失去"这个因子样本不足"的唯一线索，结论建立在空样本上。
- 让 Agent 页的参数条写回全局 `activeSymbol`/`timeframe` → 主图被研究操作替换，用户正在盯的盘丢失。
- `DecisionPanel` 里"顺手"接上 `api.order` → 越过两阶段确认与后端 kill-switch，等于把 AI 建议直接变成下单。

## 术语对照

| 需求语言 | 代码 | 位置 |
|---|---|---|
| QUANT LAB / DL 工作台 | `QuantLabPanel` | `components/views/agent/QuantLabPanel.tsx` |
| 曲线分析 / 权益曲线 | `SeriesChart` + `lib/chartData.ts` | `components/views/agent/{SeriesChart,EconCharts}.tsx` |
| 参数扫描 | `SweepView` + `api.sweep` | 同目录 |
| Walk-forward | `WalkForwardView` + `api.walkforward` | 同目录 |
| 因子管理 / 因子 IC | `FactorManager` / `FactorIcTable` / `FactorIcChart` / `factorCatalog.ts` | 同目录 |
| 信号K线 | `SignalKLineChart`（`groupId: "backtest-signals"`） | 同目录 + `lib/signalMarks.ts` |
| 运行留痕 / 历史回看 | `api.backtestHistory*` + `HistorySidebar` | 同目录 + `api/client.ts:133` |
| 模型档位 | `MODEL_PRESETS` / `matchPreset` | `ModelPanel.tsx:16-92` |
| Agent 页 Tab2 / 决策 / 纸面循环 / 配置 | `AgentAnalysisTab` → `DecisionPanel`(`POST /agent/decide`) / `CyclePanel`(`POST /agent/cycle`) / `PortfolioPanel`(GET /portfolio, /journal) / `AgentConfigPanel`(GET/PUT /config，`NUM_FIELDS`+`RISK_FIELDS`) | `components/views/agent/*` |
| 月度热力图 / 概率直方图 | `monthlyHeatmap`/`monthlyReturns`/`probaHistogram`/`tradePnl`/`returnsHistogram` | `lib/chartData.ts`（QUANT LAB 私有图数据变换） |

## 附：OpenSpec 摘要

> 📋 本节内容来源于 OpenSpec：`openspec/specs/quant-*/spec.md`、`openspec/changes/archive/…/vectorbt-backtest-engine`（仅提炼接口与口径，非完整转录）。本模块是这些规格的前端消费方。

1. **回测引擎已切到 vectorbt**（openspec/quant-engine-vectorbt）：后端 `stats` 来自 vectorbt/QuantStats，权益来自 `vbt.Portfolio.from_signals`。前端字段口径必须跟随：`BacktestJobResult.total_return` 语义为**训练集收益**，`test_bars` 为实际出信号的测试集 bar 数。
2. **walk-forward 为按时间前推切分**（openspec/quant-walk-forward）：每 fold 独立训练+评估，前端只呈现 fold 表与 fold 内曲线，不做跨 fold 汇总。
3. **参数扫描网格上限 40**（openspec/quant-parameter-sweep）：前端 `parseGridInput` 必须校验并拒绝超限组合，MUST NOT 静默截断。
4. **模型参数档位化**（openspec/quant-model-control）：档位即"参数快照"，手改即脱钩。
5. **历史留痕与回看**（openspec/backtest-history）：每条记录带 `params` + `factors` 快照；`legacy`（含 `schema==="v1-window"`）记录**只可查看与删除**，不得重绘为当前口径。

## 文件组成与覆盖（本子文档负责的文件）

均以 `components/views/agent/` 为根（相对 `frontend/src/`）：

| 视图 | 文件 |
|---|---|
| 页与容器 | `AgentView`（`components/views/AgentView.tsx`，Tab1/Tab2 宿主，tab 常挂载不卸载）、`QuantLabPanel.tsx`、`AgentAnalysisTab.tsx`、`ui.tsx`（兼容层控件工厂 `cardCls/inputCls/selectCls/btnCls/Check/Panel`） |
| 参数与数据 | `BacktestControls.tsx`（`DL_TIMEFRAMES`/`DEFAULT_PARAMS`/`RANGE_PRESETS`）、`DataAvailability.tsx`（`SPARSE_THRESHOLD`）、`ModelPanel.tsx`（`MODEL_PRESETS`/`matchPreset`）、`ModelDiagnostics.tsx` |
| 结果视图 | `MetricCards.tsx` + `lib/metricCards.ts`（`buildMetricCards` 指标卡分组与占位）、`SeriesChart.tsx`、`EconCharts.tsx`（月度热力/盈亏/分布/基准/概率带，数据来自 `lib/chartData.ts`）、`SweepView.tsx`、`WalkForwardView.tsx`、`TradeTable.tsx`、`HistorySidebar.tsx`、`SignalKLineChart.tsx` |
| 因子 | `factorCatalog.ts`、`FactorManager.tsx`、`FactorIcTable.tsx`、`FactorIcChart.tsx` |
| Agent | `DecisionPanel.tsx`、`CyclePanel.tsx`、`PortfolioPanel.tsx`、`AgentConfigPanel.tsx` |
| 测试 | `QuantLabPanel.test.tsx`、`HistorySidebar.test.tsx`、`ModelPanel.test.tsx`、`ModelDiagnostics.test.tsx`、`SignalKLineChart.test.tsx`、`SweepView.test.tsx`、`WalkForwardView.test.tsx`、`TradeTable.test.tsx`、`lib/chartData.test.ts` |
