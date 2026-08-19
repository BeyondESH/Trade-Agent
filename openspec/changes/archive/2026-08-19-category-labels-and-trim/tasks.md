## 1. 后端：品类收敛

- [x] 1.1 修改 `backend/src/market_data/config.py`，`Settings.categories` 默认值改为 `["SPOT", "USDT-FUTURES"]`
- [x] 1.2 修改 `backend/src/market_data/models.py`，`MARKET_CATEGORIES` 收敛为 `["SPOT", "USDT-FUTURES"]`
- [x] 1.3 修改 `backend/src/market_data/models.py`，`_CATEGORY_TICKER_API` 同步裁剪（仅保留 SPOT/USDT-FUTURES 对应端点）
- [x] 1.4 运行后端测试（`pytest`），确认现有 `test_streamhub.py`/`test_webapi.py` 等不因品类列表变化而失败

## 2. 前端：品类标签中文化

- [x] 2.1 修改 `frontend/src/api/types.ts`：`MarketCategory` 收窄为 `"SPOT" | "USDT-FUTURES"`，`MARKET_CATEGORIES` 同步；新增 `CATEGORY_LABELS` 完整映射（含 MARGIN/USDC/COIN/模拟盘）与 `categoryLabel(category?: string): string`（未知值兜底返回原字符串）
- [x] 2.2 修改 `frontend/src/hooks/useRealSymbols.ts:19`，`exchange` 改用 `categoryLabel(t.category)`（删除 `.replace("-FUTURES","")`）
- [x] 2.3 修改 `frontend/src/api/datafeed.ts:37`（`instrumentToSymbolInfo`），`exchange` 改用 `categoryLabel(inst.category)`（替换固定 `"Bitget"`）
- [x] 2.4 收敛 `frontend/src/hooks/useTickerList.ts:6` 的 `CategoryTab` 枚举为 `"all" | "SPOT" | "USDT-FUTURES"`（当前无组件使用，属死代码清理）

## 3. 测试与验证

- [x] 3.1 为 `categoryLabel()` 新增单元测试：已知品类返回中文、未知品类兜底返回原值
- [x] 3.2 在 `frontend/src/api/datafeed.test.ts` 补用例：跨品类同名 symbol（SPOT/USDT-FUTURES）在搜索结果中各自独立、携带中文品类标识，且 `market` 字段保持原始 instType
- [x] 3.3 在 `useRealSymbols`/`useTickerList` 相关测试中补断言：`exchange` 输出中文标签
- [x] 3.4 运行前端测试（`npm test`）与后端测试（`pytest`），全部通过
