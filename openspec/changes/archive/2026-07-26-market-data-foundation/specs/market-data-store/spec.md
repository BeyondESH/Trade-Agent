## ADDED Requirements

### Requirement: Parquet 存储层

系统 SHALL 将 K 线以 Parquet 落地,按 `category/symbol/timeframe` 分区,并**按 UTC 自然日每日一个文件**(`<YYYY-MM-DD>.parquet`)。写入 MUST 以 open_time 去重合并,保证同一 bar 不重复。

#### Scenario: 按日分文件写入

- **WHEN** 保存跨多个自然日的 K 线
- **THEN** 系统 SHALL 按 open_time 的 UTC 日期拆分写入 `<YYYY-MM-DD>.parquet`
- **AND** 可按同一组合精确读取

#### Scenario: 去重合并

- **WHEN** 新拉取数据与已存数据存在相同 open_time
- **THEN** 系统 SHALL 合并去重
- **AND** 不产生重复行

### Requirement: 读取接口

系统 SHALL 提供按品类/币种/级别/时间段读取已存 K 线的接口。

#### Scenario: 按区间读取

- **WHEN** 请求某组合在指定时间段的数据
- **THEN** 系统 SHALL 返回该区间已存 K 线(按时间升序)
