## ADDED Requirements

### Requirement: 全界面中文文案
系统 SHALL 通过统一 i18n 字典(`frontend/src/lib/i18n.ts`,提供 `t(key)` 中文文案)将模板 UI 外壳全部可见文案汉化,覆盖:桌面标题栏、全局导航栏、顶部图表工具栏、绘图工具栏、多图表网格水印、右侧停靠栏各面板(自选股/提醒/新闻/数据窗口/热榜/财经日历/订单簿/社区)、底部停靠栏各面板、8 个全视图与全部弹窗;不再存在硬编码英文 UI 文案。

#### Scenario: 中文文案展示
- **WHEN** 用户打开应用外壳(标题栏/导航栏/右侧栏/视图)
- **THEN** SHALL 展示中文文案(如"自选股""提醒""订单簿""新闻"等),无英文硬编码 UI 文本残留

#### Scenario: 字典覆盖校验
- **WHEN** 对 UI 组件做文案扫描
- **THEN** 除 symbol/ticker/专业术语(如 LONG/SHORT)外,SHALL 无硬编码英文 UI 字符串,组件统一引用 `t()` 字典

### Requirement: 统一中文字体栈
系统 SHALL 在 `frontend/src/index.css` 定义全局中文字体栈(优先 `PingFang SC`/`Microsoft YaHei`/`Noto Sans CJK SC`,西文回退 `Inter`/`Segoe UI`,数字保留等宽特性)并应用到 `html/body`;各组件不再各自声明冲突字体,价格/数字类文本保留 `font-variant-numeric: tabular-nums` 等宽对齐。

#### Scenario: 全局字体生效
- **WHEN** 应用渲染任意组件
- **THEN** SHALL 继承全局字体栈,中文显示正常、数字列等宽对齐,无组件级字体覆盖冲突

#### Scenario: 数字等宽
- **WHEN** 显示价格/数量/时间戳等数字列
- **THEN** SHALL 使用等宽数字特性,列对齐不抖动

#### Scenario: 字体栈可降级
- **WHEN** 运行环境无 PingFang/微软雅黑
- **THEN** SHALL 回退到系统无衬线字体,中文仍可正常渲染
