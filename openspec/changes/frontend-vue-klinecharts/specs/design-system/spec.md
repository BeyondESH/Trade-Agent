## MODIFIED Requirements

### Requirement: Tailwind 设计系统与 UI 原子

系统 SHALL 接入 Tailwind CSS 并定义 OKX 风格设计 tokens(深色底、涨绿跌红、紧凑排版),提供一套可复用 Vue 3 UI 原子组件(Panel/Button/Input/Tabs/Table/Modal/Badge)。工程 MUST 仍通过 typecheck 与生产构建。

#### Scenario: 构建通过

- **WHEN** 引入 Tailwind 与 UI 原子后运行 typecheck 与 build
- **THEN** SHALL 均无错误

#### Scenario: 涨跌配色一致

- **WHEN** 展示价格/涨跌/盈亏
- **THEN** 上涨 SHALL 用绿色 token、下跌用红色 token
