## 1. Tailwind 接入

- [x] 1.1 安装 tailwindcss@3 / postcss / autoprefixer(dev)
- [x] 1.2 `tailwind.config.js`(content + OKX tokens)、`postcss.config.js`
- [x] 1.3 `src/index.css`:@tailwind + 全局(等宽数字、滚动条、body 底色);在 main.tsx 引入

## 2. UI 原子

- [x] 2.1 `src/ui/`:Panel、Button、Input/NumberField
- [x] 2.2 Tabs(受控)、Table(紧凑)、Modal、Badge

## 3. 终端布局

- [x] 3.1 `AppShell`:Grid(header / 三列 / 底部),窄屏堆叠
- [x] 3.2 `Header`(币种/最新价/涨跌/连接 + Controls 的 kill-switch/live)
- [x] 3.3 `MarketList`(左,币种表,选中高亮,无数据占位)
- [x] 3.4 `OrderPanel`(右,方向/杠杆/价 + 下单→确认 Modal,复用逻辑)
- [x] 3.5 `BottomTabs`([持仓/委托][成交日志][策略编辑])

## 4. 重绘既有组件

- [x] 4.1 `StrategyEditor` Tailwind 化(保留 Save 文本、输入可查)
- [x] 4.2 `TradingPanel`/组合/日志 Tailwind 化(表格)
- [x] 4.3 `OrderConfirmDialog` → Modal(保留 Submit/Confirm 文本)
- [x] 4.4 `Controls` → Header 区(保留 kill-switch/live checkbox 角色)

## 5. 图表配色

- [x] 5.1 Chart 蜡烛绿涨红跌、深色网格/十字光标、S/R 价格线配色

## 6. 组装与验证

- [x] 6.1 `App` 用 AppShell 组织;series 状态提升联动
- [x] 6.2 `tsc --noEmit` 通过
- [x] 6.3 `vitest` 回归全绿(保留文本/role 使组件测试通过)
- [x] 6.4 `vite build` 成功
