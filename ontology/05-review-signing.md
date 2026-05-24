---
title: "审核与签章 — Object Types"
modelVersion: "1.0"
created: 2026-05-16
tags:
  - ontology
  - object-types
  - review
  - signing
  - archive-manager
nav:
  parent: "[[index]]"
  domain: review-signing
  prev: "[[04-template-catalog]]"
  next: "[[06-archive-collection]]"
---

## 审核与签章域

覆盖审核记录、签章任务、签章节点、印章。

### Review（审核记录）

| 属性 | 类型 | 说明 |
|------|------|------|
| id | integer | 审核唯一标识 |
| documentId | link → Document | 关联文档 |
| status | enum: pending/approved/rejected | 审核状态 |
| assignedTo | link → User | 指派审核人 |
| submittedBy | link → User | 提交审核者 |
| comment | text | 审核意见 |
| createdAt / updatedAt | timestamp | 审计时间戳 |

### SigningTask（签章任务）

签章任务是档案签章的编排容器，定义了签章流程模式和参与节点。

| 属性 | 类型 | 说明 |
|------|------|------|
| id | integer | 签章任务唯一标识 |
| projectId | link → Project | 所属项目 |
| catalogItemId | text | 关联著录项 ID |
| docId | link → Document | 关联文档 |
| docName | text | 文档名称 |
| sourceType | text | 来源类型（compilation/upload） |
| sourceId | integer | 来源 ID |
| flowMode | enum: parallel/sequential | 签章流程模式 |
| currentNodeIdx | integer | 当前节点索引 |
| status | enum: pending/in_progress/completed/rejected | 任务状态 |
| createdBy | link → User | 创建者 |
| createdAt / updatedAt | timestamp | 审计时间戳 |

### SigningNode（签章节点）

| 属性 | 类型 | 说明 |
|------|------|------|
| id | integer | 签章节点唯一标识 |
| taskId | link → SigningTask | 所属签章任务 |
| label | text | 节点标签 |
| type | enum: person/company | 签章主体类型 |
| assignee | link → User | 指派签章人 |
| sealResourceId | integer | 关联印章资源 |
| sortOrder | integer | 顺序 |
| status | enum: pending/signed/rejected | 节点状态 |
| signedAt | timestamp | 签章时间 |
| comment | text | 签章备注 |

### Seal（印章）

| 属性 | 类型 | 说明 |
|------|------|------|
| id | integer | 印章唯一标识 |
| type | enum: company/personal | 印章类型 |
| name | text | 印章名称 |
| holder | text | 持有人 |
| status | enum: active/pending/expired/revoked | 印章状态 |
| issuer | text | 颁发机构 |
| issuedAt / validFrom / validUntil | timestamp | 颁发/有效期 |
| remainingUses | integer | 剩余可用次数 |
| idNumber / phone | text | 个人印章关联身份 |
| companyName / creditCode | text | 企业印章关联信息 |
| createdBy | link → User | 创建者 |
| createdAt / updatedAt | timestamp | 审计时间戳 |
