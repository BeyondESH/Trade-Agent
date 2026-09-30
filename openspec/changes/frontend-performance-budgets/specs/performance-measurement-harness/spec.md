## ADDED Requirements

### Requirement: 性能测量的工具链与目标环境

性能测量 SHALL 以 Chrome DevTools MCP 的追踪能力（`performance_start_trace`、`performance_analyze_insight`、`emulate`、`take_heapsnapshot`）为基准工具；Playwright 类工具 SHALL 仅用于需要脚本化交互驱动的场景，MUST NOT 作为读取主线程 CPU 归因、内存行为与渲染阻塞归因的唯一手段。

测量目标 SHALL 为**生产构建**（`vite preview` 或等价的产物服务），MUST NOT 对开发服务器（`vite dev`）的测量结果下结论。

#### Scenario: 以生产构建为测量目标
- **WHEN** 执行任何性能测量
- **THEN** 被测页面 SHALL 由生产构建产物提供，测量报告中 SHALL 记录该构建的产物标识（如入口 JS 的哈希文件名）

#### Scenario: 主线程归因需要真实追踪
- **WHEN** 需要判断主线程耗时来自何处（bundle 解析、第三方库、强制回流）
- **THEN** SHALL 使用真实 performance trace 的调用树与 insights 归因，MUST NOT 依据 DOM 节点数或自建计时指标推断

### Requirement: 测量前置条件校验

每次测量开始前，系统 SHALL 校验被测应用处于**数据流通状态**：后端 SHALL 可达，且行情推送 SHALL 确实在投递。测量 MUST NOT 在空态（无数据的界面）下进行。测量 SHALL 记录实际推送速率作为元数据。

#### Scenario: 后端不可达时拒绝测量
- **WHEN** 后端健康检查失败或行情推送无消息
- **THEN** 测量 SHALL 中止并报告前置条件不满足，MUST NOT 产出性能结论

#### Scenario: 记录推送速率
- **WHEN** 测量处于实时行情场景
- **THEN** 报告 SHALL 包含实测的消息速率（条/秒）、字节速率与各通道占比，且该数值 SHALL 随结论一同归档

### Requirement: 测量元数据与可复现性

每份测量结论 SHALL 附带足以复现的元数据：CPU 降速档位、网络节流档位、缓存冷热状态、重复次数与取值方式（中位数）、标的数量级。缺少元数据的结论 SHALL 视为无效，MUST NOT 用于制定预算。

帧耗时类测量 SHALL 在应用进入稳态后进行，MUST NOT 计入加载阶段的读数；并 SHALL 设置空白对照以排除浏览器节流与测量开销的干扰。

#### Scenario: 结论必须可复现
- **WHEN** 报告一项性能数字
- **THEN** 该数字 SHALL 同时记录 CPU/网络节流档位与缓存状态，使他人可按相同条件复现

#### Scenario: 区分加载期与稳态
- **WHEN** 测量交互或帧率
- **THEN** SHALL 在稳态下取样，且 SHALL 以空白页对照值证明所测开销来自被测应用

### Requirement: 测量覆盖矩阵

性能测量 SHALL 覆盖全部用户可达界面与交互路径：全部视图、全部停靠栏面板、弹窗、图表交互（缩放/平移/切周期）、列表滚动、搜索输入与主题切换。测量 SHALL 说明哪些组合为必测、哪些为按需。

#### Scenario: 覆盖全部视图与面板
- **WHEN** 执行一次全量性能测量
- **THEN** 每个视图与每个停靠栏面板 SHALL 至少被测量一次，且结果 SHALL 以逐项清单形式报告，MUST NOT 只给出总体平均值

#### Scenario: 交互延迟以真实输入测量
- **WHEN** 测量交互延迟（INP 类）或布局位移（CLS）
- **THEN** SHALL 使用浏览器认定的**可信输入**，MUST NOT 仅使用脚本合成点击；若使用了合成输入，报告 SHALL 显式标注该读数可能失真

### Requirement: 结论分级与已证伪假设的归档

测量报告 SHALL 明确区分「已实测确认」与「推断待验证」两类结论。被测量**证伪**的优化假设 SHALL 连同其实测数值一并归档，MUST NOT 仅保留在对话记录中。

#### Scenario: 标注结论置信级别
- **WHEN** 报告一项性能问题
- **THEN** 该问题 SHALL 被标记为"已实测"或"推断"，且"推断"项 SHALL 附带验证方法

#### Scenario: 证伪结论不得被重复调查
- **WHEN** 某项优化假设已被实测证伪
- **THEN** 该假设与其数值证据 SHALL 被记录在案，后续调查 SHALL 引用该记录而不得在无新证据时重复同一假设
