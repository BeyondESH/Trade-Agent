## Context

AI Agent 页面(`AgentView.tsx`)现有双 Tab:Tab1「深度学习量化」(因子管理 + IC + 回测曲线)、Tab2「AI Agent 分析」。回测能力集中在 `dlquant.py`:

- `backtest()` 是向量化实现:`position = signal.shift(1)`,`net = position * pct - turnover * (fee+slippage)`,返回**标量指标 + series**(open_time/equity/drawdown/signal/proba),`trades` 只是个数,逐笔交易被丢弃。
- `webapi._run_backtest` 把 `run_pipeline()` 的返回 dict 原样塞进 `jobs[{id}]`,`/backtest` → `/jobs/{id}` 轮询已存在。

前端无独立图表库(仅 klinecharts-pro 画 K 线 + 内联 SVG 先例 `SeriesChart.tsx`)。后端持久化惯例是**小型 JSON store**(`ChartStore`/`ConfigStore`:load/save + 校验 + 上限封顶),无 SQLite。

本 change 要补三块缺口:逐笔开单数据源(后端)、收益经济学图形(前端)、多次回测历史(前后端)。

## Goals / Non-Goals

**Goals:**
- `dlquant.backtest()` 输出逐笔交易列表(方向/时间/价格/持仓 bar/毛利/净利),与既有 equity 曲线严格自洽(不变量可测)。
- 新增回测历史持久化:每次 `/backtest` 完成自动落盘,提供列表/详情/删除端点。
- `AgentView` 新增 Tab3「回测」:自含运行控件,展示开单列表表格 + 四个收益图形(月度收益柱状/单笔盈亏柱状/收益直方图/权益+回撤),历史侧栏点开回看。
- 引入 Recharts 3.x 作为图表库(React 19 兼容),所有图形计算由可单测的纯函数提供。
- 既有端点与返回结构为**加法扩展**,旧前端/旧后端可运行。

**Non-Goals:**
- 不做因子/参数自动寻优,不做在线重训。
- 不做买入持有基准对比、滚动夏普、年化等进阶统计。
- 不做历史结果导出/跨设备同步(单机 JSON store)。
- 不改 Tab1/Tab2 现有行为,不迁移已有内联 SVG 图表。

## Decisions

### D1: 逐笔交易提取 —— 从 position 序列线性扫描,和向量化回测严格同账

`position[i]` 由 `signal[i-1]` 决定,第 i 根 bar 收益 `position[i] * pct[i]`(close[i]/close[i-1]-1),费用在 turnover 变化的 bar 上计提。交易定义为一段**符号连续且非零**的 position 区间:

```
entry_bar e : position[e] != 0 且 position[e-1] 为 0 或反号
exit_bar  x : position[x] == 0 或反号  (持仓最后收益在 x-1)
trade:
  side        = "long" if position[e] > 0 else "short"
  entry_time  = open_time[e-1],  entry_price = close[e-1]
  exit_time   = open_time[x-1],  exit_price  = close[x-1]
  bars        = x - e                      # 持仓 bar 数(与 entry/exit 时间跨度一致)
  gross_return= Π(1 + position[i]*pct[i]) - 1, i∈[e, x-1]   # 纯价格收益
  net_return  = Π(1 + net[i]) - 1, i∈[e, x-1];   # net[i] = position[i]*pct[i] - turnover[i]*(fee+slippage)
                若平仓为归零(x<n 且 position[x]==0)再乘 (1+net[x]) 计入平仓成本
```

> 实现修正: 设计初稿的 `net_return = (1+gross_return)*(1-cost_entry)*(1-cost_exit) - 1` 与向量化模型不一致——向量化模型在 turn bar 上**按 bar 内相乘**扣成本(`net[i] = gross[i] - turnover[i]*cost`),而非交易边界相乘,聚合后无法精确重构权益。改为按逐 bar net 因子归属交易:`net_return = Π(1+net[i]) - 1`(平仓归零 bar 含平仓成本因子),反号翻转 bar 的 turnover=2(平旧+开新各一次成本)归属新交易。该归属使「交易 net_return 复利重构的权益 == 返回 equity 序列」成为**精确恒等式**(仅受 8 位小数舍入影响)。

**不变量测试**: 所有交易按时间顺序叠加 `(1+net_return)`,重构出的权益序列与返回的 `equity` 序列在浮点容差内一致——这是本 change 最重要的正确性锁。

### D2: 历史持久化 —— JSON store,仿 ChartStore 先例

新增 `backend/src/market_data/backtest_history.py`:

```
class BacktestHistoryStore:
    __init__(path)                       # data_dir/backtest_history.json
    list()      -> [entry_meta...]       # 最新在前,不含 trade_list/series
    get(id)     -> entry | None          # 含完整 trade_list + 降采样 series
    delete(id)  -> bool
    save(result, series_ref, params, factors) -> entry
```

- **自动落盘**: `webapi._run_backtest` 在 job 完成后调用 `store.save(...)`。
- **上限**: `MAX_RUNS = 20`,插入超限时淘汰最旧一条(LRU 语义:list 按 created_at 倒序)。
- **降采样**: `series` 每条 lane 超过 `MAX_SERIES_POINTS = 500` 时均匀抽稀(`np.linspace` 下标),`trade_list` 全量保留(量级小)。`data_meta` 保留原始起止时间。
- **校验**: `_validate_entry` 检查形状(仿 `chartstore._validate_state`),畸形或超限抛 `ValueError`。

**备选**: SQLite/独立文件 per run。放弃——项目无 SQLite 依赖、单机低频写入,单 JSON + 上限封顶足够且与现有 `alertstore`/`chartstore` 一致。

### D3: 历史端点 —— 列表轻量、详情按需

| 端点 | 返回 |
|---|---|
| `GET /backtest/history` | `{runs: [meta...]}` meta = id/created_at/category/symbol/timeframe/params/指标标量/data_meta(不含 trade_list/series) |
| `GET /backtest/history/{id}` | 完整 entry(meta + trade_list + 降采样 series);404 处理沿用 `/jobs/{id}` 先例 |
| `DELETE /backtest/history/{id}` | `{deleted: true}`;不存在返回 404 |

列表不含曲线与交易,避免一次拉全量(20 条 × 数百 KB)。详情按需拉取,点历史项才请求。

### D4: 前端 Tab3 —— 自含状态,复用运行轮询模式

`AgentView` 增加第三 tab `"backtest"`,保持「所有 tab 常驻挂载、切换不丢状态」的既有约定。`BacktestTab.tsx`:

```
BacktestTab
├─ BacktestControls (复用: 标的/周期/训练参数 + Run)
├─ 结果区
│   ├─ MetricCards  (复用)
│   ├─ TradeTable   (新增: 开单列表表格)
│   └─ EconCharts   (新增: 四图)
└─ HistorySidebar  (新增: 历史列表 → 点开拉详情)
```

- 运行链路与 `DlQuantTab.run` 完全同构(`api.backtest` → 轮询 `/jobs/{id}` → 成功自动已落盘历史)。
- 因子来源:挂载时 `api.getConfig()` 读已启用因子(与 `DlQuantTab` 一致),本 tab **不提供**因子管理 UI。
- 历史回看:点侧栏条目 → `api.backtestHistoryDetail(id)` → 用详情里的 trade_list/降采样 series 渲染同一套表格与图形;回看态标记为「历史」,与实时运行结果区分。

### D5: 收益经济学图形 —— Recharts 3.x + 纯函数计算

引入 `recharts@^3`(支持 React 19;声明式 JSX 与现有组件风格一致;柱状/面积/直方全覆盖,包体小)。四个图形与数据来源:

| 图形 | 数据计算 | 渲染 |
|---|---|---|
| 月度收益柱状图 | `monthlyReturns(equity[], open_time[])`:按 YYYY-MM 分组,月收益 = 月末 equity / 上月末 equity - 1 | `BarChart` + 按正负 `Cell` 着色 |
| 单笔交易盈亏柱状 | `tradePnl(trade_list)`:id/净利数组 | `BarChart` + `Cell` 绿赢红亏 |
| 收益分布直方图 | `returnsHistogram(equity[], bins=20)`:equity 差分 → 分桶计数 | `BarChart` |
| 权益 + 回撤曲线 | 直接用 `series.equity` / `series.drawdown` | `AreaChart`(权益)+ `AreaChart`(回撤,独立面板) |

所有计算放在 `frontend/src/lib/chartData.ts` 纯函数中,`chartData.test.ts` 单测覆盖(空数组、单点、月度跨年、分桶边界)。

**备选**: ECharts(包体 1MB、wrapper 对 React 19 滞后)、lightweight-charts(直方/柱状表达别扭)、纯内联 SVG(四个图手写成本高、无 tooltip/动画)。Recharts 在覆盖度/包体/React 19 兼容性上均衡最优。

### D6: 类型与 API 客户端 —— 加法扩展

`frontend/src/api/types.ts` 新增:

```
BacktestTrade  = { side, entry_time, entry_price, exit_time, exit_price,
                   bars, gross_return, net_return }
BacktestJobResult 增加可选 trade_list?: BacktestTrade[]
BacktestHistoryMeta = { id, created_at, series_ref, params, metrics..., data_meta }
BacktestHistoryDetail = BacktestHistoryMeta & { trade_list, series }
```

`api/client.ts` 新增 `backtestHistory()` / `backtestHistoryDetail(id)` / `backtestHistoryDelete(id)`,复用现有 fetch 封装。

## Risks / Trade-offs

- **[交易提取与向量化账目不一致]** → 用「权益重构不变量」单测锁死(浮点容差 1e-6);反号翻转的双边费用在 D1 明确约定并单测。
- **[历史文件体积失控]** → `MAX_RUNS=20` + `MAX_SERIES_POINTS=500` 双上限,`_validate_entry` 拒绝超限写入。
- **[Recharts 引入新依赖]** → 锁定 `recharts@^3`(React 19 peer 兼容);若 npm 镜像不可用,回退方案是内联 SVG(图形计算纯函数不变,仅换渲染层)。
- **[历史自动落盘拖慢 job 完成]** → save 在 job 任务末尾同步执行,JSON 写入毫秒级;失败仅记录日志不阻断 job 返回。
- **[Tab1 与 Tab3 回测入口并存]** → 职责分离:Tab1 管因子/IC,Tab3 管开单与图形复盘;不做状态共享,避免耦合。

## Migration Plan

1. 后端先行: `dlquant` trade 提取 → `backtest_history.py` → webapi 端点 + 自动落盘 → 单测/不变量测试 → `cd backend && python -m pytest -q`。
2. 前端随后: `types.ts`/`client.ts` → `recharts` 依赖 → `chartData.ts` 纯函数 + 单测 → `BacktestTab`(表格→图形→历史侧栏)→ `AgentView` 接线。
3. 无数据迁移(`backtest_history.json` 为新增文件);旧前端 + 新后端、新前端 + 旧后端均可运行(`trade_list`/端点均为可选)。
4. 回滚: 按任务粒度 revert;删除 `backtest_history.json` 即可清历史。

## Open Questions

- 历史是否需要按序列/参数过滤检索?本期列表最多 20 条,直接全量渲染,不引入过滤。
- 是否需要「对比两次回测」?本期不做,留待后续。
