# Rebrand To BeyondEther

## Why

界面仍残留大量 TradingView 品牌字样（菜单标题、徽标 "TV"、版本串、券商目录、i18n 文案与注释），与自身产品 BeyondEther 定位不符。品牌露出应全部替换为自己的品牌名。

## What Changes

- 所有用户可见的 "TradingView"/"Tradingview" 文本替换为 **BeyondEther**（中文界面同样显示品牌原名）。
- 蓝色方块徽标与头像徽标 **"TV" → "BE"**。
- `TradingView Desktop v2.8.4 Pro` → **`BeyondEther Desktop Pro`**（移除版本号）。
- `TradingView Cloud` → `BeyondEther Cloud`；`TradingView account` → `BeyondEther account`。
- `BROKERS_CATALOG`（marketData.ts）：券商名/描述/logo/'paper-tv' id 全部品牌化。
- i18n keys 同步改名（`t()` 调用处一并更新）；无引用的 `Verified TradingView Broker Integrations` key 改名保留。
- 注释与 DOM id（`tradingview-desktop-titlebar`）中的品牌字样一并清理。
- 不涉及逻辑变更；不动 openspec 归档/commit 历史中的 `tv-*` 名称。

## Capabilities

### New Capabilities

- `beyondether-branding`: 界面品牌露出统一为 BeyondEther（可见文本、徽标缩写 BE、i18n 文案、券商目录与注释/DOM id 清理）。

### Modified Capabilities

<!-- 无既有 spec 行为变更（纯文案） -->

## Impact

- `frontend/src/components/desktop/DesktopTitleBar.tsx`：徽标/菜单标题/版本串/Cloud 文案/DOM id/注释。
- `frontend/src/components/bottom/TradingPanel.tsx`：券商标题 t-key。
- `frontend/src/components/modals/DesktopSettingsModal.tsx`、`KeyboardShortcutsModal.tsx`：t-key 引用。
- `frontend/src/lib/i18n.ts`：5 条 TradingView 相关 key 改名与值替换。
- `frontend/src/data/marketData.ts`：`BROKERS_CATALOG` 品牌化。
- 注释清理：`App.tsx`、`index.css`、`klinecharts-pro-theme.css`。
- 无后端/依赖变更。
