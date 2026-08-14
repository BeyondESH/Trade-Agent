## Context

`web-frontend`(已归档)提供 React+Vite+TS SPA:`api/client`、`lib/transform`、`hooks/useSnapshot`、组件 `Chart`/`StrategyEditor`/`TradingPanel`/`Controls`/`OrderConfirmDialog`、`App`(图表 + 2×2 网格)。测试:transform/client(纯逻辑)+ 组件行为(@testing-library,按文本/role 查询)。本 change 做 OKX 风格的表现层重构,复用全部逻辑与 API。

## Goals / Non-Goals

**Goals:**
- Tailwind 接入 + OKX 设计 tokens。
- 交易终端布局(header/左市场/中图/右下单/底部 Tab)。
- 一套可复用 UI 原子;图表 OKX 配色。
- 复用既有逻辑组件、保留文本/角色使组件测试通过。
- tsc + build + vitest 全绿。

**Non-Goals:**
- 不改后端/API/transform/hooks 逻辑。
- 不做多用户/登录/部署;不引入重型组件库。
- 不复制 OKX logo/商标/专有素材。
- 不新增交易/数据功能(纯 UI)。

## Decisions

### D1:Tailwind v3 + PostCSS
选 Tailwind **v3.4**(与 Vite 稳定、文档全;v4 新引擎暂不采用)。`tailwind.config.js` 扩展 theme.colors 为 OKX tokens;`content` 覆盖 `index.html` 与 `src/**`。`src/index.css` 引入 `@tailwind base/components/utilities` + 少量全局(等宽数字、滚动条)。

### D2:设计 tokens(OKX-inspired,自有)
```
bg      #0b0e11   panel #12161c   panel2 #161b22   border #232a33
text    #eaecef   muted #848e9c   up #16c784   down #ea3943   accent #f0b90b
```
数值用 tabular-nums;涨绿跌红贯穿价格/PnL/涨跌幅。

### D3:UI 原子(`src/ui/`)
`Panel`(标题+内容容器)、`Button`(primary/ghost/danger/size)、`Input`/`NumberField`、`Tabs`(受控)、`Table`(紧凑表)、`Modal`、`Badge`。全部 Tailwind class,无第三方 UI 库。

### D4:终端布局(`AppShell`)
CSS Grid:
```
header (顶)
[ MarketList | ChartArea | OrderPanel ]  (中,三列)
BottomTabs (底,跨列)
```
响应式:窄屏堆叠。状态(选中 series)提升到 App,MarketList/Order/Chart 共享。

### D5:复用与重绘
- `OrderConfirmDialog` 逻辑 → `OrderPanel` + 确认 `Modal`(保留 Submit/Confirm 文本)。
- `StrategyEditor`/`TradingPanel` → 底部 Tab 内容(保留 Save 等文本、checkbox 角色)。
- `Controls` → Header 区(保留 kill-switch/live checkbox)。
- `Chart` → 配色参数化为 OKX(不改数据流/props 语义)。

### D6:图表配色
candle up `#16c784`/down `#ea3943`;grid `#1c2530`;背景 `#101418`;S/R 支撑绿/压力红价格线;十字光标浅灰。

### D7:测试兼容
既有组件测试按文本("Save"/"Submit"/"Confirm")与 role(checkbox)查询。重绘时**保留这些可访问文本/角色**;必要时用 `aria-label`。逻辑测试不受影响。

## Risks / Trade-offs

- **组件测试因结构变动失败** → 保留文本/role;重构后跑 vitest 回归,红了即修。
- **Tailwind 配置/PostCSS 与 Vite 集成** → 用官方标准配置;build 作为门。
- **布局复杂度(三列+底部 Tab+响应式)** → 先桌面宽屏达标,窄屏堆叠兜底。
- **市场列表缺多币种数据** → 列表由配置币种驱动,无数据显示占位,不报错。
- **视觉还原主观** → 以 tokens + 布局结构达成「神似」,非像素级克隆。

## Open Questions

- 是否需要盘口/成交明细区(depth/trades)——当前后端无实时逐笔;先留位或省略。
- 亮色主题切换——先只做深色,tokens 预留可扩展。
- 市场列表数据来源——先用配置 symbols + 按需拉取提示;真正多币种数据靠 #1 的 pull。
