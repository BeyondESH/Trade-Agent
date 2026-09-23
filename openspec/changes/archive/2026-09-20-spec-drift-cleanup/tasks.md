## 1. 验证漂移前提（只读）

- [x] 1.1 确认 `frontend/src` 无 `chartSyncBus`/`chartSyncActions`/`cellChartSetup`/`chartChromeBridge` 任何引用（`Get-ChildItem frontend/src -Recurse -Include *.ts,*.tsx | Select-String "chartSyncBus|chartSyncActions|cellChartSetup|chartChromeBridge"` 应无命中）
- [x] 1.2 确认 `syncOrigin`/`MultiChart` 在 `frontend/src` 无命中；`GridCellPersist`/`GridLayoutPersist` 仅出现在 `frontend/src/api/types.ts`
- [x] 1.3 确认 `replayEngine` 仅被 `frontend/src/lib/replayEngine.test.ts` 引用（无组件 import）
- [x] 1.4 确认 `frontend/src` 无 `.vue` 文件（排除 `node_modules`），且 `frontend/tailwind.config.js` content 为 `./src/**/*.{ts,tsx}`

## 2. 死类型清理（实现阶段，删代码前先跑基线测试）

- [x] 2.1 检查 `frontend/src/api/types.ts` 的 `ChartConfig.grid` / `GridLayoutPersist` / `GridCellPersist` 确实无消费方
- [x] 2.2 移除上述死类型（若 `types.test.ts` 有断言则一并更新）
- [x] 2.3 运行 `cd frontend && npm run typecheck` 与 `npm run test` 确认清理无回归

## 3. 规格同步与归档

- [x] 3.1 `openspec validate spec-drift-cleanup` 通过
- [x] 3.2 归档前复核：`chart-sync-bus`/`multichart-active-chart`/`layout-persistence` 的 REMOVED requirement 名与主规格逐字一致；`chart-shell-integrity`/`tv-template-shell`/`chart-terminal`/`design-system` 的操作类型正确（MODIFIED 保留全部原场景名；REMOVED+ADDED 用于含废弃场景名的 requirement）
- [x] 3.3 运行 `openspec archive spec-drift-cleanup`（或按仓库流程归档），确认主规格被正确更新且无"current spec contains scenario(s) not present"报错
  - 实施记录：CLI 归档成功（chart-shell-integrity ~2/-1、chart-terminal +1/-1、design-system +1/-1、tv-template-shell ~2，`Totals: +2, ~4, -3`）。
  - 例外：5 个 capability 的全部 requirement 被 REMOVED（chart-replay、replay-paper-trading、chart-sync-bus、layout-persistence、multichart-active-chart），OpenSpec 拒绝"零 requirement"的空规格，且 CLI 无 spec 删除命令；已按 capability 整体消亡处理——手动删除对应 `openspec/specs/<cap>/` 目录（delta 保留在归档 change 中作记录）。
- [x] 3.4 归档后抽查 `openspec/specs/chart-sync-bus/`、`multichart-active-chart/`、`layout-persistence/` 已移除或清空对应 requirement，`design-system`/`chart-terminal` 已替换为新 requirement
  - 抽查：5 个死规格目录已不存在（`openspec spec list` 不再列出）；`design-system` 含 "Tailwind 扫描覆盖 React TSX"、`chart-terminal` 含 "基于 Pro 的单图图表终端"，旧 requirement（Vue SFC / 多图终端）已不在。

## 4. 验证

- [x] 4.1 本 change 不编辑应用代码（artifact-only）；确认 `git status` 仅涉及 `openspec/changes/spec-drift-cleanup/**`（若执行 2.x 清理则另有 `frontend/src/api/types.ts`）
- [x] 4.2 若执行了 2.x，运行 `cd frontend && npm run test && npm run typecheck` 全绿
