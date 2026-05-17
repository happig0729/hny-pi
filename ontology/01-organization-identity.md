---
title: "组织架构与用户身份 — Object Types"
modelVersion: "1.0"
created: 2026-05-16
tags:
  - ontology
  - object-types
  - organization
  - identity
  - archive-manager
nav:
  parent: "[[index]]"
  domain: organization-identity
  next: "[[02-project-management]]"
---

## 组织架构与用户身份域

覆盖租户、部门、企业等组织实体，以及用户、会话、API 密钥、微信绑定、用户偏好等身份相关实体。

### Tenant（租户）

| 属性 | 类型 | 说明 |
|------|------|------|
| id | integer | 租户唯一标识 |
| name | text | 租户名称 |
| code | text | 租户编码（唯一） |
| plan | enum: basic/standard/premium | 套餐等级 |
| status | enum: active/pending/frozen | 租户状态 |
| projectCount | integer | 项目数量 |
| userCount | integer | 用户数量 |
| storage | bigint | 已用存储空间（字节） |
| expiresAt | timestamp | 到期时间 |
| createdBy | link → User | 创建者 |
| createdAt / updatedAt | timestamp | 审计时间戳 |

### Department（部门）

| 属性 | 类型 | 说明 |
|------|------|------|
| id | integer | 部门唯一标识 |
| name | text | 部门名称 |
| tenantId | link → Tenant | 所属租户 |
| createdAt / updatedAt | timestamp | 审计时间戳 |

### Enterprise（参建企业）

| 属性 | 类型 | 说明 |
|------|------|------|
| id | integer | 企业唯一标识 |
| name | text | 企业名称 |
| type | enum: building/construction/supervision/design/survey | 企业类型 |
| creditCode | text | 统一社会信用代码 |
| createdBy | link → User | 创建者 |
| createdAt / updatedAt | timestamp | 审计时间戳 |

### User（用户）

| 属性 | 类型 | 说明 |
|------|------|------|
| id | integer | 用户唯一标识 |
| name | text | 显示名称 |
| username | text | 登录用户名（唯一） |
| email / phone | text | 联系方式 |
| role | enum: super_admin/tenant_admin/system_admin/tenant_user | 系统角色 |
| tenantId | link → Tenant | 所属租户 |
| department / departmentId | text / link → Department | 所属部门 |
| status | enum: active/disabled | 账户状态 |
| passwordHash / salt | text | 认证凭证（加密存储） |
| lastLoginAt | timestamp | 最后登录时间 |
| avatarUrl | text | 头像 URL |
| forcePasswordChange | boolean | 是否强制修改密码 |
| createdAt / updatedAt | timestamp | 审计时间戳 |

### Session（会话）

| 属性 | 类型 | 说明 |
|------|------|------|
| id | integer | 会话唯一标识 |
| userId | link → User | 关联用户 |
| refreshToken | text | Refresh Token（唯一） |
| expiresAt | timestamp | 过期时间 |
| createdAt / updatedAt | timestamp | 审计时间戳 |

### ApiKey（API 密钥）

| 属性 | 类型 | 说明 |
|------|------|------|
| id | integer | 密钥唯一标识 |
| userId | link → User | 所属用户 |
| keyPrefix | text | 密钥前缀（展示用） |
| keyHash | text | 密钥哈希（bcrypt） |
| name | text | 密钥名称标签 |
| status | enum: active/revoked | 密钥状态 |
| lastUsedAt / expiresAt | timestamp | 使用/过期时间 |
| createdAt / updatedAt | timestamp | 审计时间戳 |

### WechatBinding（微信绑定）

| 属性 | 类型 | 说明 |
|------|------|------|
| id | integer | 绑定唯一标识 |
| userId | link → User | 关联用户 |
| openid / unionid | text | 微信 OpenID / UnionID |
| nickname | text | 微信昵称 |
| createdAt / updatedAt | timestamp | 审计时间戳 |

### UserPreference（用户偏好）

| 属性 | 类型 | 说明 |
|------|------|------|
| id | integer | 偏好记录唯一标识 |
| userId | link → User | 关联用户 |
| key | text | 偏好键 |
| value | jsonb | 偏好值（任意类型） |
| createdAt / updatedAt | timestamp | 审计时间戳 |
