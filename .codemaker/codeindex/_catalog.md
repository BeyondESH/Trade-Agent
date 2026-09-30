---
type: "Module"
id: trade
title: "知识库模块目录"
description: "trade 仓库 19 个知识库模块的纯导航表：模块名 → 一句话职责 → 概览文档路径。"
repo_name: trade
kb_root: .codemaker/codeindex
last_updated: 2026-09-28
total_modules: 19
---

# trade 知识库目录

> 按模块名或职责关键词定位，找到后进入对应 `_overview.md` 阅读详情。
> 业务概念检索请优先查 `_concept_index.md`（关键词 → 子文档直达）；符号定位用 Codemap MCP（`find_symbol` / `search_code`）。

## 模块索引

| 模块 | 一句话职责 | 概览文档 |
|------|-----------|---------|
| `backend/src` | 行情入库、分析量化、风控执行与 Agent 决策合一的唯一后端内核 | `.codemaker/codeindex/backend/src/_overview.md` |
| `backend/tests` | 三层测试金字塔的 L1 数据门禁、L2 真实进程与离线不变式 | `.codemaker/codeindex/backend/tests/_overview.md` |
| `backend/scripts` | 手工一次性把类型 B 微缺口回填进 Parquet 的数据修复脚本 | `.codemaker/codeindex/backend/scripts/_overview.md` |
| `backend/__files` | 后端依赖锁定、环境变量面与 lint/覆盖率门禁契约 | `.codemaker/codeindex/backend/__files/_overview.md` |
| `frontend/src` | TradingView 风格单图交易终端（外壳/图表/面板/QUANT LAB） | `.codemaker/codeindex/frontend/src/_overview.md` |
| `frontend/vendor` | vendored 图表引擎与只读外壳模板及其构建解析边界 | `.codemaker/codeindex/frontend/vendor/_overview.md` |
| `frontend/tests` | Playwright L3 浏览器用户旅程（刻意不进 CI） | `.codemaker/codeindex/frontend/tests/_overview.md` |
| `frontend/scripts` | 实时 K 线乱序的手工端到端诊断与取证脚本 | `.codemaker/codeindex/frontend/scripts/_overview.md` |
| `frontend/__files` | 前端构建、类型/lint 作用域、样式 token 与入库边界契约 | `.codemaker/codeindex/frontend/__files/_overview.md` |
| `__root/__files` | 仓库治理根文件：双语 README、AGENTS.md、pre-commit、许可与忽略边界 | `.codemaker/codeindex/__root/__files/_overview.md` |
| `.github/workflows` | CI 三个 job 的门禁编排与阈值棘轮契约 | `.codemaker/codeindex/.github/workflows/_overview.md` |
| `.claude/commands` | Claude 宿主下 OpenSpec 变更生命周期的斜杠命令入口 | `.codemaker/codeindex/.claude/commands/_overview.md` |
| `.claude/skills` | 知识库构建、Codemap 检索、OpenSpec 流程三族 Agent 技能规程 | `.codemaker/codeindex/.claude/skills/_overview.md` |
| `.opencode/commands` | OpenCode 宿主下的 `/opsx-*` 变更流程命令入口 | `.codemaker/codeindex/.opencode/commands/_overview.md` |
| `.opencode/skills` | OpenSpec 六动作工作流技能契约与禁忌边界 | `.codemaker/codeindex/.opencode/skills/_overview.md` |
| `agent_hub-main` | vendored 上游门户的根清单、发布边界与生态路由口径 | `.codemaker/codeindex/agent_hub-main/__files/_overview.md` |
| `agent_hub-main/docs` | Bitget Agent Hub 上游能力契约与凭证前置的只读文档 | `.codemaker/codeindex/agent_hub-main/docs/_overview.md` |
| `agent_hub-main/installer` | 受管 npm 包升级/回滚与技能向 AI 宿主部署的元安装器 | `.codemaker/codeindex/agent_hub-main/installer/_overview.md` |
| `agent_hub-main/assets` | 上游门户品牌素材与 npm 发布白名单边界 | `.codemaker/codeindex/agent_hub-main/assets/_overview.md` |
