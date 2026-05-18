---
title: "邀请与系统管理 — Object Types"
modelVersion: "1.0"
created: 2026-05-16
tags:
  - ontology
  - object-types
  - invitation
  - system-management
  - archive-manager
nav:
  parent: "[[index]]"
  domain: invitation-system
  prev: "[[07-ai-compliance]]"
---

## 邀请与系统管理域

覆盖项目邀请机制和系统管理基础设施（职位、角色、菜单、字典、通知、日志）。

### 邀请与接入

#### InviteLink（邀请链接）

| 属性 | 类型 | 说明 |
|------|------|------|
| id | integer | 邀请链接唯一标识 |
| projectId | link → Project | 关联项目 |
| code | text | 邀请码（唯一） |
| inviteRemark | text | 邀请备注 |
| role | enum: project_admin/data_admin/data_clerk | 邀请角色 |
| expiry | enum: 30d/90d/permanent | 有效期类型 |
| expiresAt | timestamp | 过期时间 |
| status | enum: active/revoked | 链接状态 |
| usedCount | integer | 已使用次数 |
| createdBy | link → User | 创建者 |
| createdAt | timestamp | 创建时间 |

#### InviteMember（受邀成员）

| 属性 | 类型 | 说明 |
|------|------|------|
| id | integer | 成员记录唯一标识 |
| linkId | link → InviteLink | 关联邀请链接 |
| projectId | link → Project | 关联项目 |
| userId | link → User | 关联用户 |
| name | text | 成员名称 |
| role | enum: project_admin/data_admin/data_clerk | 项目角色 |
| unit | text | 所属单位 |
| joinMethod | enum: access_code/invite_link | 加入方式 |
| isOwner | boolean | 是否项目拥有者 |
| joinedAt | timestamp | 加入时间 |

### 系统管理

#### Position（职位）

| 属性 | 类型 | 说明 |
|------|------|------|
| id | integer | 职位唯一标识 |
| name | text | 职位名称 |
| code | text | 职位编码 |
| department / level | text | 所属部门 / 职级 |
| createdAt / updatedAt | timestamp | 审计时间戳 |

#### Role（角色）

| 属性 | 类型 | 说明 |
|------|------|------|
| id | integer | 角色唯一标识 |
| name | text | 角色名称 |
| description | text | 角色描述 |
| userCount | integer | 关联用户数 |
| permissions | jsonb: string[] | 权限列表 |
| createdAt / updatedAt | timestamp | 审计时间戳 |

#### Menu（菜单）

| 属性 | 类型 | 说明 |
|------|------|------|
| id | integer | 菜单唯一标识 |
| name | text | 菜单名称 |
| path | text | 路由路径 |
| icon | text | 图标标识 |
| status | enum: active/disabled | 菜单状态 |
| parentId | link → self | 父菜单（树形结构） |
| sortOrder | integer | 排序序号 |
| createdAt | timestamp | 创建时间 |

#### Dictionary（数据字典）

| 属性 | 类型 | 说明 |
|------|------|------|
| id | integer | 字典唯一标识 |
| name | text | 字典名称 |
| code | text | 字典编码 |
| items | jsonb: {code, name}[] | 字典项 |
| remark | text | 备注 |
| createdAt / updatedAt | timestamp | 审计时间戳 |

#### Notice（通知公告）

| 属性 | 类型 | 说明 |
|------|------|------|
| id | integer | 通知唯一标识 |
| title | text | 标题 |
| content | text | 内容 |
| publishedAt | timestamp | 发布时间 |
| important | boolean | 是否重要 |
| createdBy | link → User | 创建者 |
| createdAt | timestamp | 创建时间 |

#### OperationLog（操作日志）

| 属性 | 类型 | 说明 |
|------|------|------|
| id | integer | 日志唯一标识 |
| userId | link → User | 操作用户 |
| action | text | 操作动作 |
| module | text | 操作模块 |
| ip | text | 客户端 IP |
| createdAt | timestamp | 创建时间 |
