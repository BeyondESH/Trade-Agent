# Design: Rebrand To BeyondEther

## Context

前端界面残留 TradingView 品牌字样，分布在 9 个文件：`DesktopTitleBar.tsx`（徽标 TV、菜单标题、版本串、Cloud 文案、DOM id、注释）、`TradingPanel.tsx`/`DesktopSettingsModal.tsx`/`KeyboardShortcutsModal.tsx`（t-key 引用）、`lib/i18n.ts`（5 条 key）、`data/marketData.ts`（`BROKERS_CATALOG` 券商条目）、以及 `App.tsx`/`index.css`/`klinecharts-pro-theme.css` 的注释。后端无品牌引用。

决策已与用户确认：徽标缩写 **BE**；界面直接显示品牌原名 **BeyondEther**；移除版本号；无引用的 i18n key **改名保留**；注释/DOM id **一并清理**。

## Goals / Non-Goals

**Goals:**
- 所有用户可见的 TradingView 品牌字样替换为 BeyondEther（含 BE 徽标、版本串、Cloud/account 文案）。
- i18n keys 与 `t()` 调用处同步改名，保持中文界面也显示 BeyondEther。
- 清理注释与 DOM id 中的品牌痕迹。
- 纯文案变更，无逻辑改动。

**Non-Goals:**
- 不动 openspec 归档名、commit 历史、文件名中的 `tv-*`。
- 不引入新品牌视觉（Logo 图、配色）——仅文本替换。
- 不改 `index.html` 标题（当前为 "Trade Terminal"，无品牌字样）。

## Decisions

### D1: i18n key 与值统一改为 BeyondEther

```
"TradingView" → "BeyondEther"（值 "BeyondEther"）
"TradingView Simulated Paper Broker" → "BeyondEther Simulated Paper Broker"（值 "BeyondEther 模拟纸面券商"）
"Verified TradingView Broker Integrations" → "Verified BeyondEther Broker Integrations"（无引用，保留）
"Autosave drawing annotations and templates to TradingView account" → "…to BeyondEther account"（值含 BeyondEther）
"TradingView Desktop Keyboard Shortcuts" → "BeyondEther Desktop Keyboard Shortcuts"（值 "BeyondEther 键盘快捷键"）
```

**理由**：key 即文案标识，改名后可 grep 到残留；`t()` 调用处同步改，避免 key 缺失回退到 key 原文。**备选**：只改值不改 key——残留 "TradingView" key 仍会在代码中出现，放弃。

### D2: 徽标与版本串

- 汉堡按钮 + 头像的蓝色方块文本 `TV` → `BE`。
- `TradingView Desktop v2.8.4 Pro` → `BeyondEther Desktop Pro`（去版本号）。
- `tradingview-desktop-titlebar` DOM id → `beyondether-desktop-titlebar`。

### D3: BROKERS_CATALOG 品牌化

`marketData.ts` 中 `id: 'paper-tv'` → `'paper-be'`，`name: 'TradingView Paper Trading'` → `'BeyondEther Paper Trading'`，`logo: 'TV'` → `'BE'`，description 中 `TradingView charts` → `BeyondEther charts`。

**理由**：目录当前未被界面消费（brokers 视图已删、注释声明保留供未来使用），但仍属品牌资产，一次改净。

### D4: 注释与 DOM 属性

`App.tsx`、`index.css`、`klinecharts-pro-theme.css`（含 "TV density" 注释 → "BE density"）、`DesktopTitleBar.tsx` 内部注释中的 TradingView/TV 一并替换。

## Risks / Trade-offs

- **t-key 遗漏导致显示原文**：改 key 名后若漏改某处 `t('TradingView…')` 调用，会显示 key 原文而非中文 → 以 grep 兜底，逐个核对 `t(` 调用处；typecheck 无法捕获字符串 key 错误，靠测试与人工巡检。
- **测试快照/断言引用品牌字样**：若有组件测试断言 "TradingView" 文本会失败 → 先 grep 测试文件，随组件同步更新断言。
- **历史归档案残留**：openspec/commit 中的 tv-* 属历史记录，故意保留 → 不做处理，避免无意义噪音。

## Migration Plan

1. 纯前端文案变更，无数据/部署迁移。
2. 顺序：i18n.ts 先改 → 各组件 t-key 引用同步 → DesktopTitleBar 徽标/版本/DOM id → marketData 券商目录 → 注释清理 → grep 复核无残留。
3. 回滚：git revert 即可，无副作用。

## Open Questions

- 无（决策已与用户确认）。
