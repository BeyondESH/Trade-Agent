## MODIFIED Requirements

### Requirement: 全界面中文文案

系统 SHALL 通过统一 i18n 字典(`frontend/src/lib/i18n.ts`,提供 `t(key)` 中文文案)将模板 UI 外壳全部可见文案汉化,覆盖:桌面标题栏、全局导航栏、顶部图表工具栏、绘图工具栏、多图表网格水印、右侧停靠栏各面板(自选股/提醒/新闻/数据窗口/热榜/财经日历/订单簿/社区)、底部停靠栏各面板、8 个全视图与全部弹窗;不再存在硬编码英文 UI 文案。所有用户可见文案 MUST 经 `t()` 查阅字典,复用既有键优先,仅当字典缺失时按"英文键 → 中文值"追加新键(`t()` 未命中时回退原键)。审计确认残留文案的组件(新闻日历/新闻面板/订单簿/交易面板/自选股面板/桌面标题栏/热力图/社区观点/底部时间栏)MUST 完成替换。`components/views/agent/**` 子树的硬编码中文 SHALL 视为已符合中文目标语种并排除本次扫除;若引入多语言需求,该子树 MUST 单独立项处理。

#### Scenario: 中文文案展示

- **WHEN** 用户打开应用外壳(标题栏/导航栏/右侧栏/视图)
- **THEN** SHALL 展示中文文案(如"自选股""提醒""订单簿""新闻"等),无英文硬编码 UI 文本残留

#### Scenario: 字典覆盖校验

- **WHEN** 对 UI 组件做文案扫描
- **THEN** 除 symbol/ticker/专业术语(如 LONG/SHORT)外,SHALL 无硬编码英文 UI 字符串,组件统一引用 `t()` 字典

#### Scenario: 复用既有键

- **WHEN** 某组件需要本地化一段文案,而字典中已存在等价键(如 `Order Book (DOM)`、`Day Range`、`24h Volume`、`Market Cap`、`Loading...`、`All Loaded`)
- **THEN** 组件 SHALL 复用该键,MUST NOT 硬编码字面量

#### Scenario: 缺失键追加并可解析

- **WHEN** 某文案在字典中无对应键
- **THEN** SHALL 以"英文键 → 中文值"追加新键,且 `t(newKey)` SHALL 返回中文值而非回退英文键

#### Scenario: agent 子树边界

- **WHEN** 执行本次文案扫除
- **THEN** `components/views/agent/**` 的硬编码中文 SHALL NOT 被要求改写,且该排除 SHALL 有明确理由记录
