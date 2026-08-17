## Why

TradingView 1:1 重建的第三个 change，也是工作量最大的一环：把中心图表区从"1 个受控主图 + N 个哑图"升级为**多格全同步的专业多图表工作区**（探索阶段拍板的档位 3）。当前 `ChartGrid.tsx` 写死 cell 0 为受控主图，其余格只拿到初始 symbol/period 且各自独立，一开 2 格即露馅；且 `ChartCell` 硬编码 `theme="dark"`，多布局下其他格不跟随主题。

档位 3 要求：点击任一格成为**活动图**（顶栏操作作用于活动格），并在格间同步 Symbol / Period / 十字线 / 缩放平移 / 绘图五类状态（各为独立开关，默认全开）。其中绘图同步只在**同 symbol** 的格之间镜像，按数据坐标（timestamp+value）重投影以支持不同周期。同时补齐**模板与布局持久化**（每格 symbol/period/指标/绘图 + 同步开关随布局保存，走后端 `/chart-config`）。

## What Changes

- **活动图（click-to-activate）**：点击任一格使其成为活动图，活动格有可视边框高亮；顶栏的 symbol/period/图表类型/指标操作作用于**活动格**而非固定 cell 0。
- **ChartSyncBus 同步总线**：新增跨 cell 事件总线，广播/接收五类同步事件，带 `syncOrigin` 标记防回声循环；每格注册为总线参与者。
- **五类同步开关**（独立、默认全开）：
  - Symbol 同步：活动格切品种，其余格跟随。
  - Period 同步：活动格切周期，其余格跟随。
  - 十字线同步：一格悬停某时间点，其余格按 timestamp 对齐十字线。
  - 缩放/平移同步：一格改可视范围，其余格时间轴跟随。
  - 绘图同步：仅**同 symbol** 的格之间，按 `{timestamp,value}` 重投影镜像 overlay 的创建/修改/删除。
- **每格主题跟随**：`ChartCell` 移除硬编码 `theme`，由 App 主题驱动全部格。
- **模板与布局持久化**：`handleSaveTemplate` 由桩改为真实保存——每格的 symbol/period/指标/绘图 + 布局格数 + 同步开关，序列化经 `/chart-config`；重载可复原。
- **ChartGrid 重写**：从"cell 0 primary + 哑图"改为 N 个对等参与者 + 活动格概念。

## Capabilities

### New Capabilities
- `multichart-active-chart`: 多格布局中的活动图选择与顶栏操作路由。
- `chart-sync-bus`: 跨 cell 的 Symbol/Period/十字线/缩放/绘图五类同步（含独立开关与防回声）。
- `layout-persistence`: 多格布局与每格状态（symbol/period/指标/绘图/同步开关）的保存与恢复。

### Modified Capabilities
- `terminal-layout`: 多图表网格从"每格独立"升级为"活动图 + 可配置同步"。
- `chart-terminal`: 每格主题跟随全局主题；绘图按数据坐标可跨周期镜像。

## Impact

- **前端**：`components/chart/ChartGrid.tsx`（重写）、`ChartCell.tsx`（对等参与者、主题跟随、注册总线）、新增 `lib/chartSyncBus.ts`、`App.tsx`（活动格状态、顶栏操作路由到活动格、保存/恢复）、`lib/transform.ts`（复用 time↔index 做重投影）、`lib/drawingPersistence.ts`（每格绘图序列化）、`layout/TVTopBar.tsx`（同步开关 UI）。
- **后端**：沿用 `/chart-config`（`PUT`/`GET` 已存在），扩展保存的 state 结构（每格数组 + 同步开关），`chartstore` 无破坏性变更。
- **性能**：多实例十字线/缩放同步需节流（rAF 合并），绘图镜像需 diff 去抖。
- **迁移**：旧的以 `instId` 存的绘图 key 与新的 `category:instId` series key 可能失配；本 change 统一 series key 规范，旧数据一次性失配可接受。
