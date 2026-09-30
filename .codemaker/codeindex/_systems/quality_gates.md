---
system_id: quality_gates
system_name: 质量门禁与交付一致性
layers:
  - layer: ci
    src_path: .github/workflows
    kb_path: .codemaker/codeindex/.github/workflows
  - layer: repo-root
    src_path: .
    kb_path: .codemaker/codeindex/__root/__files
  - layer: backend-contract
    src_path: backend
    kb_path: .codemaker/codeindex/backend/__files
  - layer: frontend-contract
    src_path: frontend
    kb_path: .codemaker/codeindex/frontend/__files
  - layer: backend-tests
    src_path: backend/tests
    kb_path: .codemaker/codeindex/backend/tests
  - layer: frontend-tests
    src_path: frontend/tests
    kb_path: .codemaker/codeindex/frontend/tests
---

## 系统概述

质量门禁不是一个目录，而是「CI 编排 + 本地 pre-commit 镜像 + 两端权威阈值 + 分层测试口径 + 文档命令矩阵」五处的同源约束：真正的规则住在 `pyproject.toml` / `vite.config.ts` / `biome.json` / `package.json`，`ci.yml` 只负责按脚本名把它们跑起来并卡住。任何一处单独改动都会造成「本地绿、CI 红」或「改完没反应」的静默失效，因此需要跨层统一理解。

## 跨层数据流

```
push / pull_request → .github/workflows/ci.yml
  ├─ job backend：uv sync --frozen → ruff → pytest -q → pytest -m integrity → coverage(fail_under=80)
  ├─ job backend-l2：pytest -m live --run-live（独立 job，避免污染主 job 的干净进程）
  └─ job frontend：npm ci → biome → tsc → vitest → test:coverage(lines/statements=55)
本地先行：git commit → .pre-commit-config.yaml（ruff rev / biome rev 与 lock 同源，范围仅 backend/ frontend/）
文档同步：改动命令或阈值 → 必须同变更更新 README.md / README.en.md / AGENTS.md 命令矩阵
永不进 CI：online（外网 Bitget/BlockBeats）+ Playwright L3（浏览器二进制 + 冷启动过慢）
```

## 各层入口速览

| 层次 | 核心入口 | 文件 | 说明 |
|------|---------|------|------|
| ci | `backend` / `backend-l2` / `frontend` jobs | `.github/workflows/ci.yml` | 编排；python 3.11 / node 20 / ubuntu-latest |
| repo-root | 命令矩阵与工具版本钉 | `AGENTS.md`、`.pre-commit-config.yaml` | L1/L2/L3 命令与 `--run-live`/`--run-online` 开关口径 |
| backend-contract | `fail_under=80` / `RUFF_SELECT` / markers | `backend/pyproject.toml` | 阈值与分层注册的权威位置 |
| frontend-contract | `test:coverage` / proxy / biome includes | `frontend/package.json`、`vite.config.ts`、`biome.json` | 脚本名即对外契约；vendor 与 e2e 不在检查域 |
| backend-tests | `test_data_integrity.py` / `conftest.py` | `backend/tests/` | L1 硬门禁与 L2 live_server 隔离 |
| frontend-tests | `playwright.config.ts` / `e2e/*.spec.ts` | `frontend/tests/`、`frontend/playwright.config.ts` | L3 起双服务，刻意排除在 vitest 与 CI 之外 |

## 各层知识库链接

| 层次 | 概览文档 | 符号索引 |
|------|---------|---------|
| .github/workflows | [`.github/workflows/_overview.md`](../.github/workflows/_overview.md) | Codemap MCP |
| __root/__files | [`__root/__files/_overview.md`](../__root/__files/_overview.md) | Codemap MCP |
| backend/__files | [`backend/__files/_overview.md`](../backend/__files/_overview.md) | Codemap MCP |
| frontend/__files | [`frontend/__files/_overview.md`](../frontend/__files/_overview.md) | Codemap MCP |
| backend/tests | [`backend/tests/_overview.md`](../backend/tests/_overview.md) | Codemap MCP |
| frontend/tests | [`frontend/tests/_overview.md`](../frontend/tests/_overview.md) | Codemap MCP |

> ⚠️ 跨层红线：阈值只升不降；门禁数值只能改权威配置文件，禁止在 `ci.yml` 用命令行参数临时覆盖；新增 CI 检查写成既有 job 的 step，只有「需隔离进程」或「显著拖慢主 job」才新建 job。
