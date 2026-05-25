---
title: "归档与采集 — Object Types"
modelVersion: "1.0"
created: 2026-05-16
tags:
  - ontology
  - object-types
  - archive
  - collection
  - archive-manager
nav:
  parent: "[[index]]"
  domain: archive-collection
  prev: "[[05-review-signing]]"
  next: "[[07-ai-compliance]]"
---

## 归档与采集域

覆盖归档包生成和档案采集追踪两个核心实体。

### ArchivePackage（归档包）

| 属性 | 类型 | 说明 |
|------|------|------|
| id | integer | 归档包唯一标识 |
| projectId | link → Project | 所属项目 |
| name | text | 归档包名称 |
| stage | text | 归档阶段 |
| fileCount | integer | 文件数量 |
| packageUrl | text | 归档包 URL |
| packageSize | bigint | 归档包大小（字节） |
| status | enum: generating/ready/submitted | 归档包状态 |
| createdBy | link → User | 创建者 |
| createdAt | timestamp | 创建时间 |

### CollectedItem（已采集档案项）

记录哪些档案著录项已被采集/归档，防止重复采集。

| 属性 | 类型 | 说明 |
|------|------|------|
| id | integer | 采集记录唯一标识 |
| projectId | link → Project | 所属项目 |
| itemId | text | 著录项 ID |
| fileType | enum: natural_collect/promise_transfer/natural_missing/shared_file | 采集类型 |
| collectedAt | timestamp | 采集时间 |
| collectedBy | link → User | 采集者 |
