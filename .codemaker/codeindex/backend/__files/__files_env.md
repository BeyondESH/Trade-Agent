---
type: "Fragment"
id: "backend/__files/env"
title: "运行时环境变量契约"
description: "后端进程的所有可配置项写在哪、默认值是多少、改了要同步谁？"
parent: /backend/__files/_overview.md
fragment: env
architectural_role: "运行时配置面（唯一可配置入口），跨机器/跨部署的部署口径责任方"
entity_names:
  constants:
    - name: MD_CATEGORY
      value: "USDT-FUTURES"
      source: backend/.env.example
    - name: MD_SYMBOLS
      value: "BTCUSDT,ETHUSDT,SOLUSDT"
      source: backend/.env.example
    - name: MD_TIMEFRAMES
      value: "1m,5m,15m,30m,1h,4h,12h,1d"
      source: backend/.env.example
    - name: MD_CATEGORIES
      value: "SPOT,USDT-FUTURES"
      source: backend/.env.example
    - name: MD_DATA_DIR
      value: "./data"
      source: backend/.env.example
    - name: MD_SCHEDULE_INTERVAL_SECONDS
      value: "300"
      source: backend/.env.example
    - name: MD_AGENT_SCHEDULE_ENABLED
      value: "false"
      source: backend/.env.example
    - name: MD_BLOCKBEATS_REFRESH_HOUR
      value: "12"
      source: backend/.env.example
    - name: MD_BLOCKBEATS_REFRESH_MINUTE
      value: "0"
      source: backend/.env.example
    - name: BB_API_KEY
      value: "（空，缺失时快讯接口降级）"
      source: backend/.env.example
    - name: MD_CANDLE_PAGE_LIMIT
      value: "100"
      source: backend/.env.example
    - name: MD_REST_CANDLE_PAGE_LIMIT
      value: "500"
      source: backend/.env.example
    - name: MD_V3_CANDLE_PAGE_LIMIT
      value: "100"
      source: backend/.env.example
    - name: MD_BACKFILL_PAGE_DELAY
      value: "0.05"
      source: backend/.env.example
    - name: MD_NEWS_POLL_SECONDS
      value: "60"
      source: backend/.env.example
    - name: MD_NEWS_BUFFER_SIZE
      value: "500"
      source: backend/.env.example
    - name: MD_WS_PUBLIC_URL
      value: "wss://ws.bitget.com/v2/ws/public"
      source: backend/.env.example
    - name: MD_WS_HEARTBEAT_SECONDS
      value: "30"
      source: backend/.env.example
    - name: MD_WS_RECONNECT_SECONDS
      value: "5"
      source: backend/.env.example
    - name: MD_MCP_COMMAND
      value: "npx"
      source: backend/.env.example
    - name: MD_MCP_ARGS
      value: "-y,@bitget-ai/bitget-agent-mcp"
      source: backend/.env.example
    - name: MD_LOG_LEVEL
      value: "INFO"
      source: backend/.env.example
    - name: MD_TEST_SERVER_START_TIMEOUT
      value: "180（秒，测试专用，非 Settings 字段）"
      source: backend/tests/conftest.py
    - name: BITGET_API_KEY / BITGET_SECRET_KEY / BITGET_PASSPHRASE
      value: "（空；backend Python 侧无消费者，为 MCP 子进程预留）"
      source: backend/.env.example
retrieval_hints:
  - "某个 MD_ 开头的环境变量到底是干什么的、默认值是多少？"
  - "我要加一个新的运行时配置项，应该改哪几个文件才不会漏？"
  - "后端在没有 .env、没有任何 API Key 的情况下能启动吗？"
  - "怎么让后端在测试或本地跑时用临时数据目录、并且不自动拉数据？"
  - "⚠️ 如果你要找的是配置**被读取与校验的实现代码**（Settings 类字段、validator、lru_cache 缓存语义、路径属性），不在这里 → 在 `.codemaker/codeindex/backend/src/src_data_store.md`；本模块只描述变量的对外契约与同步义务，不含实现。"
  - "⚠️ 如果你要找的是前端的环境变量（VITE_*）或仓库根目录的忽略/构建规约，不在这里 → 分别在 `frontend` 与 `__root/__files` 模块。"
  - "本模块也叫「后端环境变量表」「MD_ 配置项」「backend/.env 模板」，对应需求里的「部署配置」「配置开关」「API Key 放哪」。"
  - "架构归属句：新增或修改任何运行时配置项，必须同时改 `backend/.env.example`（口径模板）与 README 环境变量表；禁止只在 `config.py` 加字段、或新建独立的配置文件来承载运行时开关。"
---

## 对外接口

> 本子模块无协议/RPC/事件接口。它的"对外契约"就是**环境变量名与默认值集合**——这是部署方与本仓库之间唯一的约定面。

| 契约项 | 方向 | 关键字段 | 业务说明 | 承载文件 |
|--------|------|---------|---------|---------|
| 运行时配置读取 | 部署环境→后端进程 | 22 个 `Settings` 字段（前缀 `MD_`，另有两个无前缀别名） | 全部可选、均有默认值；公开行情无需任何凭据即可运行 | `backend/.env.example`（契约模板）→ `backend/src/market_data/config.py:Settings`（实现） |
| 凭据注入 | 部署环境→MCP 子进程 | `BB_API_KEY`、`BITGET_API_KEY/SECRET_KEY/PASSPHRASE` | `BB_API_KEY` 供 BlockBeats 快讯/数据接口；`BITGET_*` 三件套在 backend Python 侧无消费者，为上游 MCP/CLI private 操作预留 | `backend/.env.example`（占位）→ 上游 `bitget-agent-mcp` |
| 测试期覆盖 | 测试 fixture→子进程 | `MD_DATA_DIR=<tmp>`、`MD_SCHEDULE_INTERVAL_SECONDS=0`、`MD_TEST_SERVER_START_TIMEOUT` | L2 `live_server` 用隔离数据目录 + 关闭增量调度启动真实 uvicorn | `backend/tests/conftest.py` |

## 业务意图与覆盖范围

本子文档解决的核心业务问题是：**让"后端是怎么被配置的"这件事有一份机器无关的、可被审计的唯一清单**。后端同时承担行情抓取、指标计算、回测、风控执行、AI Agent 决策与定时编排，这些子系统各自需要开关、限额、时间间隔与外部地址；如果这些值散落在代码字面量里，换一台机器或换成实盘口径时就要改代码。本文件把它们全部收敛到"环境变量 + 默认值"这一层，并提供 `.env.example` 作为模板，使"公开行情零凭据即可跑通"与"需要凭据/限额时确定性覆盖"两个目标同时成立。

覆盖范围是 `backend/.env.example` 全文（22 个变量，与 `Settings` 字段一一对应），加上一个**不在 `Settings` 内**的测试专用变量 `MD_TEST_SERVER_START_TIMEOUT`——它只由 `backend/tests/conftest.py` 读取，因此在 repo-hygiene 的"`.env.example` 必须覆盖 `Settings` 全部公开字段"这条规格下**不属于同步义务范围**，但它是"服务启动慢导致 L2 假失败"这一历史问题的唯一旋钮，必须一并记录。（来源: openspec/specs/repo-hygiene/spec.md、openspec/specs/e2e-test-infra/spec.md）

## 实现约束清单

> 实现本模块相关需求时，Agent 必须在动笔前逐条核对以下项。

### 必须定义的常量/枚举

> 适用：模块内有开关、限额、比例、时间间隔等有业务含义的配置项。

| 标识符 | 值 | 所在文件 | 说明 | 约束由来（如可追溯） |
|-------|----|---------|------|---------------------|
| `MD_AGENT_SCHEDULE_ENABLED` | `false` | `backend/.env.example` | 定时 Agent 交易与 DL 重训的总开关；**默认关闭**。熔断保护性平仓任务不受此开关影响、始终注册 | spec：默认不自动交易/不自动训练（来源: openspec/specs/orchestration-jobs/spec.md） |
| `MD_CATEGORIES` | `SPOT,USDT-FUTURES` | `backend/.env.example` | 交易所行情中枢覆盖的产品线列表；比单一 `MD_CATEGORY` 更宽，是"多市场"能力的开关面 | 多市场中枢需求；`MD_CATEGORY` 仅用于定时增量拉取的默认目标 |
| `MD_CANDLE_PAGE_LIMIT` | `100` | `backend/.env.example` | MCP candles 工具单请求根数；**Bitget 历史 K 线上限即 100，不得调大** | 交易所接口硬上限（值上调会触发上游报错） |
| `MD_V3_CANDLE_PAGE_LIMIT` | `100` | `backend/.env.example` | REST v3 深回填页大小；v3 每次请求上限 100 行且跨度 ≤90 自然日 | 交易所接口硬上限（同上） |
| `MD_REST_CANDLE_PAGE_LIMIT` | `500` | `backend/.env.example` | REST v2 深回填页大小；v2 上限 1000，留余量取 500 | 交易所接口上限 + 限流余量 |
| `MD_BACKFILL_PAGE_DELAY` | `0.05` | `backend/.env.example` | v2 深回填页间节流（秒），**设为 0 即关闭节流** | 避免触发交易所限流；`0` 是显式的"我知道风险"开关 |
| `MD_SCHEDULE_INTERVAL_SECONDS` | `300` | `backend/.env.example` | 增量落盘定时拉取周期；**测试固定注入 `0` 以关闭调度** | L2 隔离要求（来源: openspec/specs/e2e-test-infra/spec.md） |
| `MD_NEWS_BUFFER_SIZE` | `500` | `backend/.env.example` | 全球快讯环形缓冲条数，供 SSE 重放与 `/news/context` 查询 | 快讯管线需求（来源: openspec/specs/global-news-pipeline/spec.md） |
| `MD_NEWS_POLL_SECONDS` | `60` | `backend/.env.example` | AKShare 后台轮询周期；来源连续失败时退避逐次翻倍、封顶 5 倍间隔 | spec 明确的退避策略（来源: openspec/specs/global-news-pipeline/spec.md） |
| `MD_WS_HEARTBEAT_SECONDS` / `MD_WS_RECONNECT_SECONDS` | `30` / `5` | `backend/.env.example` | 公共 WebSocket 心跳与断线重连间隔 | 实时行情通道可用性需求 |
| `MD_BLOCKBEATS_REFRESH_HOUR` / `MD_BLOCKBEATS_REFRESH_MINUTE` | `12` / `0` | `backend/.env.example` | BlockBeats 数据缓存每日刷新时刻（本地时间） | 快讯数据缓存策略 |
| `BB_API_KEY` | `（空）` | `backend/.env.example` | BlockBeats API Key；**缺失时相关接口自动降级**而非报错 | 可选凭据 + 优雅降级需求 |
| `BITGET_API_KEY` / `BITGET_SECRET_KEY` / `BITGET_PASSPHRASE` | `（空）` | `backend/.env.example` | 上游 MCP/CLI private 操作三件套；**必须同时齐全**，缺一即认证失败 | 上游凭据契约（来源: agent_hub-main/docs/getting-started.md） |
| `MD_MCP_COMMAND` / `MD_MCP_ARGS` | `npx` / `-y,@bitget-ai/bitget-agent-mcp` | `backend/.env.example` | AI Agent 通道的 MCP 子进程启动命令；依赖 Node ≥20，改此面等于换 AI 通道的工具提供方 | 上游包以 npm 依赖形式引入（来源: openspec/specs/system-architecture/spec.md） |
| `MD_TEST_SERVER_START_TIMEOUT` | `180` | `backend/tests/conftest.py` | L2 真实 uvicorn 冷启动等待上限（秒）；**不是 `Settings` 字段** | 冷启动超时假失败（来源: openspec/specs/e2e-test-infra/spec.md） |

### 必须包含的协议字段

> 不适用：本子模块不定义客户端→服务端命令或服务端推送协议，字段级契约由 `backend/src` 的 `src_api_stores.md`（REST/WS）负责。

### 必须实现的函数

> 不适用：实现体在 `backend/src/market_data/config.py`（`Settings` / `get_settings()`），本节只约束其外部可见面必须在 `backend/.env.example` 有对应条目。

### 存档字段索引（不可裁减）

> 不适用：环境变量不落盘为存档结构，但 `MD_DATA_DIR` 决定了落盘根目录的层级（`parquet/`、`excel/`、`blockbeats_cache/`、`config/chart.json`），改动它会直接导致读不到历史数据。

### 设计决策（存在多种可行方案时必填）

| 决策点 | 选定方案 | 备选方案 | 选定理由 |
|--------|---------|---------|---------|
| 配置命名空间 | 统一前缀 `MD_`（`env_prefix="MD_"`） | 无前缀裸名 | 避免与系统/其它工具的通用变量（如 `LOG_LEVEL`、`DATA_DIR`）冲突；命名空间让"这是本后端的配置"一眼可辨 |
| 凭据变量命名 | 两个特例走无前缀别名：`BB_API_KEY`（兼容 `MD_BB_API_KEY`）；`BITGET_*` 完全无前缀 | 全部强加 `MD_` 前缀 | `BB_API_KEY` 需与 README/上游文档口径一致、便于用户直接写进 `.env`；`BITGET_*` 由上游 MCP/CLI 约定，改名会导致子进程拿不到凭据 |
| 列表型配置格式 | 逗号分隔字符串 + `mode="before"` validator 拆分 | JSON 数组 | `.env` 里 `MD_SYMBOLS=BTCUSDT,ETHUSDT` 最易手写；JSON 需转义引号，手写出错率高 |
| 未声明的变量处理 | `extra="ignore"` | `extra="forbid"` | `.env` 中允许同时存在上游/其它工具用的变量（如 `BITGET_*`）而不报错 |
| `.env` 解析位置 | `env_file=".env"`（相对进程 cwd） | 相对包目录的绝对路径 | 与 `uv run` / `cd backend` 的既有工作流一致；代价是必须从 `backend/` 目录启动才能读到 `.env`（见风险清单） |

## 变更风险

> 改动本子文档涉及的文件会破坏什么：

- **删除或重命名任一 `MD_*` 变量名是静默的破坏性变更**：`extra="ignore"` 使未知变量不报错，已部署的 `backend/.env` 中旧名会失效并**回落到默认值**——`MD_DATA_DIR` 回落成 `./data` 会让历史 Parquet 与缓存"看起来丢了"，`MD_AGENT_SCHEDULE_ENABLED` 回落成 `false` 会让定时交易静默停止。所有变量重命名必须在发布说明中显式标注，不能只改代码。
- **`.env.example` 与 `Settings` 脱同步即违反规格**：任一新增 `Settings` 字段若未在同一变更内补进 `.env.example` 与 README 环境变量表，部署方将无从得知该开关存在，只能依赖默认值；反之，若 `.env.example` 留着已被删除的变量，部署方会写出"设置了却无效"的配置。两种漂移都不会有任何运行时错误。（来源: openspec/specs/repo-hygiene/spec.md）
- **上调 `MD_CANDLE_PAGE_LIMIT` / `MD_V3_CANDLE_PAGE_LIMIT` 会直接触发上游接口报错**：Bitget 历史 K 线单请求上限 100 根、v3 端点每请求上限 100 行且跨度 ≤90 天，这不是策略选择而是硬上限；调大会让深回填与实时补洞一并失败。
- **把 `MD_BACKFILL_PAGE_DELAY` 设为 `0` 会放弃限流保护**：深回填会以最大速率连续请求，容易触发交易所限流甚至临时封禁；该值存在的意义就是留出退避窗口。
- **误以为配置了 `BITGET_*` 就能让后端鉴权**：`backend/` 的 Python 源码中没有任何一处读取这三个变量；它们只在 MCP 子进程继承环境后才对上游 private 操作生效，且必须三者齐全。把"后端不能下真单"归因于缺少 `BITGET_API_KEY` 是走错了方向——实盘受限的真正原因是系统默认纸面交易、需用户显式开启。
- **从 `backend/` 之外启动进程会读不到 `backend/.env`**：`.env` 解析是 cwd 相对的，从仓库根直接 `python -m market_data`（未经 uv/未切换目录）不会加载该文件；症状是"配置了却不生效"，而不是报错。
- **凭据泄漏边界的破坏**：`BB_API_KEY` 与 `BITGET_*` **MUST NOT** 下发前端或写入 Parquet / JSON 持久化文件；任何把 API Key 打进接口响应或快照的改动都违反系统级安全基线，且会造成不可撤回的泄漏。（来源: openspec/specs/system-architecture/spec.md）

## 边界：允许做什么、禁止做什么

> 判定原则：**能靠环境变量完成的配置，不得改成代码常量；能靠默认值跑通的路径，不得变成必须配置。** 一但默认路径需要凭据，公开行情的零配置可用性就破了；一但某项限额被写回代码字面量，`MD_*` 与 `.env.example` 就不再是配置真源，下一次换部署环境时无人能改。(来源: openspec/specs/system-architecture/spec.md「凭据 MUST 仅从环境变量读取」)

- **允许**：在 `backend/.env.example` 里新增一条与 `Settings` 新字段同名、同默认值的注释条目，并在同一变更里补 README 环境变量表。
- **禁止**：新增运行时开关却只用代码常量承载（新增 `MAX_PAGE = 100` 这类字面量而不进 `Settings`）——这会让 `.env.example` 不再完整，直接违反 repo-hygiene 的集合一致性断言。(来源: openspec/specs/repo-hygiene/spec.md)
- **禁止**：把凭据写入代码、Parquet、JSON 快照或任何接口响应；只能从环境变量 / `backend/.env` 读。(来源: openspec/specs/system-architecture/spec.md)
- **允许**：测试专用变量（如 `MD_TEST_SERVER_START_TIMEOUT`）可只存在于 `conftest.py` 而不进 `.env.example`，因为它不是 `Settings` 字段；但必须在本文档的常量表里显式标记其“非 Settings 字段”身份，以免下一次同步时被当作遗漏删掉。
- **禁止**：把 `BITGET_*` 占位从 `.env.example` 删除“因为后端代码不读它”——上游 MCP 子进程确实继承并用它，且 README 已把它列入对外表；只能修正注释、不能删条目。(来源: openspec/specs/system-architecture/spec.md)
- **禁止**：为了“方便”把默认值改成带凭据假设的形式（例如把 `MD_AGENT_SCHEDULE_ENABLED` 默认改为 `true`）——系统默认必须是纸面交易且不自动下单，这是安全基线而不是偏好。(来源: openspec/specs/orchestration-jobs/spec.md)

## 跨模块依赖

> 实现本子模块功能时，除本模块外还需引用的外部模块：

| 依赖模块 | 引用原因 | 关键符号 | confidence |
|---------|---------|---------|------------|
| `backend/src` | `.env.example` 的字段集合必须以 `Settings` 字段为准；新增字段的实现体（validator、别名、路径属性）在这里 | `Settings`、`get_settings`、`_split_csv`、`parquet_dir` | extracted |
| `openspec` | `.env.example` 的同步义务、开关默认值、测试期注入口径均由规格规定 | `repo-hygiene`、`orchestration-jobs`、`global-news-pipeline` | extracted |
| `agent_hub-main/docs`（外部，vendored） | `BITGET_*` 三件套的"必须齐全"契约来自上游接入文档 | `BITGET_API_KEY`/`SECRET`/`PASSPHRASE` | inferred |
| `README.md`（仓库根，`__root/__files`） | 环境变量表是同步义务的第三处，与 `.env.example` 必须同集合 | README「环境变量」节 | extracted |

> 反向依赖（谁调用了本子模块）：

| 调用方模块 | 调用场景 | 关键符号 |
|-----------|---------|---------|
| `backend/src` | 进程启动/请求处理时构造 `Settings()` 读取全部配置 | `Settings`、`get_settings` |
| `backend/tests` | L2 fixture 与离线用例通过环境变量隔离数据目录、关闭调度、拉长启动超时 | `live_server`、`MD_DATA_DIR`、`MD_SCHEDULE_INTERVAL_SECONDS`、`MD_TEST_SERVER_START_TIMEOUT` |
| `.github/workflows` | CI job 以 `uv run pytest` 启动进程时继承运行环境（CI 不写 `.env`，全部走默认值 + `online` 跳过） | `uv run pytest` |
| `backend/scripts` | 一次性回填脚本复用同一套 `MD_*` 变量（尤其 `MD_DATA_DIR` 与页大小/节流参数） | `MD_DATA_DIR`、`MD_REST_CANDLE_PAGE_LIMIT` |

## 典型调用链

> 1–3 条功能入口到本模块的调用路径（函数名链，不写代码）。

### 进程启动读取配置
```
uv run market-data（或 uvicorn 启动）
  → backend/src/market_data/config.py:Settings()            ← 本模块契约的消费点
    → pydantic-settings 读 环境变量 + cwd 相对 .env          ← 本模块：backend/.env.example 是模板
      → get_settings()（@lru_cache 进程内单例）
        → parquet_dir / blockbeats_cache_dir / excel_dir / chart_config_path（由 MD_DATA_DIR 派生）
```
> 边界：本模块不参与读取动作，但 `.env.example` 的变量名/默认值集合决定了这次读取能读到什么。默认值来源：`backend/.env.example`。

### L2 测试隔离启动
```
pytest -m live --run-live
  → backend/tests/conftest.py:live_server（session fixture）
    → 注入 MD_DATA_DIR=<临时目录>、MD_SCHEDULE_INTERVAL_SECONDS=0     ← 跨模块：backend/tests 消费本模块契约
      → 等待上限取 MD_TEST_SERVER_START_TIMEOUT（默认 180s）          ← 跨模块：测试专用旋钮，非 Settings 字段
        → 轮询 /health（权威信号）或读取 uvicorn 日志（加速信号），命中即返回
```
> 边界：`MD_SCHEDULE_INTERVAL_SECONDS=0` 是"测试不得启动增量调度"的硬前提；该值在测试中不可省略。（来源: openspec/specs/e2e-test-infra/spec.md）

### 新增一个配置项（维护链）
```
需求引入新的运行时开关
  → backend/src/market_data/config.py:Settings 新增字段
    → backend/.env.example 追加变量 + 默认值注释              ← 本模块：同步义务点 1
      → README.md「环境变量」表追加同一条目                    ← 跨模块：同步义务点 2（__root/__files）
        → 若开关影响调度，则同步 openspec 的 orchestration-jobs 规格口径
```
> 边界：三处必须在**同一变更**内完成；只改代码不改 `.env.example` 视为规格违约。（来源: openspec/specs/repo-hygiene/spec.md）

## 附：OpenSpec 摘要

> 📋 本节内容来源于 OpenSpec：`openspec/specs/repo-hygiene/spec.md`、`openspec/specs/orchestration-jobs/spec.md`、`openspec/specs/global-news-pipeline/spec.md`、`openspec/specs/system-architecture/spec.md`、`openspec/specs/e2e-test-infra/spec.md`（仅提炼与本子文档相关的契约，非完整规范）

- `.env.example` **SHALL** 包含 `Settings` 定义的全部公开配置项（含 `BB_API_KEY` / `BITGET_*` 等凭据占位），并 **SHALL** 与 README 环境变量表逐项一致（变量名与默认值）；三条（`Settings` / `.env.example` / README）**SHALL** 覆盖同一变量集合，**SHALL NOT** 存在仅在某处定义的公开变量。（来源: openspec/specs/repo-hygiene/spec.md）
- 新增 `Settings` 字段（例如 `MD_AGENT_SCHEDULE_ENABLED`）时，`.env.example` 与 README 环境变量表 **SHALL** 在同一变更内更新。（来源: openspec/specs/repo-hygiene/spec.md）
- 编排调度器 **SHALL** 始终注册熔断执行任务（保护性平仓、不新开仓、不受 kill-switch 阻断），并 **SHALL** 仅在 `MD_AGENT_SCHEDULE_ENABLED=true` 时额外注册 Agent 交易循环与 DL 重训任务；该开关 **SHALL** 默认 `false`。（来源: openspec/specs/orchestration-jobs/spec.md）
- 全球快讯管线 **SHALL** 按 `MD_NEWS_POLL_SECONDS`（默认 60 秒）在独立于事件循环的后台线程轮询全部来源；`akshare` **SHALL** 在该线程内懒加载以不拖慢 uvicorn 启动；某来源连续失败 **SHALL** 触发退避（逐次翻倍，封顶 5 倍轮询间隔）。（来源: openspec/specs/global-news-pipeline/spec.md）
- 系统 **SHALL** 默认运行于纸面交易，实盘 **MUST** 由用户显式开启；凭据 **MUST** 仅从环境变量读取。（来源: openspec/specs/system-architecture/spec.md）
- L2 fixture **SHALL** 以 `MD_DATA_DIR=<tmp>` 与 `MD_SCHEDULE_INTERVAL_SECONDS=0` 启动真实 uvicorn；就绪等待上限 **SHALL** 可被环境变量覆盖且默认 ≥120 秒（实现为 `MD_TEST_SERVER_START_TIMEOUT`，默认 180s）。（来源: openspec/specs/e2e-test-infra/spec.md）
