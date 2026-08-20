# e2e-browser-journeys Specification

## Purpose
Playwright browser user journeys (L3): real rendering and interaction across
chart, tabs, paper orders, alert CRUD and right-dock panels, driven through
stable `data-testid` locators against a live frontend + backend.

## Requirements

### Requirement: Playwright 浏览器测试套件
前端 SHALL 提供基于 `@playwright/test` 的浏览器测试套件（`frontend/tests/e2e/`），通过 `playwright.config.ts` 的 webServer 自动拉起 vite dev 与后端，替代裸诊断脚本的临时方案。
#### Scenario: 一键运行
- **WHEN** 执行 `npm run test:e2e`
- **THEN** 套件 SHALL 自动启动前置服务、运行全部 spec、产出 trace/截图报告

#### Scenario: 复用现有观测句柄
- **WHEN** E2E 需要校验图表真实渲染数据
- **THEN** 套件 SHALL 复用 `window.__kline_chart__` 只读句柄读取数据列，而非 mock 渲染

### Requirement: 图表首屏渲染
E2E 测试 SHALL 验证默认 chart tab 真实渲染 K 线数据。
#### Scenario: 数据列非空
- **WHEN** 打开默认 chart tab 并等待就绪
- **THEN** `window.__kline_chart__.getDataList()` SHALL 返回非空数据列

### Requirement: symbol 与 timeframe 切换
E2E 测试 SHALL 验证用户切换 symbol 与 timeframe 时图表标题与数据列随之更新。
#### Scenario: 切换 symbol
- **WHEN** 用户在 symbol 搜索中输入新 ticker（如 ETHUSDT）并确认
- **THEN** 图表标题 SHALL 更新，数据列 SHALL 变为新 symbol 的行情

#### Scenario: 切换 timeframe
- **WHEN** 用户点击周期栏切换（如 1h → 15m）
- **THEN** 数据列的 bar 周期 SHALL 与所选 timeframe 一致

### Requirement: 多 tab 视图切换
E2E 测试 SHALL 验证新建/切换 Markets、Screener、Dashboard 等 tab 视图。
#### Scenario: 新建并切换 tab
- **WHEN** 用户新建 Markets/Screener/Dashboard tab 并切换
- **THEN** 对应视图 SHALL 渲染且无空白/报错

### Requirement: Paper 下单全流程
E2E 测试 SHALL 走通下单用户旅程：打开 OrderModal → 填单 → 确认 → 组合出现仓位。交易必须走 paper 路径（默认 `paper_only`），不得触及真实账户。
#### Scenario: 下单并确认
- **WHEN** 用户在 OrderModal 填写合法订单并确认
- **THEN** 确认流程 SHALL 完成（token 流程或 paper fill），portfolio/仓位数据 SHALL 反映新仓位

### Requirement: 告警 CRUD 全流程
E2E 测试 SHALL 走通告警创建、可见、删除的用户旅程，并与后端持久化一致。
#### Scenario: 创建并可见
- **WHEN** 用户通过 CreateAlertModal 创建告警
- **THEN** AlertsPanel 列表 SHALL 出现该告警，且后端 `/alerts` 可读回

#### Scenario: 删除后消失
- **WHEN** 用户删除已创建告警
- **THEN** 列表 SHALL 移除该项，后端 `/alerts` SHALL 不再包含

### Requirement: 右侧面板数据可见性
E2E 测试 SHALL 验证 OrderBook、TradesTape、News 等右侧面板真实显示数据（非空或明确空态）。
#### Scenario: 面板渲染数据
- **WHEN** 打开右侧面板
- **THEN** OrderBook SHALL 显示盘口、TradesTape SHALL 显示成交记录（或明确的空态文案），News SHALL 显示条目（或明确的空态）

### Requirement: 测试稳定性与隔离
E2E 套件 SHALL 通过稳定选择器（`data-testid`）、按 spec 的串行执行与状态清理，避免测试间竞态。
#### Scenario: 无共享状态竞态
- **WHEN** 多 spec 并行或连续执行
- **THEN** 涉及数据变更的 spec SHALL 使用独立状态或清理钩子，前序 spec 不污染后序结果

#### Scenario: 稳定定位器
- **WHEN** UI 文案受 i18n 或品牌调整影响
- **THEN** 关键交互元素 SHALL 可通过 `data-testid` 定位，不依赖视觉文本
