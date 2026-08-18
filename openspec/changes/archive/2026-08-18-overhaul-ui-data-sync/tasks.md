## 1. 删除 TopNavbar

- [x] 1.1 `App.tsx`:移除 `TopNavbar` 渲染(约 682-688 行)与对应 import
- [x] 1.2 确认 `Alert`/`Order` 弹窗入口在 `DesktopTitleBar`/`GlobalNavRail` 已有;若无,将 `onOpenAlertModal`/`onOpenOrderModal` 收敛到 `GlobalNavRail` 或标题栏,避免功能丢失
- [x] 1.3 删除 `frontend/src/components/header/TopNavbar.tsx` 文件(及未引用残留)
- [x] 1.4 前端 `tsc --noEmit` 通过;`vitest run` 相关测试更新

## 2. 后端通配 ticker 增量

- [x] 2.1 `streamhub.py`:`_refresh_tickers` 改为周期任务(约每 5s),刷新后对比镜像,变化的行 emit `action:"update"`,无变化不 emit
- [x] 2.2 `webapi.py`:通配 ticker 订阅分支保留 snapshot(读当前镜像);确认 `listener` 对 `(ticker, cat, "*", "")` 的匹配已覆盖周期 update 帧
- [x] 2.3 `test_streamhub.py`:新增周期刷新 emit 用例(变化推送、无变化不推)
- [x] 2.4 `test_webapi.py`:新增通配 ticker 订阅收到 snapshot + 后续 update 帧用例

## 3. 前端通配订阅与增量

- [x] 3.1 `useExchangeSocket.ts`:`onmessage` 分发支持通配——订阅 key symbol 为 `default`/`*` 时,同 category 任意 symbol 帧投递给该订阅者;精确订阅保持精确
- [x] 3.2 `useRealSymbols.ts`:`setByKey` 仅更新变化的 instId;`symbols`/`priceMap` 无变化时返回旧引用
- [x] 3.3 `useOrderBook.ts`:`apply` 仅当 best bid/ask(或可见档位)变化时 setState,保留旧引用避免全量重建
- [x] 3.4 新增/更新前端测试:通配投递、ticker 增量引用、盘口增量引用
- [x] 3.5 前端 `tsc --noEmit` 与 `vitest run` 通过
- [x] 3.6 通配 ticker 支持 category=`*`:`useRealSymbols` 订阅全类别;`useExchangeSocket` category 通配匹配;后端 `listener` 支持 `(channel,"*","*","")`、snapshot 合并全类别——修复 SPOT 等非默认类别价格不更新

## 4. 验证与收尾

- [x] 4.1 后端全部单测(`python -m pytest tests/ -q`)通过
- [x] 4.2 前端全部单测(`vitest run`)通过
- [x] 4.3 `openspec validate --all` 通过
- [x] 4.4 本地联调:watchlist/screener 价格随周期刷新实时变化;books/trade 增量正常;删除顶栏后 Alert/Order/主题入口可用;整体流畅度提升
