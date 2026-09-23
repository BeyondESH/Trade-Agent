## REMOVED Requirements

### Requirement: 回放引擎
**Reason**: 该 requirement 描述用户可见的 bar 回放（选择起点、逐 bar 前进、挂起实时）。低层原语 `frontend/src/lib/replayEngine.ts` 与 `api/datafeed.ts` 的 `suspendUpdates` 确实存在，但 **没有任何组件引用 `replayEngine`**（检索全 `frontend/src` 仅 `replayEngine.test.ts` 命中），用户不可达，功能从未接线。单图终端当前无回放入口。
**Migration**: 原语保留：`lib/replayEngine.ts`（含单元测试）与 `datafeed.suspendUpdates` 继续维护、供未来复用。未来如需用户可见回放，另立 change，基于这些原语构建回放控制条与图表裁剪 UI。

### Requirement: 回放控制条
**Reason**: 回放控制条（播放/暂停/单步/速度/退出/当前回放时间）从未构建，代码中无对应组件；随"回放引擎"一并移除，避免误导实现者。
**Migration**: 无（UI 未构建）。未来重新提案回放 UI 时一并实现控制条。
