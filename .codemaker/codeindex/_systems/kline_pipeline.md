---
system_id: kline_pipeline
system_name: K 线数据全链路
layers:
  - layer: backend-ingestion
    src_path: backend/src
    kb_path: .codemaker/codeindex/backend/src
  - layer: backend-repair
    src_path: backend/scripts
    kb_path: .codemaker/codeindex/backend/scripts
  - layer: backend-gate
    src_path: backend/tests
    kb_path: .codemaker/codeindex/backend/tests
  - layer: frontend-data
    src_path: frontend/src
    kb_path: .codemaker/codeindex/frontend/src
  - layer: frontend-render
    src_path: frontend/vendor
    kb_path: .codemaker/codeindex/frontend/vendor
  - layer: frontend-diagnose
    src_path: frontend/scripts
    kb_path: .codemaker/codeindex/frontend/scripts
---

## 系统概述

K 线数据全链路回答的是「图表上这一根 bar 是不是真的、是不是当前周期的」：外部交易所的行情经后端多通道拉取与 Parquet 落盘成为权威序列，再经后端内存镜像与 `/ws` 保序推送到前端，由前端 datafeed 与图表引擎渲染，最后用端到端诊断脚本与 L1/L3 门禁双向证明正确性。它跨越 6 个目录模块，任一环失守的表现都很相似（重复 bar、旧周期 bar、空洞），因此必须整体理解。

## 跨层数据流

```
Bitget REST/MCP → backend/src/ingestion.py:KlineIngestor.fetch_range
  → backend/src/store.py:ParquetStore.save（UTC 日分片 + open_time 去重）  ← 权威序列
    → backend/src/webapi.py:/candles → frontend/src/api/client.ts:getHistoryKLineData
Bitget 公共 WS → backend/src/realtime.py + streamhub.py（内存镜像/引用计数）
  → backend/src/webapi.py:/ws（水位 candle_sent_open_time 保序）
    → frontend/src/api/bitgetWs.ts:deliver（丢弃更旧 bar）→ klinecharts-pro 渲染
门禁回路：backend/tests/test_data_integrity.py 判缺口 → KNOWN_GAPS 登记
  → backend/scripts/backfill_micro_gaps.py 回填 → 白名单清空转绿
取证回路：frontend/scripts/diagnose-kline-realtime.mjs 采样 → REPLACE/APPEND/STALE 判定
```

## 各层入口速览

| 层次 | 核心入口 | 文件 | 说明 |
|------|---------|------|------|
| backend-ingestion | `KlineIngestor.fetch_range` / `backfill_before_rest` | `backend/src/market_data/ingestion.py` | MCP/v2/v3 三通道；`earliest_reached` 仅 v3 空页可置真 |
| backend-store | `ParquetStore.save` / `read` | `backend/src/market_data/store.py` | 按 UTC 日一文件，`open_time` 去重合并 |
| backend-gate | `test_series_quality` / `is_exempt` | `backend/tests/test_data_integrity.py`、`data_registry.py` | 类型 A/B/C 缺口分类与白名单 |
| backend-repair | `backfill_micro_gaps.py` | `backend/scripts/backfill_micro_gaps.py` | 1~2 步微缺口回填，必须在 `backend/` 下执行 |
| frontend-data | `getHistoryKLineData` / `BitgetWsClient.deliver` | `frontend/src/api/*.ts` | 分页回填 + 订阅路由 + 单调性守卫 |
| frontend-render | period bar / `adjustFromTo` | `frontend/vendor/klinecharts-pro/src/widget/period-bar/index.tsx` | 周期条与时间格式的两个 switch 必须成对补齐 |
| frontend-diagnose | `diagnose-kline-realtime.mjs` | `frontend/scripts/diagnose-kline-realtime.mjs` | 只读采样对账，产出退出码与证据 |

## 各层知识库链接

| 层次 | 概览文档 | 符号索引 |
|------|---------|---------|
| backend/src | [`backend/src/_overview.md`](../backend/src/_overview.md) | Codemap MCP |
| backend/scripts | [`backend/scripts/_overview.md`](../backend/scripts/_overview.md) | Codemap MCP |
| backend/tests | [`backend/tests/_overview.md`](../backend/tests/_overview.md) | Codemap MCP |
| frontend/src | [`frontend/src/_overview.md`](../frontend/src/_overview.md) | Codemap MCP |
| frontend/vendor | [`frontend/vendor/_overview.md`](../frontend/vendor/_overview.md) | Codemap MCP（vendor 未被索引，见文档） |
| frontend/scripts | [`frontend/scripts/_overview.md`](../frontend/scripts/_overview.md) | Codemap MCP |

> 📌 本文件为跨层聚合导航，不重复源码细节；改任一环前请读对应层 `_overview.md` 的「跨模块契约底线 / 实现约束清单」。
