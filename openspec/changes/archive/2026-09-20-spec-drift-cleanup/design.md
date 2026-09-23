## Context

本 change 的判据是"实现即真相"：当前终端是单个 klinecharts-pro 实例（`frontend/src/components/chart/KLineChartProView.tsx` 注释明确"Single native klinecharts-pro chart. Replaces the former multi-cell grid"；`terminal-layout` 与 `klinecharts-pro-chart` spec 均要求单图、无多格/活动格/跨格同步）。

已核实的漂移（按规格逐条读取 + 代码检索）：

- `chart-sync-bus/spec.md`：3 条 requirement 全部描述跨 cell 总线（`syncOrigin` 防回声），无任何实现。
- `multichart-active-chart/spec.md`：多格"活动图"选择，无实现。
- `layout-persistence/spec.md`：多格布局/每格状态/同步开关持久化，无实现（`/chart-config` 现仅承载单图 `ChartConfig`）。
- `chart-shell-integrity/spec.md`：`Sync-wired multi-chart cells` requirement 直接点名 `chartSyncBus`/`chartSyncActions`/`cellChartSetup`（不存在）；另 `Single live-candle data source` 的 scenario 提到 `suspendUpdates(true)` 停止转发到"cell 0"，`Single symbol-search entry point` 提到"switches the active cell"。
- `chart-terminal/spec.md`：requirement 与 scenario 提到"多格布局中，每个图表实例…""多格布局下切换全局 dark/light 主题"。
- `tv-template-shell/spec.md`：外壳描述含"多图表网格"；"非 UI 数据层保留"要求保留 `lib/{chartSyncBus,chartSyncActions,cellChartSetup,chartChromeBridge,drawingPersistence}.ts`，而这些模块已不存在（检索 `chartSyncBus|chartSyncActions|cellChartSetup|chartChromeBridge` 在 `frontend/src` 无命中）。
- `design-system/spec.md`："Tailwind 扫描覆盖 Vue SFC"——`frontend/src` **无任何 `.vue` 文件**（仅 `node_modules/vitepress` 内有），`tailwind.config.js` 的 content 实为 `./src/**/*.{ts,tsx}`。
- `chart-replay/spec.md` + `replay-paper-trading/spec.md`：描述用户可见回放与纸面交易 UI；`lib/replayEngine.ts` 与其单测存在、`api/datafeed.ts:146 suspendUpdates` 存在，但 `replayEngine` 仅被 `replayEngine.test.ts` 引用，**无任何组件消费**；回放控制条 / 纸面下单 / 小结 UI 全部未构建。
- 代码残留：`frontend/src/api/types.ts:394-425` 的 `GridCellPersist`/`GridLayoutPersist`/`ChartConfig.grid` 未被任何消费方引用（检索 `GridLayoutPersist|GridCellPersist|syncFlags|layoutCount` 仅命中定义处）。

## Goals / Non-Goals

**Goals:**

- 让规格库与"单图终端"实现一致，消除会诱导重建已移除功能的条款。
- 对从未构建的回放/纸面交易 UI 明确做出"移除并文档化迁移"的决策。
- 修正与 React 技术栈不符的 design-system 条款。

**Non-Goals:**

- 不改任何应用代码（本 change 为 artifact-only，只编辑 `openspec/changes/spec-drift-cleanup/**`）。
- 不直接编辑 `openspec/specs/**`（主规格合并由 `openspec archive` 完成）。
- 不删除 `lib/replayEngine.ts` 等既有原语（保留待未来重新提案）。
- 不处理其它无关漂移（如 `ui-i18n-zh` 中"多图表网格水印"等边缘措辞，除非本 change 已列能力覆盖）。

## Decisions

**决策 1：REMOVED 而非"绕过"多图规格**

对 `chart-sync-bus`/`multichart-active-chart`/`layout-persistence` 全量 REMOVED，并移除 `chart-shell-integrity` 的 `Sync-wired multi-chart cells`。理由：这些能力在代码中零实现且与 `terminal-layout`/`klinecharts-pro-chart` 的"单图"要求直接冲突；保留即使标注"未启用"也会误导。备选：保留并标注"deferred"——仍会让实现者以为需要构建，弃用。

**决策 2：修正残留措辞为单图语义**

`chart-shell-integrity` 的两条 requirement 与 `tv-template-shell` 的两条 requirement，其正文/场景**名**不含废弃概念，用 MODIFIED 精确改写为单图实例并保留原场景名（archive 要求 MODIFIED 的 incoming 场景集合必须覆盖 current 场景名，见 `specs-apply.js#findMissingCurrentScenarios`），保留其余有效条款（数据源、搜索入口、指标分栏、外壳/数据层）。

`chart-terminal` 的 `基于 Pro 的图表终端` 正文与场景名（"多格布局中…"、"每格主题跟随"）本身含废弃的多格概念，无法在不误导的前提下原样保留 → 采用 REMOVED + ADDED：移除旧 requirement，新增 `基于 Pro 的单图图表终端`，能力（周期条/画线/指标/搜索/AI 联动）全部保留、仅改单图措辞。

**决策 3：design-system Vue SFC → React TSX（REMOVED + ADDED）**

`frontend/src` 无 `.vue`（仅 `node_modules/vitepress` 内有），`tailwind.config.js` 已扫 `./src/**/*.{ts,tsx}`。由于 requirement 名与场景名（"Vue SFC 样式生效"）均含错误技术栈，且 MODIFIED 不允许改场景名，故 REMOVED 旧 requirement + ADDED `Tailwind 扫描覆盖 React TSX`（含"配置扫描 TSX 而非 Vue"新场景）。

**决策 4：回放——REMOVED + 迁移说明**

用户可见回放（`chart-replay` 两条 requirement）与纸面交易（`replay-paper-trading` 两条 requirement）从未构建，REMOVED。`Reason` 记录"UI 未构建、当前单图终端无回放入口"；`Migration` 记录"低层原语 `lib/replayEngine.ts` 与 `datafeed.suspendUpdates` 已存在且保留；未来如需回放，另立 change 并复用这些原语"。备选：保留并加"未来接线"任务——会保留悬空 requirement，弃用。

**决策 5：`tv-template-shell` 数据层条款修正**

其"非 UI 数据层保留"点名了已删除模块。MODIFIED 为只保留确实存在的模块（`api/{client,bitgetWs,datafeed,types,transform}.ts`、`KLineChartProView.tsx`、`klinecharts-pro-theme.css`），移除对 `lib/{chartSyncBus,chartSyncActions,cellChartSetup,...}` 的引用。

**决策 6：死类型清理列为任务，不在本 change 编辑**

`api/types.ts` 的 `GridCellPersist`/`GridLayoutPersist`/`ChartConfig.grid` 建议清理，但属应用代码，列入 tasks 供实现阶段处理。

## Risks / Trade-offs

- [未来确实要重启多图/回放] → REMOVED 的 `Migration` 已给出重新提案路径；`replayEngine.ts` 原语保留，成本可控。
- [MODIFIED 漏抄原 requirement 导致归档丢内容] → 已逐字复制主规格 requirement 全文再修改（见各 delta）。
- [遗漏其它漂移规格] → 本 change 覆盖检索命中"多格/cell/grid/sync"的全部规格；边缘措辞（如 i18n 水印描述）不影响"误导实现"的主要风险，暂不处理。
- [不做代码清理导致死类型残留] → 已列为 tasks，明确标注属实现阶段。
