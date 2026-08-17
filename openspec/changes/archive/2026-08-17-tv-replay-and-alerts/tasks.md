# Tasks — tv-replay-and-alerts

## 1. 回放引擎 (chart-replay)

- [x] 1.1 新增 `lib/replayEngine.ts`：持有完整历史 + `cursor`；进入回放 `applyNewData(all.slice(0,cursor))`，播放定时推进（500ms/speed），单步 cursor+1，退出清理
- [x] 1.2 App 回放门控：回放期间 `datafeed.suspendUpdates(true)` 挂起 cell 0 实时推送；退出后恢复
- [x] 1.3 起点选择：进入回放载入 1000 根历史、cursor 定位可拖；回放条滑块 seek 调整当前回放时刻
- [x] 1.4 单测：裁剪到起点、逐 bar 前进、播放/暂停/调速、到末尾自动暂停、seek 钳位、退出清理

## 2. 回放控制条 (chart-replay)

- [x] 2.1 新增 `components/chart/ReplayBar.tsx`：播放/暂停、单步、速度(1x/3x/10x)、时间轴滑块、当前回放时间、退出
- [x] 2.2 进入回放入口（顶栏"回放"按钮；回放模式挂载控制条）；回放时隐藏"回到最新"按钮
- [x] 2.3 单测：控制条操作驱动引擎（播放/单步/调速/退出/seek）、回放时间展示

## 3. 回放模拟下单 (replay-paper-trading)

- [x] 3.1 新增 `lib/paperAccount.ts`：持仓/均价/浮盈/已实现盈亏，开平按回放当前价；绝不调用 `/order`
- [x] 3.2 回放下单 UI（ReplayBar 内：数量输入 + 做多/做空/平仓按钮，明确置于回放模式），浮盈随回放价更新
- [x] 3.3 退出回放时平仓并按已实现盈亏/笔数/胜率给出 toast 小结
- [x] 3.4 单测：开仓浮盈随价更新、平仓结算 realized、退出小结、参数校验、不触达真实 `/order`

## 4. 警报画线与拖动 (alerts-local)

- [x] 4.1 当前品种的启用未触发警报 → 各画 priceLine（组 `alert-lines`），随警报/品种/图变化重画
- [x] 4.2 拖动警报线 `onPressedMoveEnd` → 更新 alertsStore 阈值并持久化（本地 + 服务端镜像）
- [x] 4.3 切品种时移除并重画本品种警报线；`alert-lines` 组不计入绘图持久化
- [x] 4.4 行为随订阅自动刷新（subscribeAlerts 通知链）；视觉验证归入 8.4 手动项

## 5. 触发提醒 (alerts-local)

- [x] 5.1 新增 `ui/Toast.tsx`：应用内右上角浮层，自动消失（6s，最多 5 条）
- [x] 5.2 触发时 push toast + 已授权发浏览器通知（挂载时请求一次权限）
- [x] 5.3 单测：触发回调链（alertsStore 通知、镜像调用）、toast 组件渲染

## 6. 后端警报持久化 (alerts-backend)

- [x] 6.1 新增 `backend/src/market_data/alertstore.py`：JSON 落 `data_dir/alerts/alerts.json`，线程安全，list/create/update/delete + 字段校验
- [x] 6.2 `webapi.py` 实现 `GET/POST /alerts`、`PUT/DELETE /alerts/{id}`（404/400 语义）
- [x] 6.3 后端测试：创建→列出、更新/删除、非法输入 400、重启后保持（跨会话）

## 7. 前端警报数据源切换 (alerts-local)

- [x] 7.1 数据源抽象落地为 `syncAlertsFromServer`（服务端优先合并读：server 权威 + 本地孤儿保留）+ `mirrorAlertCreate/Update/Delete`（写入尽力镜像，失败静默回退本地）
- [x] 7.2 `api/client.ts` 落实 `/alerts` 增删改查调用（新增 `updateAlert` PUT，类型化 AlertRecord）
- [x] 7.3 `AlertsPanel.tsx` 接入：挂载时服务端合并、每操作镜像、离线回退本地
- [x] 7.4 单测：server 正常合并、后端失败回退、镜像端点调用与不抛错

## 8. 校验与回归

- [x] 8.1 `openspec validate tv-replay-and-alerts` 通过
- [x] 8.2 前端 typecheck + vitest 全绿（170 passed）
- [x] 8.3 后端 pytest 全绿（155 passed）
- [ ] 8.4 手动验证：进入回放逐 bar 播放、回放模拟开平仓浮盈与退出小结、警报画线拖动改阈值、触发 toast/通知、两会话跨设备警报同步、后端断开时回退本地
