---
title: "AI 与合规 — Object Types"
modelVersion: "1.0"
created: 2026-05-16
tags:
  - ontology
  - object-types
  - ai
  - compliance
  - archive-manager
nav:
  parent: "[[index]]"
  domain: ai-compliance
  prev: "[[06-archive-collection]]"
  next: "[[08-invitation-system]]"
---

## AI 与合规域

覆盖 AI 模型配置和档案合规预检两个实体。

### AiConfig（AI 配置）

| 属性 | 类型 | 说明 |
|------|------|------|
| id | integer | 配置唯一标识 |
| userId | link → User（唯一） | 每个用户一条配置 |
| baseUrl | text | API 端点 |
| apiKey | text | API Key（加密存储） |
| model | text | 模型名称 |
| isEnabled | boolean | 是否启用 |
| lastTestedAt | timestamp | 最后测试时间 |
| lastTestResult | text | 最后测试结果 |
| createdAt / updatedAt | timestamp | 审计时间戳 |

### CompliancePrecheck（合规预检）

| 属性 | 类型 | 说明 |
|------|------|------|
| id | integer | 预检唯一标识 |
| projectId | link → Project | 所属项目 |
| status | enum: running/passed/failed/warning | 预检状态 |
| totalChecks / passedChecks | integer | 检查总数/通过数 |
| errorCount / warningCount / infoCount | integer | 问题统计 |
| issues | jsonb: PrecheckIssue[] | 问题详情列表 |
| checkedFiles | jsonb: CheckedFileSummary[] | 被检查文件汇总 |
| skipCompleteness / skipFormat / skipContent | text | 跳过的检查项 |
| duration | integer | 耗时（毫秒） |
| checkedBy | link → User | 检查者 |
| checkedAt | timestamp | 检查时间 |
| createdAt | timestamp | 创建时间 |
