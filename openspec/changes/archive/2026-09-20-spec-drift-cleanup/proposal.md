## Why

规格库中仍存在一大批"已废弃的多图表网格 / 跨格同步 / 活动格"规格（`chart-sync-bus`、`multichart-active-chart`、`layout-persistence`，以及 `chart-shell-integrity`、`tv-template-shell`、`chart-terminal` 中的相关条款），它们与当前实现相矛盾：现网是**单个** klinecharts-pro 实例、无多图网格、无活动格、无跨格同步（`terminal-layout` spec 已明确此点，`klinecharts-pro-chart` 亦要求"单个 pro 实例（不再有多格网格）"）。代码侧已核实：`chartSyncBus`/`chartSyncActions`/`cellChartSetup` **完全不存在**，仅 `frontend/src/api/types.ts:394-425` 残留未被任何消费方引用的 `GridCellPersist`/`GridLayoutPersist`/`ChartConfig.grid` 类型。若不清扫，后续实现者会按废弃规格重建已移除功能。此外，`design-system` 含一条"Tailwind 扫描覆盖 Vue SFC"条款（本项目是 React + `.tsx`），`chart-replay`/`replay-paper-trading` 描述的用户可见回放 UI 从未接线（`frontend/src/lib/replayEngine.ts` 仅被自身测试引用，无任何组件 import）。

## What Changes

- **移除多图表网格相关 requirements（REMOVED）**：`chart-sync-bus`（全部）、`multichart-active-chart`（全部）、`layout-persistence`（全部）、`chart-shell-integrity` 的 "Sync-wired multi-chart cells"。
- **修正残留"多格/cell"措辞（MODIFIED）**：`chart-shell-integrity`（"Single live-candle data source" 的 cell 0 语义、"Single symbol-search entry point" 的 active cell 语义）、`tv-template-shell`（"多图表网格" 外壳描述 + 引用已删除 `lib/{chartSyncBus,chartSyncActions,cellChartSetup}` 的数据层条款）。
- **重命名含废弃概念的 requirement（REMOVED + ADDED）**：`chart-terminal` 的 "基于 Pro 的图表终端" 正文与场景名含"多格/每格"，改为 "基于 Pro 的单图图表终端"；`design-system` 的 "Tailwind 扫描覆盖 Vue SFC" 改为 "Tailwind 扫描覆盖 React TSX"。
- **回放决策（REMOVED + 文档化迁移）**：`chart-replay`、`replay-paper-trading` 的用户可见回放 requirements 从未构建，予以 REMOVED；低层原语 `lib/replayEngine.ts` 与 `datafeed.suspendUpdates` 保留在代码中，未来如需再提案。
- 本 change **仅产出规格 delta 与验证任务**，不改应用代码；主规格的实际合并发生在 `openspec archive` 时。

## Capabilities

### New Capabilities
- (none)

### Modified Capabilities
- `chart-sync-bus`: 移除全部跨格同步总线 requirements（单图终端已无此概念）。
- `multichart-active-chart`: 移除活动图选择 requirement（单图终端无多格）。
- `chart-shell-integrity`: 移除 "Sync-wired multi-chart cells"；修正 live-candle/search 中的 cell 措辞为单图语义。
- `chart-terminal`: REMOVED "基于 Pro 的图表终端"（含多格措辞），ADDED "基于 Pro 的单图图表终端"。
- `tv-template-shell`: 修正外壳描述中的"多图表网格"与引用已删除同步模块的数据层条款。
- `layout-persistence`: 移除多格布局与每格状态持久化 requirement（不再有多格）。
- `design-system`: REMOVED "Tailwind 扫描覆盖 Vue SFC"，ADDED "Tailwind 扫描覆盖 React TSX"。
- `chart-replay`: 移除回放引擎与回放控制条（用户可见回放未构建）。
- `replay-paper-trading`: 移除回放模拟下单与回放小结（未构建）。

## Impact

- **规格/文档**：上述 9 个 spec 的 delta；运行时代码不改。
- **类型残留**：`frontend/src/api/types.ts` 的 `GridCellPersist`/`GridLayoutPersist`/`ChartConfig.grid` 为死类型，建议随本 change 一并清理（列为任务，非本次编辑）。
- **行为**：无运行时行为变化；仅消除规格与实现漂移，防止误建已移除功能。
- **风险**：低。移除的是从未实现的规格；若未来重启多图/回放功能，需按新 change 重新提案。
