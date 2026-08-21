# quant-lab-ui-panel — Design

## Context

量化引擎已于 `quant-engine-vectorbt-rewrite` 全量迁移至 vectorbt 1.1 + scikit-learn:后端 `dlquant.py` 已实现 vectorbt 回测、`stats`(Sharpe/Sortino/Calmar/Profit Factor)、`model_metrics`(roc_auc/log_loss)、`sweep_params`、`split_walk_forward`/`split_ranges`、`SklearnModel(kind="hgb")`。但前端仍停留在手写组件阶段:

- `DlQuantTab.tsx` 与 `BacktestTab.tsx` 高度重复(各自持有 symbol/timeframe/range/params 状态并调用同一 `/backtest`)。
- `stats` 只在 DlQuantTab 渲染一行 Sharpe;`model_metrics` 完全未展示。
- `sweep_params`/`split_walk_forward` 有后端函数但无 HTTP 路由。
- 前端为 Tailwind v4 + Recharts 3 + React 19 + lucide + motion;`ui.tsx` 提供手写原语(cardCls/btnCls/selectCls/inputCls/Panel/Field)。

约束:`design-system` spec 要求 `--tv-*` 双主题 token、无卡片阴影、高密度、lucide 线性图标、禁用 emoji/ASCII 字形图标;前端无 `@/` 路径别名(vite.config 只有 `@klinecharts/pro` 别名)。

## Goals / Non-Goals

**Goals:**
- 引入 shadcn/ui(Tailwind v4 + React 19 兼容),按需接入 Radix 原语与拷贝组件,并使其继承 `--tv-*` token。
- 合并 DlQuantTab + BacktestTab 为单一 QUANT LAB 面板,Tabs 六视图(曲线分析/参数扫描/Walk-forward/因子 IC/开单明细/历史)。
- 补齐 stats/model_metrics/proba 分布的展示;开单表格支持排序。
- 新增 `POST /backtest/sweep` 与 `POST /backtest/walkforward` 路由并配套前端热力图与折区间图。
- `BacktestParams.model`("lr"|"hgb")透传;历史详情补存 stats/model_metrics,旧记录兼容。

**Non-Goals:**
- 不引入第三方图表库替代 Recharts/SeriesChart(热力图用手写 grid + Tooltip 实现)。
- 不做因子管理 UI 改造(仅迁移因子 IC 展示)。
- 不改造既有交易/K线/新闻等其他模块 UI。
- 不做服务端渲染或路由重构。

## Decisions

### D1: shadcn/ui 接入方式(而非 Tremor 或纯手写)

- **选择**: shadcn/ui 按需引入——安装 `@radix-ui/react-tabs`、`@radix-ui/react-tooltip`、`@radix-ui/react-slider`、`@radix-ui/react-popover`,并从官方 registry 拷贝 button/card/table/tooltip/slider/badge 组件源码到 `frontend/src/components/ui/`。
- **理由**: 与 Tailwind v4 / React 19 官方兼容;组件代码拷入项目后可直接改用 `--tv-*` token,满足 design-system「无硬编码色」约束;按需引入体积可控。Tremor 虽有现成 HeatMap 组件但整库引入重、自带风格需大量调教。
- **备选**: 手写全部组件(工作量大、无 Tooltip/动画体验);Tremor(风格冲突、体积)。
- **实现要点**: 添加 `frontend/src/lib/utils.ts`(cn = twMerge + clsx);`components.json` 的 CSS 变量映射为 `--tv-*`(primary=#2962ff、background=#131722、card=#1e222d、border=#2a2e39、foreground=#d1d4dc、muted=#787b86、up=#089981、down=#f23645);不添加 `@/` 别名(保持相对导入,避免动 vite/tsconfig)。

### D2: QUANT LAB 面板与状态提升

- **选择**: 新建 `QuantLabPanel.tsx` 作为单一容器,持有 symbol/timeframe/range/params/model 共享状态与 `run()` 逻辑;六视图为子组件,接收共享状态与 `BacktestJobResult`。原 `DlQuantTab`/`BacktestTab` 在 agent tab 注册处替换为 `QuantLabPanel`。
- **理由**: 消除两个 tab 的状态重复与双份 `/backtest` 轮询逻辑;参数共享满足 spec「状态共享」。
- **实现要点**: `run()` 逻辑从 BacktestTab 提取为容器 hook(轮询 jobs、supersede 序号、错误处理);`HistorySidebar` 改为历史视图内联组件;`EconCharts`/`TradeTable`/`FactorIcTable`/`MetricCards` 复用。

### D3: 指标卡组扩容与占位降级

- **选择**: `MetricCards` 扩展为动态指标卡:基础 5 卡(总收益/最大回撤/胜率/交易次数/测试 bar)保留;`stats` 中的 `sharpe_ratio/sortino_ratio/calmar_ratio/profit_factor` 与 `model_metrics` 的 `roc_auc/log_loss` 追加渲染;缺失字段渲染 `--` 占位。
- **理由**: 后端已返回这些字段,前端零接口改动即补齐;兼容旧/历史结果缺字段。
- **实现要点**: 增加可单测的纯函数 `buildMetricCards(result): MetricCardDef[]`;卡片按分组(收益/风险调整/交易/模型)布局。

### D4: 参数扫描(后端 + 热力图)

- **选择**: 新路由 `POST /backtest/sweep`,body 复用 BacktestBody 字段并加 `thresholds: number[]`(必填)与可选 `fees`/`slippages`;同步 job 执行(直接返回结果,不经 jobs 轮询,因扫描为一次性计算)。
- **理由**: `sweep_params` 已实现且单次耗时与单次回测同级,同步返回简化前端。
- **前端**: 手写 CSS grid 热力图(行=阈值、列=费用,`background-color` 由 `total_return` 插值到暖/冷色阶),单元格包 shadcn `Tooltip` 显示全指标,`Popover` 显示明细。
- **备选**: recharts Treemap/Heatmap(无现成 heatmap,自绘 grid 更轻)。

### D5: Walk-forward(后端 + 区间条)

- **选择**: 新路由 `POST /backtest/walkforward`,body 复用 BacktestBody 字段并加可选 `n_splits`;后端循环 `walk_forward_splits(X, y, model, n_splits)` 逐折训练/预测/回测,聚合每折指标(含 roc_auc/log_loss)与 train/test 的 open_time 区间。
- **理由**: 满足「测试区间严格晚于训练区间」可断言;`walk_forward_splits` 已是 TimeSeriesSplit 实现。
- **前端**: 折指标表(shadcn Table)+ 手写横向区间条(总时间轴归一化,train/test 分段着色)。
- **注意**: 多折串行训练耗时随折数线性增长,前端需 loading 态;后端默认 n_splits 基于数据量。

### D6: 模型选择透传

- **选择**: `BacktestParams` 增加 `model?: "lr" | "hgb"`;后端 `run_pipeline` 在 `SklearnModel(kind=model)` 处透传(默认 "lr")。`BacktestControls` 增加模型下拉,BacktestBody 校验非法值返回 422。
- **理由**: 后端 `SklearnModel` 已支持 `kind="hgb"`,仅缺参数通道。

### D7: 历史记录扩展与兼容

- **选择**: `backtest_history.py` 保存时写入 `stats`/`model_metrics`(仅当非空),schema 版本字段保持 `vectorbt`;读取时若字段缺失则省略,不破坏旧记录。前端历史详情渲染时对缺失字段走占位。
- **理由**: 满足 backtest-history spec「stats/model_metrics 落盘 + 旧记录兼容」,不引入迁移脚本。

## Risks / Trade-offs

- [shadcn 组件默认配色与 TradingView 风格差异] → 所有 token 映射到 `--tv-*`,并在集成测试中断言关键色 token 引用;若差异过大可调 components.json 变量。
- [walk-forward 多折耗时线性增长,前端长时间 loading] → 默认折数自适应(数据量/折数上限),前端显示「折 x/y 运行中」进度;超时沿用现有 120 轮轮询上限(同步路由改前端直接等待响应并设超时)。
- [合并面板改动面大,可能影响既有 e2e/组件测试] → 保留组件测试迁移策略:重命名而非删除,`BacktestTab.test.tsx` 改为 `QuantLabPanel` 测试,覆盖合并后 Tabs 渲染;L3 e2e 冒烟沿用。
- [`--tv-*` token 与 shadcn CSS 变量两层变量名并存易混淆] → components.json 中集中映射,新增组件一律用 shadcn 变量(token 通过变量文件绑定),避免组件内直接写 `--tv-*`。
- [sweep/walkforward 同步路由在数据量大时可能阻塞 worker] → 与 `/backtest` 同进程,量级一致可接受;若未来超时再改 jobs 化。

## Migration Plan

1. 先装依赖与拷贝 shadcn 组件,`cn` 工具函数,components.json token 映射;验证现有测试不受影响。
2. 后端先行:model 透传 + `/backtest/sweep` + `/backtest/walkforward` + 历史扩展 + 测试。
3. 前端补齐展示(指标卡/stats/model_metrics/proba 分布)+ 排序表格,先不改面板结构。
4. 合并面板:QuantLabPanel + Tabs,迁移 DlQuantTab/BacktestTab 子组件,删除旧 tab 注册。
5. 新增 sweep 热力图与 walk-forward 区间条视图。
6. 全量回归(L1/L2/L3 + typecheck),更新迁移后测试。
- **回滚**: 面板合并与组件库接入为独立提交,可分别 revert;后端新路由不影响既有 `/backtest`。

## Open Questions

- shadcn 组件具体拷贝版本以 registry 为准,组件细节(Tooltip 触发方式等)按官方文档落地。
- walk-forward 默认折数上限定在 5 折还是按数据自适应,待实现时结合耗时实测确定(spec 允许「默认基于数据量自适应」)。
- 热力图色阶映射(等距 vs 分位)实现时按数据分布决定。
