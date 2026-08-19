## 1. 数据归一化

- [x] 1.1 在 `useMarketOverview.ts` 新增 `TopIndicatorRow` 类型，`TopCardData` 中以 `indicators: TopIndicatorRow[]` 取代 `indicatorName`/`indicatorInfo` 字段
- [x] 1.2 修改 `normalizeTopCards`：解析 `bottom_top_indicator` 完整数组，逐项提取 `name`/`info`/`status`/`create_time` 到 `indicators`，数组为空或无有效项时返回空数组（等价无数据）

## 2. 信号徽章与卡片渲染

- [x] 2.1 新增信号徽章映射（`Buy`=绿/`Sell`=红/`Hold`=灰/空或未知=`N/A`），风格与现有 `ChangePill` 一致
- [x] 2.2 重写 `MarketsView.tsx` 的 `IndicatorCard`：渲染全部指标行（左=指标名+info 小字或 hover，右=信号徽章），标题栏标注数据时间；无数据时显示 `N/A` 占位
- [x] 2.3 若需要中文标签（如信号 tooltip 文案），在 `i18n.ts` 补充对应 key（无需：徽章为英文短词、指标名本身为中文）

## 3. Market Pulse 摘要

- [x] 3.1 在 `marketPulse.ts` 为 `bottom_top_indicator` 提供摘要特例：按 `status` 统计计数输出 `Buy n · Hold m`（空值不计），数组为空输出 `N/A`，其余端点行为不变

## 4. 测试与验证

- [x] 4.1 更新 `useMarketOverview.test.ts`：fixture 改为多指标数组，断言 `indicators` 逐项解析（name/info/status）与空数组语义
- [x] 4.2 新增/更新 `MarketsView` 的 `IndicatorCard` 测试：渲染全部指标行、徽章配色（Buy/Sell/Hold/N/A）、无数据时 `N/A` 占位
- [x] 4.3 运行 `npm run typecheck` 与 `npm test` 全部通过
