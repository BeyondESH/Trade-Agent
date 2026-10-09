## MODIFIED Requirements

### Requirement: 离线可运行
除显式标记为 `--live` 的用例外，L2 API 测试 SHALL 在无外部网络（Bitget/BlockBeats）环境下全部通过：历史与回填基于种子 candle store（PostgreSQL 测试库，`live_server` fixture 将 `MD_POSTGRES_DSN` 指向测试库并预置 K 线），告警/图表配置同样基于测试库。原依赖确定性 RuleBasedProvider 的 agent 用例已随自定义 Agent 层移除。
#### Scenario: 断网运行
- **WHEN** 在无外网环境执行 L2 测试
- **THEN** 非 `--live` 用例 SHALL 全部通过，`--live` 用例 SHALL 被 skipif 跳过而非失败
