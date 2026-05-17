---
title: "项目管理 — Object Types"
modelVersion: "1.0"
created: 2026-05-16
tags:
  - ontology
  - object-types
  - project
  - archive-manager
nav:
  parent: "[[index]]"
  domain: project-management
  prev: "[[01-organization-identity]]"
  next: "[[03-document-lifecycle]]"
---

## 项目管理域

覆盖项目、项目成员、项目扩展字段、单体工程、单体扩展字段。

### Project（项目）

| 属性 | 类型 | 说明 |
|------|------|------|
| id | integer | 项目唯一标识 |
| name | text | 项目名称 |
| code | text | 项目编码 |
| type | text | 项目类型 |
| status | enum: active/project_archive | 项目状态 |
| buildingUnit | text | 建设单位 |
| constructionUnit | text | 施工单位 |
| supervisionUnit | text | 监理单位 |
| designUnit | text | 设计单位 |
| location | text | 项目地点 |
| startDate / endDate | date | 开工/竣工日期 |
| totalArea | numeric(10,2) | 总建筑面积 |
| description | text | 项目描述 |
| accessCode / accessPassword | text | 项目访问码/密码 |
| tenantId | link → Tenant | 所属租户 |
| createdBy | link → User | 创建者 |
| createdAt / updatedAt | timestamp | 审计时间戳 |

### ProjectMember（项目成员）

| 属性 | 类型 | 说明 |
|------|------|------|
| id | integer | 成员关系唯一标识 |
| projectId | link → Project | 关联项目 |
| userId | link → User | 关联用户 |
| role | enum: project_admin/data_admin/data_clerk | 项目角色 |
| createdAt / updatedAt | timestamp | 审计时间戳 |

### ProjectExtension（项目扩展字段）

| 属性 | 类型 | 说明 |
|------|------|------|
| id | integer | 扩展字段唯一标识 |
| projectId | link → Project | 关联项目 |
| fieldKey | text | 字段键 |
| fieldValue | text | 字段值 |

### Unit（单体工程/标段）

| 属性 | 类型 | 说明 |
|------|------|------|
| id | integer | 单体工程唯一标识 |
| projectId | link → Project | 所属项目 |
| name | text | 单体名称 |
| engType | text | 工程类型 |
| structureType | text | 结构类型 |
| floors | integer | 层数 |
| buildingArea | numeric(10,2) | 建筑面积 |
| createdAt / updatedAt | timestamp | 审计时间戳 |

### UnitExtension（单体扩展字段）

| 属性 | 类型 | 说明 |
|------|------|------|
| id | integer | 扩展字段唯一标识 |
| projectId | link → Project | 关联项目 |
| unitId | link → Unit | 关联单体 |
| fieldKey | text | 字段键 |
| fieldValue | text | 字段值 |
