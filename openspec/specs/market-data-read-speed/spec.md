# market-data-read-speed Specification

## Purpose
TBD - created by syncing change market-data-speedup.
## Requirements
### Requirement: 本地库读取按需裁剪与限量

`ParquetStore.read` SHALL 按请求区间裁剪候选日文件、支持反向限量读取，且对重复读取提供文件级缓存（写入/删除时失效），使宽区间读取不随历史深度线性变慢。

#### Scenario: 区间裁剪

- **WHEN** 读取指定 `[start_ms, end_ms]`
- **THEN** SHALL 仅读取日期落在该区间内的日文件，而非全量 concat

#### Scenario: 限量反向读取

- **WHEN** 提供 `limit`
- **THEN** SHALL 从最新日文件反向累积至 `limit` 即停，返回区间内最后 `limit` 根（升序）

#### Scenario: 重复读取命中缓存

- **WHEN** 同一日文件被再次读取且期间未写入/删除
- **THEN** SHALL 直接复用内存缓存，不重复读盘

#### Scenario: 写入/删除失效缓存

- **WHEN** `save`/`delete` 修改了某日文件
- **THEN** 该文件的缓存 SHALL 被清除，后续读取 SHALL 取到最新数据

### Requirement: 回灌翻页并行化

`backfill_before_rest` SHALL 支持按预计算 cursor 链并发拉取各页，合并后按 `open_time` 去重升序落库，显著降低多页回灌的串行往返耗时。

#### Scenario: 并发拉取合并

- **WHEN** 单次回灌需翻多页
- **THEN** 各页 SHALL 并发拉取（预计算 cursor：`min(90 天, page_limit×step)` 间隔）
- **AND** 合并结果 SHALL 按 `open_time` 去重、升序，无重复落库

#### Scenario: 空页并发重试

- **WHEN** 某页返回空
- **THEN** SHALL 并发重试一次（退避），仍空才视为无数据

#### Scenario: 最旧窗口空即到最早

- **WHEN** 最旧窗口的页重试后仍为空
- **THEN** 返回 `earliest_reached=True`；否则 `False`（可能还有更早数据）
