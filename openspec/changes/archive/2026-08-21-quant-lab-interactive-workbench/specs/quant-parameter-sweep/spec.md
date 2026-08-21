# quant-parameter-sweep Specification

## Purpose
参数扫描输入交互化:阈值/费用/滑点网格输入由硬编码改为滑杆 + 可编辑列表,用户可自定义扫描范围后提交。

## ADDED Requirements

### Requirement: 扫描网格输入可编辑

QUANT LAB 参数扫描视图 SHALL 允许用户编辑扫描输入:阈值、费用、滑点三个维度 SHALL 各提供滑杆范围与步长控件,或可编辑值列表;提交时 SHALL 按当前输入生成网格请求。

#### Scenario: 自定义阈值网格

- **WHEN** 用户将阈值范围改为 0.4–0.8、步长 0.1
- **THEN** 提交请求 SHALL 携带 thresholds=[0.4,0.5,0.6,0.7,0.8]

#### Scenario: 缺省网格兼容

- **WHEN** 用户不修改扫描输入
- **THEN** 提交请求 SHALL 使用与现状一致的默认阈值/费用/滑点集合
