# quant-lab-ui-panel

## Why

量化引擎已全量迁移至 vectorbt + scikit-learn(见 `quant-engine-vectorbt-rewrite`),后端产出了丰富的绩效数据(stats、model_metrics、参数扫描、walk-forward 切分),但前端呈现停留在两年前的手写组件水平:DlQuantTab 与 BacktestTab 高度重复、stats 只渲染一行 Sharpe、model_metrics 完全未展示、参数扫描与多折切分既无 API 也无 UI。需要引入现代 UI 组件库(shadcn/ui)并合并为统一的量化研究面板,把后端已实现的能力全部呈现出来。

## What Changes

- 引入 shadcn/ui(Tailwind v4 兼容):按需接入 Radix 原语(Tabs/Tooltip/Slider/Popover)+ 拷贝组件(button/card/table/tooltip/slider/badge),替换手写 `ui.tsx` 控件原语,并使其继承现有 `--tv-*` 双主题 token(design-system spec 约束不变)。
- **BREAKING**: 合并 `DlQuantTab` 与 `BacktestTab` 为单一「QUANT LAB」面板,以 Tabs 分层展示:曲线分析 / 参数扫描 / Walk-forward / 因子 IC / 开单明细 / 历史。原两个 tab 入口与组件拆分迁移,`BacktestTab.test.tsx`/`HistorySidebar.test.tsx`/`TradeTable.test.tsx` 相应迁移。
- 补齐已有数据展示:`stats` 全量指标卡(Sharpe/Sortino/Calmar/Profit Factor)、`model_metrics`(roc_auc/log_loss)、proba 分布直方图、开单明细排序、历史回看态携带完整指标。
- 参数扫描 UI:新后端路由 `POST /backtest/sweep`(暴露 `dlquant.sweep_params`),前端以阈值×费用热力图展示总收益,点击格 Popover 查看该组合全指标。
- Walk-forward UI:新后端路由 `POST /backtest/walkforward`(多折跑 `walk_forward_splits` + 每折回测),前端以区间条 + 折指标表(折次/区间/AUC/收益/回撤/胜率)展示模型稳定性。
- 模型选择入口:`BacktestParams` 增加 `model: "lr" | "hgb"`,后端 `run_pipeline` 透传 `SklearnModel(kind=...)`。
- 历史详情补存 `stats`/`model_metrics`,旧记录兼容(字段缺失时前端优雅降级)。

## Capabilities

### New Capabilities

- `quant-lab-panel`: 合并后的量化研究面板——shadcn/ui 组件接入、QUANT LAB 单入口与 Tabs 分层、KPI 指标卡组(stats + model_metrics)、曲线分析视图(含 proba 分布)。
- `quant-parameter-sweep`: 参数扫描能力——`POST /backtest/sweep` 路由、阈值×费用网格、前端热力图与 Popover 明细。
- `quant-walk-forward`: walk-forward 多折能力——`POST /backtest/walkforward` 路由、每折训练/测试区间与指标、前端折区间条 + 指标表。

### Modified Capabilities

- `backtest-analysis-ui`: 独立「回测」tab 合并进 QUANT LAB,开单列表/收益图形/历史回看迁移为面板内 Tabs,并补 sortable 表格与完整指标展示。
- `ml-model`: 模型从固定 baseline 变为可经 `BacktestParams.model` 选择 LR/HGBT,前端提供模型下拉。
- `backtest-history`: 历史记录扩展持久化 `stats`/`model_metrics`,详情返回含完整指标,旧记录兼容。
- `design-system`: 组件库接入约束——shadcn/ui 组件 SHALL 使用 `--tv-*` token 变量且保持双主题,新增组件不得破坏现有设计系统规范。

## Impact

- **前端**: `frontend/package.json`(新增 radix 依赖)、`src/components/ui/*`(shadcn 拷贝)、`ui.tsx`(控件原语迁移或保留兼容层)、`DlQuantTab.tsx`/`BacktestTab.tsx`(合并为 `QuantLabPanel.tsx`)、`MetricCards.tsx`/`SeriesChart.tsx`/`TradeTable.tsx`/`FactorIcTable.tsx`/`HistorySidebar.tsx`(迁移至 Tabs 与 shadcn 组件)、`api/client.ts` + `api/types.ts`(sweep/walkforward 客户端与类型)。
- **后端**: `webapi.py`(`/backtest/sweep`、`/backtest/walkforward` 路由、`model` 参数透传)、`dlquant.py`(walk-forward 折指标聚合、model 透传)、`backtest_history.py`(stats/model_metrics 持久化)。
- **测试**: `test_webapi.py`/`test_live_api.py`(新路由与 model 参数)、`test_backtest_history.py`(新字段)、前端 `BacktestTab.test.tsx`/`HistorySidebar.test.tsx`/`TradeTable.test.tsx` 迁移、新增 QuantLabPanel 组件测试;L3 e2e 冒烟沿用。
- **依赖**: `@radix-ui/react-tabs`、`@radix-ui/react-tooltip`、`@radix-ui/react-slider`、`@radix-ui/react-popover` 及 shadcn 组件所需 peer(react 19 兼容)。
