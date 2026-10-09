## MODIFIED Requirements

### Requirement: webapi 常驻增量落盘
系统 SHALL 使增量落盘任务在 webapi 常驻运行时（FastAPI lifespan）自动启动并周期执行，使实时数据持续写入 candle store（PostgreSQL），不依赖手动 CLI 命令。任务 SHALL 按可配置周期运行，单目标失败 SHALL 仅记录日志而不影响后续调度。
