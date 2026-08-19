# Chart Context Menu Price Lines

## Why

用户在 K 线图上看到某个价格位时，没有任何直接方式快速添加价格参考线或在对应价格上设置价格警报——警报只能从侧栏/弹窗入口创建，价格线（`priceLineToOverlay`、`AutoLayerController`）虽已存在但从未接入主流程，`alerts-local` spec 要求的「警报图画线、拖动调阈值」也全部未实现。右键菜单是 TradingView 风格的标准交互，能用一个手势在光标处价格完成「画线」与「设警报」两件事。

## What Changes

- 在蜡烛主图区域增加右键上下文菜单，菜单项为：
  - **在此添加价格线 $X**：在当前光标价格创建一条参考线
  - **在此设置价格警报 $X**：打开预填该价格的创建警报弹窗
- 引入统一「价格线」实体模型：一条线 = 一个 `Alert` 实体，`enabled:false` 为纯参考线（灰色），`enabled:true` 为价格警报线（黄色，不区分 above/below），参考线与警报线仅通过颜色区分。
- 左键点击任一条线弹出**价格线设置弹窗**：可编辑价格、自定义颜色、切换类型（参考线/警报线）、切换条件（高于/低于），并可删除该线。
- 拖动任一条线更新阈值并持久化（满足 `alerts-local` 的拖动调阈值要求）。
- 价格线/警报线按品种持久化（复用 `alertsStore` 的 `symbol` 字段），挂载、切换品种、alerts 变化时从 store 统一重绘，换品种只显示本品种的线。
- 颜色约定：参考线 dark `#787b86` / light `#5d606b`；警报线统一黄色 `#ff9800`。

## Capabilities

### New Capabilities

- `chart-context-menu`: 蜡烛主图右键菜单，捕获右键坐标并转换为价格，提供「添加价格线 / 设置价格警报」两个动作。
- `price-lines`: 统一价格线实体——在图上绘制（`priceLine` overlay）、左键设置弹窗（改价/改色/改类型/改条件/删除）、拖动调阈值、按品种持久化与重绘。

### Modified Capabilities

- `alerts-local`: 警报线从「仅 spec 未实现」变为实际落地，并与价格线统一为一个实体模型；警报线颜色约定为统一黄色，参考线以 `enabled:false` 的 Alert 持久化。

## Impact

- `frontend/src/components/chart/NativeChart.tsx`：承载右键菜单浮层、价格线设置弹窗、overlay 与 store 的双向同步。
- `frontend/src/components/chart/KLineChartProView.tsx`：暴露 Chart 实例（`getChart`），供坐标换算与 overlay 事件挂载。
- `frontend/src/lib/alertsStore.ts`：扩展/明确 Alert 实体语义（`enabled:false` 参考线），补充按品种查询与颜色派生辅助函数。
- `frontend/src/lib/chartController.ts`：接入 `AutoLayerController` 或等价 overlay 生命周期管理（画线、清线、按品种重绘）。
- `frontend/src/lib/transform.ts`：复用 `priceLineToOverlay`。
- `frontend/src/App.tsx`、`frontend/src/components/modals/CreateAlertModal.tsx`：支持以右键价格预填创建警报弹窗。
- 新增组件：`ChartContextMenu.tsx`、`PriceLineSettingsModal.tsx`。
- 依赖：klinecharts v9.8.10 的 `convertFromPixel` / `createOverlay` / overlay 事件（`onClick`、`onPressedMoveEnd`）。
