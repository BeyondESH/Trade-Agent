## Why

右侧"订单簿 (DOM)"面板在快速/连续切换自选币种后,盘口数据不同步、不刷新:面板长期显示**旧币种的残留价位**(已验证:切到 XAU 后 asks 仍显示 ETH 的 1913 价位、bids 显示 BTC 的 64434 价位;切回 BTC 后 asks 仍是 ETH 残留)。根因是前端 `useOrderBook` 将后端推送的**全量快照**当**增量** merge,且切换 symbol 时状态不重置,旧价位永不清理。

## What Changes

- 修复 `useOrderBook` 的盘口状态生命周期:切换 symbol 时重置盘口,并对 `snapshot` 帧做整体替换而非增量 merge,保证切换后只显示当前选中币种的盘口。
- 保留高频帧节流优化(`sameBook` 跳过无变化渲染),但将其与"symbol 切换重置"正确组合。
- 订单簿面板"价差"接上真实的 `spread` 数据(当前硬编码 `0.02 (0.01%)`)。
- 新增回归测试:切换 symbol 后无旧币残留、snapshot 替换语义、单次/快速切换均正确。

## Capabilities

### New Capabilities
- `orderbook-symbol-sync`: 订单簿在 symbol 切换时的状态生命周期——切换重置、快照替换、无旧币残留,确保面板始终反映当前选中币种的盘口。

### Modified Capabilities
- `ui-live-data-sync`: 在"高频数据渲染节流"下新增 requirement——盘口节流 SHALL 以"当前 symbol 的完整状态"为基准,切换 symbol 后 SHALL 重置而非增量叠加。

## Impact

- `frontend/src/hooks/useOrderBook.ts`:核心修复(symbol 切换重置 + snapshot 替换语义)。
- `frontend/src/components/sidebar/OrderBookPanel.tsx`:价差接入真实 spread(可选、顺带修复)。
- `frontend/src/hooks/useOrderBook.test.tsx`:新增/调整测试,覆盖切换重置与快照替换。
- 后端 `streamhub.py` / `webapi.py`:**不改**——后端行为正确(已实测推送 XAU 真值 4359),问题在前端消费端。
