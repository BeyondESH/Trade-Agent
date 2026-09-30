---
type: "Fragment"
id: agent_hub-main/__files/ecosystem
title: "生态路由与门面契约"
description: "AI 宿主该怎么选包？对外宣称的操作数、verb 数、安全门各是多少，README 与 llms.txt 谁说了算？"
parent: /agent_hub-main/__files/_overview.md
fragment: ecosystem
architectural_role: "对外门面层（人类 README + LLM llms.txt 双份，本仓库唯一离线的『选包与安全口径』来源）"
entity_names:
  constants:
    - name: ECOSYSTEM_PACKAGES
      value: "6 个：bitget-agent-sdk / -cli / -mcp / -skill / bitget-signal / bitget-agent-installer（README 正文表述为「5 core packages + installer」）"
      source: agent_hub-main/README.md（Ecosystem）+ llms.txt（Key facts）
    - name: VISIBLE_OPERATION_COUNT
      value: "89（对外统一口径：UTA v3 可见操作数；README 的 Overview/Ecosystem/Trading Tools/Architecture/Supported Operations/FAQ 六节均引用）"
      source: agent_hub-main/README.md、agent_hub-main/llms.txt（简介 / Key facts / FAQ 共 4 处）
    - name: CATALOG_OPERATION_COUNT
      value: "109（目录全集：89 可见 + 20 隐于 broker/instloan，见 docs/architecture.md）"
      source: agent_hub-main/docs/architecture.md（口径对照，不在本组文件内）
    - name: INTENT_VERB_COUNT
      value: "14（lean/to-C 面实际暴露数；verb 全集 16 个）"
      source: agent_hub-main/README.md（Supported Operations）
    - name: MARKET_SKILL_COUNT
      value: "5（macro-analyst / market-intel / sentiment-analyst / technical-analysis / news-briefing，免 key）"
      source: agent_hub-main/README.md（Market Tools）、llms.txt
    - name: OPERATIONS_MODULE_MAP
      value: "默认 account/trade/market（strategy、cryptoloans、tax 非默认；broker/instloan 不在 to-C 面）"
      source: agent_hub-main/README.md（Supported Operations 表）
    - name: STRATEGY_ORDER_GATE
      value: "strategy_order 挂在 trade 模块门控下（不挂 strategy）"
      source: agent_hub-main/README.md（Supported Operations 表下方说明）
    - name: SAFETY_FLAGS
      value: "--read-only（启动即移除全部写工具）/ --paper-trading（改投 Bitget Demo 环境）"
      source: agent_hub-main/README.md（Safety Modes）、llms.txt
    - name: CREDENTIAL_RULES
      value: "仅环境变量读取 + 进程内 HMAC-SHA256 本地签名 + 不解析 .env + 不走代理"
      source: agent_hub-main/README.md（Credential Protection）
    - name: KEY_ROTATION_DAYS
      value: "90（README 最佳实践条款：API key 每 90 天轮换）"
      source: agent_hub-main/README.md（Best Practices）
retrieval_hints:
  - "要让 AI 帮我自动下单/看行情，该装哪个 Bitget 包？终端 AI 和桌面 AI 有什么区别？"
  - "对外宣称的 89 个 UTA v3 操作、14 个 intent verb 出自哪里，能不能当接口契约引用？"
  - "凭据是怎么被保护的？--read-only / --paper-trading 各自挡住什么风险？"
  - "⚠️ 如果你要找具体的操作目录、riskLevel、模块过滤实现或 safeInvoke 返回信封，不在这里——在 `agent_hub-main/docs`（architecture.md）；本组文件只给规模数字与安全姿态，不给字段级契约。"
  - "⚠️ 如果你要找『本仓库怎么调用 MCP、失败怎么处理、行情怎么入库』，不在这里——在 `backend/src`（market_data/mcp_client.py、ingestion）；这里描述的是上游产品，不是本仓库实现。"
  - "⚠️ 如果你要找安装器的命令清单与受管包集合的真实行为，以 `agent_hub-main/installer` 为准；README 的命令表是人类摘要。"
  - "本文件组也叫「agent hub 门户 / 生态地图 / 官方门面文档」，对应需求里的『接入 Bitget AI Agent』『选包指引』『安全模式与风险声明』。"
  - "架构归属句：任何面向外部读者的选包结论与安全口径，**统一写进 `README.md`（人类）与 `llms.txt`（LLM）两份**并同步；本仓库自己写的消费侧说明放 `openspec` / 后端文档，不得回改上游门面。"
---

## 业务意图

上游生态有 6 个包、4 种 AI 宿主形态、2 套风险姿态（真实资金 vs Demo），新用户最常见的错误是「装了不该装的包」或「在不该开写权限的地方开了写权限」。`README.md` 与 `llms.txt` 存在的业务目的是：**在用户还没读任何代码之前，把选包决策和安全底线一次性交代清楚**，从而把「误配 API key / 用了不该用的 surface」这类高风险错误拦在起点。

在 AI 时代这条门面还多了一层用途：`llms.txt` 是给 LLM 读的（问题—答案对的形态），意味着**这些句子的措辞会被 AI 直接复述成决策依据**。LLM 与终端用户会同时把「官方包名」「免 key 可用」这类描述当作选包依据（来源: agent_hub-main/llms.txt Key facts）。对本仓库的直接影响是：我们的文档与前端文案一旦被 AI 和用户共同引用，就必须与本组数字一致，否则用户会按「能力规模对不上」的方式质疑集成结果。

## 对外契约（门面即契约）

| 契约项 | 内容 | 面向 |
|--------|------|------|
| 选包决策树 | 终端 AI（Claude Code / Codex CLI / OpenClaw）→ `bitget-agent-cli` + `bitget-agent-skill`；桌面 AI（Claude Desktop / Cursor / Continue / Windsurf / ChatGPT Desktop）→ `bitget-agent-mcp`；仅做行情分析 → `bitget-signal`（免 key）；自研工具 → `bitget-agent-sdk` | 使用者 + AI 助手 |
| 一键装配口径 | `npx @bitget-ai/bitget-agent-installer upgrade-all --target all`（装 CLI + 两套技能并部署到三个宿主） | 使用者 |
| 能力规模 | 89 个 UTA v3 操作 / 14 个 intent verb（另含 `discover`、`raw` 两个 meta 工具） | 使用者、文档消费方 |
| 安全姿态 | 凭证仅走环境变量、进程内 HMAC-SHA256 签名、**不解析 `.env`**、不走代理 | 安全评审 |
| 风险门 | `--read-only` 在启动时移除全部写工具（AI 看不见也调不到）；`--paper-trading` 全量改投 Demo 环境 | 使用者 |
| 责任边界 | 免责声明：AI 代为下的单由用户自行承担；安全漏洞走邮件上报，**不得公开发帖** | 法务/社区 |
| 免凭证路径 | 公共行情与 `bitget-signal` 五个 skill 无需任何 Bitget 账号或 key | 无账号用户 |

## 实现约束清单

### 数字口径（禁止内联自造）

| 标识符 | 值 | 所在文件 | 说明 | 约束由来 |
|-------|----|---------|------|---------|
| 操作数（对外） | `89` | `README.md`（6 处）、`llms.txt`（4 处） | 「89 个 UTA v3 操作」是门面统一口径 | 面向用户的可见面（to-C modules）规模 |
| 操作数（目录） | `109` | `docs/architecture.md`；本仓库 `openspec` 的 roadmap 设计文档亦用 109 描述 SDK | 全目录 = 89 可见 + 20 隐藏（`broker` 11 / `instloan` 9），后者需显式点名模块才加载 | 机构面不在 to-C 面上；选 109 作为技术核对口径是因为它等于 catalog 实际条目数（来源: openspec/changes/archive/2026-07-26-ai-trading-system-roadmap/design.md） |
| verb 数 | `14` | `README.md`、`llms.txt` | lean/to-C 实际暴露数；verb 全集为 16 | `modules: "all"` 只给 14 个 to-C verb |
| 包数 | `5` 或 `6` | `README.md` 写「5 core packages」，`llms.txt` 写「6 ecosystem packages」 | **同义不同数**，差异在于 installer 是否计入 | README 把 installer 称「meta-tool」，llms.txt 把它列入生态 |
| 信号技能数 | `5` | `README.md`、`llms.txt` | 免 key 行情分析技能固定为 5 个 | 后续 `top-trader-flow` 等属于「Coming Next」，未发布，**不得写成现有能力** |

### 边界与禁忌

- ❌ **禁止把门面里的 `89` 当作代码事实使用。** `docs/architecture.md` 的目录计数是 `109（89 visible + 20 hidden）`；门面刻意只宣传可见面。注意本仓库 `openspec` 沿用的也是 109（描述 SDK 能力时为“109 操作、HMAC 签名、限流、mock server”），即仓库内存在两套并存口径：对外宣传用 89，目录/技术核对用 109。若需求要校验「目录里到底有多少操作」，以 catalog（109）为准（来源: openspec/changes/archive/2026-07-26-ai-trading-system-roadmap/design.md）。
- ❌ **禁止把 `strategy_order` 的归属改成 `strategy` 模块。** README 与 docs 一致声明该 verb 门控在 `trade` 上——理由是「交易开启时，策略单是 AI 期望具备的交易能力」；`strategy` 模块其余操作仍通过 `raw` 可达。按「名字看起来属于 strategy」重新归类会破坏模块过滤契约。
  > 来源: `agent_hub-main/README.md`（Supported Operations）、`agent_hub-main/docs/architecture.md`（verb 门控段）
- ❌ **禁止在此处（或任何衍生文档）写「工具会读 `.env`」。** README 明确「No `.env` parsing：工具不读 `.env` 以防泄漏」，凭证一律从环境变量注入（来源: agent_hub-main/README.md）。这条被 `workspace.json` 的 anti-patterns 标记为 do_not；本仓库后端自己的 `.env`（`backend/.env.example`）是另一套规则，不得反向推断到上游工具面。
- ❌ **禁止在公开 issue/文档里披露安全漏洞细节**，须走 `security@bitget.com`（来源: agent_hub-main/README.md）。
- ✅ **允许**：在本仓库文档中转述选包决策树、安全姿态、免责声明，用于向用户解释「为什么后端以 stdio 子进程方式拉起 `bitget-agent-mcp`」；转述时保留「89/14/5」的口径并说明其与 catalog 109 的关系。
- ⚠️ 维护成本提示：`README.md` 与 `llms.txt` 存在**双写**。任何数字/包名/命令改动必须两处同步，且 `installer --target` / `upgrade-all` 的命令串还要与 `agent_hub-main/installer` 的实际实现核对——本组门面是摘要，实现是权威。

### 设计决策

| 决策点 | 选定方案 | 备选方案 | 选定理由 |
|--------|---------|---------|---------|
| 门面份数 | README（人类）+ `llms.txt`（LLM FAQ）双写 | 单一 README 由工具再生成 | `llms.txt` 是面向 LLM 摄取的独立事实源（标题/安装/Key facts/FAQ 段落形态），不做再生成以免与人工编辑冲突；代价见上条维护成本 |
| 数字宣传口径 | 宣传「可见面 89 + verb 14」 | 宣传「目录 109」 | 用户可用的操作才是承诺；catalog 含机构/隐藏模块，宣传它会引出无法兑现的能力 |
| 免 key 能力的归属 | `bitget-signal` 独立于交易栈，走公共 MCP 数据后端 | 与 SDK 共用 key | 它无账号、无 API key，因此不参与交易栈的升级与发布约束（见 `__files_release.md` CHANGELOG「bitget-signal is independent」） |
| 风险表达方式 | 启动期移除工具（`--read-only`）+ 环境重定向（`--paper-trading`） | 运行期二次确认 | 工具不在 AI 视野里就无从调用，比「调用时确认」更彻底；本仓库另在此之上叠加了实盘双门（「显式开启实盘」+「二次确认通过」，缺一即拒单）（来源: openspec/specs/live-safety/spec.md） |

## 为何要单独把“选包与口径”当知识

本组文件是典型“说了什么”比“实现到什么”更难查的地方。它不引入任何依赖、不进构建图，所有影响都经由人的认知：一个数字、一句包名、一个安全描述。而它的特殊风险在于**门面同时被两类完全不同的读者消费**：人拿它当入口目录，LLM 拿它当事实库。同一个“89”被两边读到，而技术真源是 109——这种差异本身是刻意的（只宣传可见面），但如果不把“为何差 20 个”写下来，下一位修改者会把它当错数据“修正”，反而弄坏真正对外承诺的口径。

使用本模块的推荐顺序：先查选包决策树（回答该装哪个包），再查安全口径（回答写权限/真资金能不可避），**最后才看数字口径**。如果需求要的是字段级约定（verb 参数、riskLevel、返回信封），本组文件不具备也不会更新，必须去 `agent_hub-main/docs`；把门面里的宣传数当成可编码的契约，是本模块见过的最典型误用。

## 变更风险（改门面会破坏什么）

- **改数字口径**：风险不在编译，而在“下游照错数字去承诺”。本仓库的 agent / 前端文案如果沿用了 89/14，而上游改成 16 个 verb 或新增可见模块，两边就会在用户面前打架；同时 AI 助手会把旧数字当权威到处复述。
- **改安全描述措辞**：`--read-only`/`paper-trading` 的表述是用户决定“要不要给写权限”的唯一依据。把“启动即移除写工具”改弱成“需要时确认”，会让原本足够安全的配置习惯变成风险。
- **改选包决策树**：AI 宿主与包的一一对应是硬事实（MCP 包并不能给终端 CLI 用），写错会直接导致用户装错包并报“功能不存在”。
- **删免责声明**：丢掉“AI 代下单风险自担”的表述，会让上游法务口径缺失；与上一条不同的是，它属于责任边界而非功能文档。
- **忘记双写**：只改 `README.md` 不改 `llms.txt`（或反之）会造成“人看到 A、AI 看到 B”，且因为两者不互相引用，长期不会被发现。

## 跨模块依赖

| 依赖模块 | 引用原因 | 关键符号 | confidence |
|---------|---------|---------|------------|
| `agent_hub-main/docs` | 门面数字（89 / 14）的完整推导（模块分布、隐藏的 broker/instloan、MCP 工具上限）只在架构文档中 | `CATALOG_OPERATION_COUNT`、`DEFAULT_MODULES` | extracted |
| `agent_hub-main/installer` | README「Installer / Commands / Flags」章节是安装器的门面摘要，命令集合与 `--target` 取值以实现为权威 | `TARGET_PACKAGES`、`DEPLOY_TARGETS` | extracted |
| `agent_hub-main/assets` | README 首行 `<img src="assets/logo.png">` 是该素材唯一引用点，删除图片会破图 | — | extracted |
| `openspec` | 本仓库对上游的依赖边界（只消费、不 fork）与 AI Agent 通道选型（走 `bitget-agent-mcp`）出自规格 | `system-architecture` 规格 | extracted |

| 调用方模块 | 调用场景 | 关键符号 |
|-----------|---------|---------|
| 本仓库根 `README.md` / 前端文案 | 转述「AI Agent 通过 MCP 下单」的产品事实与安全口径时引用本组门面 | — |
| `backend/src` 文档字符串 | 说明为何以 stdio 子进程拉 `@bitget-ai/bitget-agent-mcp` | `mcp_client.py` 模块 docstring |

## 典型调用链（门面如何影响真实决策）

```
用户/AI 提问「让 AI 帮我监控行情并下单」
  → README.md 决策树 / llms.txt FAQ                        ← 本模块（选包结论）
    → 选终端栈：npx @bitget-ai/bitget-agent-installer upgrade-all --target all
      → installer/cli.mjs 解析受管包并 npm/pnpm 安装        ← 跨模块：agent_hub-main/installer
        → 交易栈能力面 = 89 操作 / 14 verb                  ← 跨模块：agent_hub-main/docs（catalog）
          → 本仓库 backend 以 stdio 子进程接 bitget-agent-mcp ← 跨模块：backend/src/market_data/mcp_client.py
```

---

> 📄 本节内容来源于仓库内置文档：`agent_hub-main/README.md`、`agent_hub-main/llms.txt`（原文已提炼，非完整转录）
> 📋 涉及 OpenSpec 的条目来源于：`openspec/specs/live-safety/spec.md`、`openspec/changes/archive/2026-07-26-ai-trading-system-roadmap/design.md`
