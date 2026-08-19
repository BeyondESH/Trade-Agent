## Context

`/api/blockbeats/data/bottom_top_indicator` 返回一个包含 12 个对象的数组，每项形如：

```
{ "name": "市场脉动指数", "info": "以下11种指标…", "create_time": "2026-08-19 08:03:09", "status": "" }
{ "name": "整体市场流动性指数", "info": "市值加权…", "create_time": "2026-08-19 08:03:09", "status": "Hold" }
{ "name": "USDC/USDT 溢价", "info": "…", "create_time": "2026-08-19 08:03:09", "status": "Buy" }
```

当前前端 `useMarketOverview.ts:113` 的 `normalizeTopCards` 只取 `last(indicator)` 的 `name`/`info`，丢弃 `status`，`MarketsView.tsx` 的 `IndicatorCard` 因而只渲染最后一条指标的说明文字。Data Window 的 `marketPulse.ts` 将整个数组 `flattenValue` 成 `"12 items"`。

约束：
- 后端零改动（纯透传）。
- 现有 spec `markets-overview-real-data` 要求"不得为指标编造或推导数值"——`status` 是上游真实字段，展示它不违反此约束；但需更新该场景描述。
- 界面为简体中文，i18n 走 `lib/i18n.ts` 的 `t()`。
- 全仓测试：`npm test`（vitest），`npm run typecheck`（tsc）。

## Goals / Non-Goals

**Goals:**
- 抄底逃顶指标卡片展示全部 12 个指标及其 `status` 信号（Buy/Sell/Hold/空）。
- 信号配色与现有 `ChangePill` 风格一致（绿 `#089981` / 红 `#f23645` / 灰）。
- Market Pulse 面板中该指标行不再显示 `"12 items"`。
- 更新 `markets-overview-real-data` spec 场景描述。

**Non-Goals:**
- 不改后端与数据缓存。
- 不新增数值推导（上游无数值，禁止编造）。
- 不改其他 10 个 data 端点的解析逻辑。
- 不修改 Data Window 其余指标的展示。

## Decisions

**D1: `TopCardData` 用结构化列表取代 `indicatorName`/`indicatorInfo` 两个字段**

新增类型：
```ts
export interface TopIndicatorRow {
  name: string;
  info: string;
  status: string;      // "Buy" | "Sell" | "Hold" | ""
  createTime: string;
}
```
`TopCardData` 中 `indicatorName`/`indicatorInfo` 替换为 `indicators: TopIndicatorRow[]`。空数组 = 无数据（等价于现在的 undefined 语义，UI 显示 N/A）。

- 备选：保留两个旧字段再另加列表。因旧字段仅被 `IndicatorCard` 使用（唯一消费方），直接替换更干净；`useMarketOverview.test.ts` 中相应断言同步更新。

**D2: 信号徽章映射 `Buy`/`Sell`/`Hold`/空**

- `Buy` → 绿底徽章，文案 `Buy`（tooltip/副文案含"抄底信号"）
- `Sell` → 红底徽章，文案 `Sell`
- `Hold` → 灰底徽章，文案 `Hold`
- 空/未知 → 灰底 `N/A`
- 未知字符串兜底为 `N/A`，不崩溃。
- 文案用英文短词保证宽度稳定；`info` 作为每行 hover title 或次行小字。

**D3: 卡片结构**

标题栏右侧显示数据时间（取首行 `create_time`，格式 `HH:mm` 或完整时间），下方为两列网格/单列列表，每行：左=指标名，右=信号徽章。`info` 放行内小字或 `title` 属性，避免卡片过高。

**D4: Market Pulse 摘要**

`marketPulse.ts` 中 `bottom_top_indicator` 不泛化为列表摘要；由于 `fetchMarketPulseEntry` 是通用函数，采用在 `MARKET_PULSE_ENDPOINTS` 上提供特例：统计数组内 `status` 出现次数，输出 `Buy 3 · Hold 9`（空值不计）。若数组为空则 `N/A`。

**D5: spec 更新**

`markets-overview-real-data` 的场景"抄底逃顶指标以说明卡呈现"改写为"抄底逃顶指标信号列表"，要求：展示全部指标的 `name` 与 `status` 徽章，`info` 可见，`status` 来自上游真实字段，不得编造数值。

## Risks / Trade-offs

- **`status` 取值未知性**（如出现 `Sell` 或未来新增枚举）→ 徽章映射按 `Buy`/`Sell`/`Hold` 白名单，其余一律灰 `N/A`，不会崩溃也不会误着色。
- **12 行列表可能使卡片变高** → 用紧凑单行布局 + 两列网格；`info` 收进 hover/tooltip，避免长文本撑高。
- **`indicatorName`/`indicatorInfo` 字段被删除影响其他消费方** → 已确认唯一消费方为 `IndicatorCard`；删除前 grep 复核。
- **Market Pulse 特例会破坏通用性** → 只在端点匹配 `bottom_top_indicator` 时走摘要分支，其他端点行为不变。
