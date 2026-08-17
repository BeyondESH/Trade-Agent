## MODIFIED Requirements

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
