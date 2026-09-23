# repo-hygiene Specification

## Purpose
TBD - created by archiving change ci-lint-coverage. Update Purpose after archive.
## Requirements
### Requirement: 构建产物不入库

仓库 MUST NOT 跟踪生成型产物（如 `build_ap_cmh.json` 等构建/导出文件）。此类文件 SHALL 从版本控制中移除，并 SHALL 由 `.gitignore` 覆盖，以避免仓库体积膨胀与无意义 diff。

#### Scenario: 已跟踪的构建产物被移除
- **WHEN** 检查 `git ls-files`
- **THEN** `build_ap_cmh.json` SHALL NOT 出现在已跟踪文件列表中

#### Scenario: 构建产物被忽略
- **WHEN** 在工作区重新生成该类产物
- **THEN** `git status` SHALL NOT 将其显示为未跟踪变更（被 `.gitignore` 覆盖）

### Requirement: .gitignore 覆盖本地与 CI 产物

`.gitignore` SHALL 覆盖本地工具与 CI 产生的目录/文件（至少包含 `.omo/` 与已识别的构建产物），避免误提交。

#### Scenario: .omo 被忽略
- **WHEN** 本地存在 `.omo/` 目录且执行 `git status`
- **THEN** `.omo/` SHALL NOT 出现在未跟踪文件中

### Requirement: .env.example 与环境变量表同步

`backend/.env.example` SHALL 包含 `backend/src/market_data/config.py` 中 `Settings` 定义的全部公开配置项（含 `BB_API_KEY` / `BITGET_*` 等凭据占位），并 SHALL 与 README 环境变量表逐项一致（变量名与默认值）。新增或修改 `Settings` 字段的变更 SHALL 在同一变更内同步该文件。

#### Scenario: 变量无遗漏
- **WHEN** 比对 `Settings` 字段（含 env 前缀与别名）、README 环境变量表与 `backend/.env.example`
- **THEN** 三者 SHALL 覆盖同一变量集合，SHALL NOT 存在仅在某处定义的公开变量

#### Scenario: 新增变量触发同步
- **WHEN** 某个变更向 `Settings` 增加字段（如 `MD_AGENT_SCHEDULE_ENABLED`）
- **THEN** `backend/.env.example` 与 README 环境变量表 SHALL 在同一变更内更新

### Requirement: README 项目结构与实际目录一致

README 的"项目结构"小节 SHALL 只列出仓库中真实存在的目录/文件；MUST NOT 列出空目录或占位条目（如空的 `docs/`）。规格与设计文档的权威来源为 `openspec/`。

#### Scenario: 移除空目录占位
- **WHEN** 核对 README 项目结构条目与实际仓库目录
- **THEN** 已不存在的空目录（如 `docs/`）SHALL NOT 出现在 README 项目结构中

