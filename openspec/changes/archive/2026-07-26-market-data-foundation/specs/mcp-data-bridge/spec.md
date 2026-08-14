## ADDED Requirements

### Requirement: MCP 数据客户端桥

系统 SHALL 提供一个 Python 客户端,以 stdio 子进程方式拉起 `bitget-agent-mcp` 并通过 MCP 协议调用其行情工具。客户端 MUST 管理连接、超时与重连,并在 Node 环境缺失时给出明确错误。

#### Scenario: 成功建立 MCP 连接

- **WHEN** 客户端初始化且 Node ≥ 20 可用
- **THEN** 系统 SHALL 拉起 `bitget-agent-mcp` 子进程
- **AND** 成功列出其可用行情工具

#### Scenario: Node 环境缺失

- **WHEN** 运行环境缺少 Node ≥ 20
- **THEN** 系统 SHALL 返回明确的错误信息而非静默失败

#### Scenario: 连接中断重连

- **WHEN** MCP 子进程意外退出
- **THEN** 客户端 SHALL 尝试重连或返回可识别的错误
