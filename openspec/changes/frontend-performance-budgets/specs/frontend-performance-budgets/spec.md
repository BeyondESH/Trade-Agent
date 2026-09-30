## ADDED Requirements

### Requirement: 预算取值的来源约束

前端性能预算 SHALL 取自实施时**实测的基线**，并向宽松方向取整确定；MUST NOT 采用未经测量的猜测值、行业通用值或竞品数值。预算确立后 SHALL 采用**只升不降**的棘轮策略：后续变更 MUST NOT 放宽既有预算，除非在变更中提供新的实测证据。

#### Scenario: 预算基于实测基线
- **WHEN** 首次设定某项性能预算
- **THEN** 该预算 SHALL 可由一份附有元数据的测量报告推导得出，MUST NOT 为无出处的数值

#### Scenario: 放宽预算需要证据
- **WHEN** 某次变更提议放宽既有性能预算
- **THEN** 该变更 SHALL 提供新的实测证据说明原预算不可达的原因，否则 SHALL 被拒绝

### Requirement: 首屏加载预算

系统 SHALL 在**节流档位（4× CPU 降速 + Fast 4G）**下满足首屏预算：LCP SHALL NOT 超过 2,500 ms，CLS SHALL NOT 超过 0.1。未节流读数 SHALL 仅作为对照记录，MUST NOT 作为达标依据。

#### Scenario: 节流档位下判定达标
- **WHEN** 判定首屏性能是否达标
- **THEN** 判定 SHALL 基于 4× CPU + Fast 4G 的读数；仅凭未节流读数（本地低 TTFB）断言达标 SHALL 视为无效

#### Scenario: 预算占用需留有余量
- **WHEN** 实测 LCP 已消耗超过阈值的 80%
- **THEN** 报告 SHALL 显式标注"余量不足"并给出主要贡献项（如 render delay 占比）

### Requirement: 运行时资源预算

系统 SHALL 对运行时资源设定可测上限：任一界面的 DOM 元素数 SHALL NOT 超过 1,500；持续推送场景下的主线程 JS 占用 SHALL NOT 超过单核的 20%；长时间运行 SHALL NOT 出现无界的堆或 DOM 增长。

界面的 DOM 上限 SHALL 通过挂载窗口化（仅渲染可视区域）而非裁剪数据来满足：用户 SHALL 仍能访问全量数据。

#### Scenario: DOM 上限可测
- **WHEN** 加载任意视图或停靠栏面板
- **THEN** DOM 元素总数 SHALL 低于 1,500，超限 SHALL 失败

#### Scenario: 窗口化不隐藏数据
- **WHEN** 列表采用窗口化以满足 DOM 预算
- **THEN** 滚动 SHALL 仍可到达全量条目，且滚动容器的可滚动高度 SHALL 与全量数据量一致

#### Scenario: 长时间运行不无界增长
- **WHEN** 在持续行情推送下反复切换视图与面板
- **THEN** 堆与 DOM SHALL 收敛（允许有界粘滞与 GC 锯齿），MUST NOT 呈现单调无界增长

### Requirement: 预算失败的处置

超出预算 SHALL 被判定为失败并可阻断集成；若某项预算暂时无法满足，SHALL 以显式的豁免记录（含原因与收敛计划）替代静默忽略，MUST NOT 直接删除或放宽该预算。

#### Scenario: 超限阻断
- **WHEN** 某项性能预算被超出且无豁免记录
- **THEN** 响应的校验 SHALL 以非零退出码失败

#### Scenario: 豁免需留痕
- **WHEN** 某项预算被临时豁免
- **THEN** 仓库 SHALL 包含说明豁免原因与收敛计划的记录

### Requirement: 已证伪优化方向的登记

以下方向 SHALL 被登记为**非目标**并附实测依据，后续性能变更 MUST NOT 在没有新证据的情况下重复投入：

- 实时行情状态合流中的字符串排序比较（`localeCompare`）：实测 17,773 次/秒、合计 6.26 ms/秒（约单核 0.63%），不构成瓶颈。
- 强制同步布局（forced reflow）：实测全程 31 ms（占 12.4 s 追踪的 0.25%），且主要位于第三方图表库内部，可回收收益为零。

#### Scenario: 非目标有实测依据
- **WHEN** 查阅性能非目标清单
- **THEN** 每一项 SHALL 附带实测数值与测量条件，使其可被独立复核

#### Scenario: 新的证据可以推翻登记
- **WHEN** 有新的实测证据表明某项已登记方向确实是瓶颈
- **THEN** 该方向 SHALL 可被移出非目标清单，并在变更中记录新证据
