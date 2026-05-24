---
title: "Security & Governance — Archive Manager Ontology"
modelVersion: "2.0"
created: 2026-05-16
updated: 2026-05-17
tags:
  - ontology
  - security
  - governance
  - archive-manager
---

## Security & Governance（安全与治理）

### 权限模型层级

```
Platform Level
  └─ super_admin: 跨租户全局管理

Tenant Level
  └─ tenant_admin: 租户内项目管理、用户管理
  └─ tenant_user: 租户内基础使用

Project Level (ProjectMember.role)
  └─ project_admin: 项目配置、成员管理、高级操作
  └─ data_admin: 档案审核、归档管理
  └─ data_clerk: 档案编制、著录、上传
```

### 数据隔离策略

| 层级 | 隔离方式 |
|------|---------|
| 租户隔离 | 所有业务表通过 tenantId（直接或间接）隔离，查询时自动注入租户上下文 |
| 项目隔离 | 通过 projectId + ProjectMember 联合检查，确保用户只能访问其所在项目的档案 |
| 字段级安全 | 密码哈希、API Key 加密存储；UserPreference 的 value 按 key 做访问控制 |

### 角色层级

```
super_admin > tenant_admin > system_admin > tenant_user
```

上级角色自动继承下级角色的全部权限。存储位置：

| 层级 | 角色 | 存储 |
|------|------|------|
| 平台级 | `super_admin` | `users.role` |
| 租户级 | `tenant_admin` | `users.role` |
| 租户级 | `system_admin` | `users.role` |
| 租户级 | `tenant_user` | `users.role`（默认） |
| 项目级 | `project_admin` | `project_members.role` |
| 项目级 | `data_admin` | `project_members.role` |
| 项目级 | `data_clerk` | `project_members.role` |

### ProjectRoleGuard 行为

- `super_admin` / `tenant_admin` / `system_admin`：自动绕过项目成员检查，视为项目成员
- 租户级管理员访问项目资源时，无需在 `project_members` 表中存在
- `project_admin` 及以上可管理项目成员、配置项目设置

### 认证策略

**双通道认证**：JWT（用户登录） + API Key（程序化访问）。

```
认证头: Authorization: Bearer <token>
JWT 载荷: { userId, tenantId, role, iat, exp }
API Key 前缀: qd_live_  // bcrypt 哈希存储，密钥原文仅创建时返回一次
```

AuthGuard 拦截链：提取 Bearer Token → 判断前缀（qd_live_ → API Key 验证流程，否则 → JWT 验证流程）→ 注入 `req.user`。

### 三守卫授权链

```
Request → AuthGuard → RolesGuard → ProjectRoleGuard → Route Handler
              │             │               │
              ▼             ▼               ▼
         JWT/API Key    角色层级检查    项目成员检查
         验证身份        (route 级)      (projectId 级)
```

- **AuthGuard**: 验证 Bearer Token，注入 `req.user`（userId, tenantId, role）
- **RolesGuard**: 根据路由声明的 `@Roles()` 装饰器检查用户角色是否满足层级要求
- **ProjectRoleGuard**: 对于带 `projectId` 参数的路由，检查用户是否为项目成员（或具有绕过权限）

### 客户端类型与速率限制

| 客户端类型 | 标识方式 | 速率限制（每 15 分钟） | 说明 |
|-----------|---------|---------------------|------|
| `web` | User-Agent / Header | 1,000 请求 | Web 前端 |
| `h5` | User-Agent / Header | 1,500 请求 | 移动端 H5 |
| `wechat_mini` | User-Agent / Header | 2,000 请求 | 微信小程序 |
| `agent` | Header `x-client-type: agent` | 500 请求 | AI Agent / 自动化工具 |

速率限制通过 `x-ratelimit-*` 响应头暴露剩余额度。测试环境（`NODE_ENV=test`）速率限制放宽 100 倍。

### 响应信封规范

所有 API 响应使用统一信封：

```typescript
interface ApiResponse<T> {
  code: number        // 业务状态码（0 = 成功）
  message: string     // 提示信息
  data: T             // 载荷数据
  success: boolean    // 是否成功
}
```

前端通过 `api-client-react`（Orval 生成）自动解包 `data` 字段。

### 审计日志覆盖

OperationLog 记录所有状态变更动作（仅 POST/PUT/PATCH/DELETE）：

- 用户操作：登录、登出、密码修改、微信绑定
- 档案操作：编制、提交、审核、签章、归档、采集
- 管理操作：创建项目、邀请成员、配置模板、审批印章
- 接入操作：加入项目（access_code / invite_link）、公共用户绑定租户
