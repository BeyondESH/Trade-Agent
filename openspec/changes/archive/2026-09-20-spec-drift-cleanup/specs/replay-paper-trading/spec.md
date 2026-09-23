## REMOVED Requirements

### Requirement: 回放模拟下单
**Reason**: 该 requirement 描述回放模式下的纸面下单与纸面账户。代码中无任何回放 UI 或纸面账户实现（`replayEngine` 仅被自身测试引用，无组件消费），功能从未构建。
**Migration**: 无（UI 未构建）。未来如需回放纸面交易，随回放 UI 一并重新提案；真实交易仍走既有 `POST /order` 链路，不受影响。

### Requirement: 回放小结
**Reason**: 回放退出小结（总盈亏/笔数/胜率）依赖未构建的回放模拟下单，从未实现。
**Migration**: 无（UI 未构建）。随回放纸面交易一并重新提案。
