## Context

`frontend/src/lib/i18n.ts` 是一个扁平字典：英文键 → 中文值，`t(key)` 命中返回中文，未命中回退原键（英文）。少量历史条目用了中文键（如 `"最新成交"`），但主流约定是英文键。`ui-i18n-zh` 规格要求模板 UI 外壳文案全部汉化、无硬编码英文，并有"字典覆盖校验"场景。

审计（逐文件 Read + grep 验证）发现两类残留：

1. **键已存在却硬编码中文字面量**（绕过字典）：
   - `views/NewsCalendarView.tsx`：`加载中...`（183、229）、`新闻获取失败:`（187）、`已加载全部`（231）——键 `Loading...`/`News feed unavailable:`/`All Loaded` 已在字典。
   - `sidebar/NewsPanel.tsx`：`加载中...`（95）；`暂无新闻`（141）——前者键已存在。
   - `sidebar/OrderBookPanel.tsx`：`订单簿 (DOM)`（27）、`精度: 0.01`（29）、`价格`（34）、`数量`（35）、`合计`（36）、`价差:`（65）——前四个键已在字典。
   - `sidebar/WatchlistPanel.tsx`：`日内区间`（145）、`24小时成交量`（171）、`市值`（177）——键 `Day Range`/`24h Volume`/`Market Cap` 已在字典。
   - `timebar/BottomTimebar.tsx`：`UTC+0 (实时)`（72）。
2. **硬编码英文**（无中文）：`bottom/TradingPanel.tsx` 子标签（89-92）与 `Market Close`（157）/`Cancel`（202）/`100x Cross Margin`（224）；`desktop/DesktopTitleBar.tsx` `快速搜索...`（274，中文）与 `Notifications`（305）；`views/HeatmapsView.tsx`（88、106、117、162、166）；`views/CommunityIdeasView.tsx`（57）。

约束：不引入多语言运行时；不改 `t()` 机制；不改 `i18n.test.ts` 现有核心键断言。已核查 `views/MarketsView.tsx` 无硬编码 UI 文案（仅注释含中文），`MarketsView.test.tsx` 断言来自数据（`N/A`/`BUY`/`HOLD`/时间），无需改动。

## Goals / Non-Goals

**Goals:**
- 上述组件所有用户可见文案改走 `t()`；能复用既有键的一律复用，仅缺失才新增键（沿用"英文键 → 中文值"）。
- 新增键在 `i18n.test.ts` 有解析断言，防止拼写漂移导致回退英文。
- 受影响的字符串断言测试保持/更新为通过。

**Non-Goals:**
- 不引入语言切换、多语言运行时、`react-i18next` 等依赖。
- 不翻译业务数据（新闻标题/摘要、后端返回的指标名 `市场脉动指数`、交易对名等）。
- 不扫除 `components/views/agent/**`（见决策 2）。
- 不重命名既有中文键（如 `"最新成交"`）以保持兼容。
- 不处理审计证据之外的字符串（如 `BottomTimebar` 其他 `title` 属性）。

## Decisions

**决策 1：复用优先，缺失才新增；新增用英文键**

每个替换点先确认字典已存在等价键（如 `Price`/`Size`/`Order Book (DOM)`/`Day Range`/`24h Volume`/`Market Cap`/`Loading...`/`News feed unavailable:`/`All Loaded`）则直接 `t()`；缺失的（`No news`、`Spread:`、`Positions`、`Working Orders`、`Trade History`、`Broker Summary`、`Market Close`、`Cancel`、`100x Cross Margin`、`Quick search...`、`Notifications`、Heatmaps/Community 各标题）按"英文键 → 中文值"追加。

- 理由：复用避免字典膨胀与语义漂移；英文键保持与主流约定一致、可扫描。
- 备选：用中文键（沿用 `"最新成交"`）——会让字典风格进一步分裂，弃用。

**决策 2：`components/views/agent/**` 排除本次扫除**

`agent/**`（约 20 个文件）硬编码中文，但：

- 目标语种即中文，该子树当前渲染结果已正确；字典机制是"英文键 → 中文值"，把中文源串再包一层不改变任何用户可见输出。
- 这些是 QUANT LAB 领域术语（因子、IC、Walk-forward、回撤等），字典中无对应英文键；转换需凭空发明英文键，收益为零、改动面大（含多份 `*.test.tsx`）。
- `ui-i18n-zh` 规格范围是"模板 UI 外壳 … 8 个全视图与全部弹窗"，agent 子树属专用分析工作台，其文案策略留待多语言需求出现时单独立项。

结论：排除，并在 spec 中显式界定；若将来引入多语言，agent 子树须单独扫除（记为后续项）。备选：纳入本次——被否决（高 churn、零收益）。

**决策 3：静态文案与外插值分离**

含动态部分的字符串用"键 + 客户端拼接"，沿用既有 `t('Create alert for').replace('%s', …)` 模式：如 `Positions (${n})` → `t('Positions') + ' (' + n + ')'`；Heatmaps 的 `Total Tracked Market Cap: ${x}B` → `t('Total Tracked Market Cap') + ': $' + x + 'B'`。

- 理由：字典保持扁平字符串，不引入插值语法；计数/金额格式化仍在调用点。
- 备选：在值里写 `%s`/`{n}` 占位——现有 `t()` 不支持替换，需改机制，超出本变更范围。

**决策 4：测试同步策略**

- `NewsPanel.test.tsx:72` 断言 `暂无新闻`：新增键 `"No news": "暂无新闻"` 后，`t('No news')` 输出不变，断言保持通过（无需改）。
- `panels.spec.ts:18` 使用 `/订单簿|Order Book/i`，兼容替换
- `MarketsView.test.tsx`：断言来自数据，不改。
- `i18n.test.ts`：把新增键加入"translates known keys"或"covers the core shell labels"，断言 `t(k) !== k`。

## Risks / Trade-offs

- [键拼写错误 → `t()` 回退英文，界面出现英文] → 新增键全部在 `i18n.test.ts` 断言解析。
- [同一英文键在不同组件期望不同中文] → 新增前先在字典检索，存在则复用；确需不同语义时用更具体的键名（如 `Spread:` vs `Spread: 0.02 (0.01%)`）。
- [替换触发既有测试断言失败] → 已定位唯一受影响的 `NewsPanel.test.tsx`（由新增键保持输出）与 `panels.spec.ts`（正则兼容）。
- [范围蔓延到未审计字符串] → 严格按审计清单处理，其余记入后续项。
- [agent 子树不一致] → 在 spec/design 显式记录边界与理由，避免被误判为遗漏。

## Migration Plan

纯前端字符串替换，无数据/API 迁移。回滚：`git revert` 对应提交即可；新增键即便保留也无副作用。

## Open Questions

- `BottomTimebar` 其余硬编码 `title`（如 `Go to specific date`、`百分比坐标`）是否纳入下一轮扫除？
- 是否需要引入一个"禁止硬编码 CJK 文案"的静态扫描测试（对 `components/**` 白名单豁免 `agent/**`）以防回归？
- `OrderBookPanel` 的 `合计` 当前无字典键 `Total` 已存在，确认复用它而非新增（本设计复用 `Total`）。
