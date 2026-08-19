## Why

全球市场概览中的"抄底逃顶指标"卡片只渲染最后一个指标的说明文字，不显示任何信号数据。`/api/blockbeats/data/bottom_top_indicator` 实际返回 12 个指标的数组，每项含 `name`（指标名）、`info`（说明）、`status`（Buy/Hold/Sell 抄底逃顶信号）与 `create_time`，但前端仅取数组最后一项且丢弃 `status` 字段，导致 12 条真实信号完全未展示。

## What Changes

- `useMarketOverview.normalizeTopCards` 不再只取 `bottom_top_indicator` 数组最后一项，改为解析完整数组，将每项的 `name` / `info` / `status` 归一化为结构化指标列表。
- `MarketsView` 的 `IndicatorCard` 从"单条说明文字"改为"全部指标信号列表"：每行展示指标名 + 信号徽章（`Buy`=绿/抄底、`Sell`=红/逃顶、`Hold`=灰/持有、空值=N/A），`info` 作为次要说明保留，卡片标注数据时间。
- Data Window 的 "Market Pulse" 面板中 `bottom_top_indicator` 行不再退化为 `"12 items"`，改为展示信号摘要（如 `Buy 3 / Hold 9`）。
- 更新 spec `markets-overview-real-data`：将"抄底逃顶指标以说明卡呈现"场景升级为"信号列表展示"。`status` 为上游真实字段，展示它不构成编造数值，仍满足 MUST NOT 编造数值的约束。

## Capabilities

### New Capabilities
<!-- 无新增能力 -->

### Modified Capabilities
- `markets-overview-real-data`: 抄底逃顶指标卡片从"仅名称+说明文字"改为"全部指标 + 信号状态列表"，对应场景描述同步更新。

## Impact

- `frontend/src/hooks/useMarketOverview.ts`：`TopCardData` 类型与 `normalizeTopCards` 解析逻辑。
- `frontend/src/components/views/MarketsView.tsx`：`IndicatorCard` 组件渲染。
- `frontend/src/lib/marketPulse.ts`：`bottom_top_indicator` 的摘要展示。
- `frontend/src/lib/i18n.ts`：可能新增信号徽章相关 key。
- 测试：`useMarketOverview.test.ts` 更新 fixture；新增/更新 MarketsView 相关测试。
- 后端零改动（`/blockbeats/data/*` 纯透传，`status` 已在响应中）。
