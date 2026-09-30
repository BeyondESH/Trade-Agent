# 跨层系统清单

> 一个业务系统的代码分散在多个目录模块时，按目录建模会把它拆散；本目录是按业务系统聚合的跨层导航，**不重复源码细节**。

| 系统 | 描述 | 涉及层次 | 聚合文档 |
|------|------|---------|---------|
| K 线数据全链路 | 后端接入/落盘/门禁 + 前端取数与投递 + 图表渲染 + 保序诊断 | `backend/src` · `backend/scripts` · `backend/tests` · `frontend/src` · `frontend/vendor` · `frontend/scripts` | `_systems/kline_pipeline.md` |
| 决策与下单闭环 | 确定性分析 + LLM 决策 + 风控执行闸门 + 前端下单交互 | `backend/src` · `backend/tests` · `frontend/src` · `frontend/tests` | `_systems/trading_loop.md` |
| 质量门禁与交付一致性 | CI 编排 + 本地 pre-commit + 两端阈值/测试分层的同源约束 | `.github/workflows` · `__root/__files` · `backend/__files` · `frontend/__files` · `backend/tests` · `frontend/tests` | `_systems/quality_gates.md` |

> 📌 本目录由知识库构建流程按 `kb-systems.json` 聚合生成，仅作跨层导航；各层细节以对应模块 `_overview.md` 为准。
