# design-system Specification

## Purpose
TBD - created by archiving change frontend-okx-theme. Update Purpose after archive.
## Requirements
### Requirement: TV 设计 tokens 与双主题

系统 SHALL 以 CSS 变量定义 TradingView 色表并支持 dark/light 双主题一键切换，两主题只换颜色不换布局尺寸。Dark：背景 `#131722`、面板 `#1e222d`、分隔线/hover `#2a2e39`、主文字 `#d1d4dc`、次要 `#787b86`、涨 `#089981`、跌 `#f23645`、强调 `#2962ff`。Light：背景/面板 `#ffffff`、分隔线 `#e0e3eb`、主文字 `#131722`、次要 `#787b86`、hover `#f0f3fa`、涨跌与强调不变。系统 MUST NOT 在组件中硬编码颜色。

#### Scenario: 双主题切换

- **WHEN** 在设置中切换 dark/light
- **THEN** 全部面板、图表 chrome（含 klinecharts-pro）与文字 SHALL 随主题变化，布局尺寸与涨跌色不变

#### Scenario: 涨跌配色一致

- **WHEN** 展示价格/涨跌/盈亏
- **THEN** 上涨 SHALL 用 `#089981`、下跌用 `#f23645`

#### Scenario: 组件无硬编码色

- **WHEN** 渲染任意组件
- **THEN** 其颜色 SHALL 全部引用主题 token，MUST NOT 出现独立硬编码色值

### Requirement: TV 字体与排版规范

系统 SHALL 使用自托管双字体栈：西文（拉丁字母、数字、西文标点）用 **Google Sans Flex**，中文（汉字、CJK 标点）用 **Noto Sans SC**（思源黑体），最后以系统 sans-serif 兜底；字体栈中西文字体 SHALL 排在中文字体之前，并依赖各 `@font-face` 的 `unicode-range` 完成逐字符分流。字号基准 12px，坐标轴刻度/状态栏/表格数值 11px，品种名/弹窗标题 13-14px，行高 1.2-1.4；数字 SHALL 使用 `tabular-nums` 防止横向跳动；圆角按钮/输入 4px、浮层/上下文条 6px、弹窗 8px；边框统一 1px；唯一阴影 `0 2px 8px rgba(0,0,0,.4)` 仅用于浮层。

#### Scenario: 中西文字体分流

- **WHEN** 渲染包含中英文与数字的混排文本
- **THEN** 拉丁字符与数字 SHALL 由 Google Sans Flex 渲染，汉字 SHALL 由 Noto Sans SC 渲染

#### Scenario: 字体自托管无外部依赖

- **WHEN** 在无外网环境加载应用
- **THEN** 西文与中文 SHALL 均以自托管字体正确渲染，MUST NOT 请求外部字体 CDN

#### Scenario: 数字等宽对齐

- **WHEN** 渲染价格/成交量/盘口等数字列
- **THEN** SHALL 应用 `tabular-nums`，数值刷新时字符不横向抖动

#### Scenario: 圆角与阴影分级

- **WHEN** 渲染按钮、浮层、弹窗
- **THEN** SHALL 分别使用 4/6/8px 圆角，仅浮层带 `0 2px 8px rgba(0,0,0,.4)` 阴影

#### Scenario: 字号与行高基准不变

- **WHEN** 渲染坐标轴刻度、表格数值、品种名与弹窗标题
- **THEN** SHALL 分别为 11px、11px、13-14px，行高 SHALL 保持 1.2-1.4，布局尺寸不因换字体而改变

### Requirement: 高密度 UI 与渐进式披露

系统 SHALL 采用高密度但不拥挤的布局：icon-only 按钮为主、次级控件 hover 才显现、无卡片无阴影；市场列表/盘口/legend 的行操作（如隐藏/设置/删除）SHALL 在 hover 行时渐显，静态时保持界面干净。所有功能图标 SHALL 使用线性 SVG 图标（`ui/icons`，24 视框、1.2–1.5px 描边、token 着色），MUST NOT 使用 emoji 或 ASCII 字形（如 🔍 👤 ▼ ▃▂ ▦）作为图标。

#### Scenario: 行操作 hover 渐显

- **WHEN** 鼠标悬停 market/watchlist/盘口行或 legend 指标行
- **THEN** 该行的操作 icon SHALL 渐显；未悬停时 SHALL 隐藏

#### Scenario: 图表 legend 静态干净

- **WHEN** 不悬停图表 legend
- **THEN** legend SHALL 仅显示品种名与 OHLC 数值，无操作按钮

#### Scenario: 图标为线性 SVG

- **WHEN** 渲染顶栏、右图标条、底部 Tab 的功能图标
- **THEN** 每个图标 SHALL 为线性 SVG 组件且着色取自 token，SHALL NOT 为 emoji/ASCII 字形

### Requirement: 双语切换

系统 SHALL 提供 zh/en 双语文案字典，所有自建组件文案 SHALL 通过 `t(key)` 渲染；在设置中切换语言 SHALL 即时生效并持久化，且同步 klinecharts-pro 弹窗的 locale（`setLocale('zh-CN'|'en-US')`）。

#### Scenario: 语言即时切换

- **WHEN** 在设置中切换语言
- **THEN** 自建组件文案与图表弹窗 SHALL 同步切换语言，刷新后保持

#### Scenario: 字典完整

- **WHEN** 遍历界面可见文案
- **THEN** 每个 key SHALL 在 zh/en 两字典均有非空翻译

### Requirement: Tailwind 扫描覆盖 Vue SFC

系统 SHALL 使 Tailwind content 扫描覆盖 Vue SFC 组件（`.vue` 文件），确保组件内使用的工具类进入构建产物 CSS。

#### Scenario: 产物包含工具类

- **WHEN** 执行生产构建
- **THEN** 产物 CSS SHALL 包含组件使用的关键工具类（如 `.bg-panel`、`.flex`、`.h-screen`）

#### Scenario: Vue SFC 样式生效

- **WHEN** 在浏览器中打开应用
- **THEN** 组件 SHALL 呈现预期的布局、高度与配色（非无样式裸布局）

