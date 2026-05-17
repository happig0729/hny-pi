# 设计 02：身份权限与治理

## 角色层级

平台级：

- `super_admin`：跨租户全局管理。

租户级：

- `tenant_admin`：租户内项目、用户、模板管理。
- `system_admin`：租户内系统配置。
- `tenant_user`：租户内基础用户。

项目级：

- `project_admin`：项目配置、成员、项目级高级操作。
- `data_admin`：审核、签章、归档。
- `data_clerk`：编制、著录、上传。

## 认证链

请求进入后：

1. AuthGuard 提取 Bearer Token。
2. 判断 token 类型：
   - `qd_live_` 前缀：API Key 流程。
   - 其他：JWT 流程。
3. 注入 `req.user`。
4. RolesGuard 判断系统角色。
5. ProjectRoleGuard 判断项目成员和项目角色。

## AI 权限边界

Agent Run 开始前生成 `ArchiveWorkContext`：

```ts
interface ArchiveWorkContext {
  userId: number;
  tenantId: number;
  systemRole: string;
  projectId?: number;
  projectRole?: string;
  visibleObjectScopes: string[];
  allowedActions: string[];
}
```

Agent 工具必须以 `ArchiveWorkContext` 作为输入，不允许自行传入任意 tenantId 或绕过 projectId 检查。

## 审计日志

OperationLog 必须记录：

- userId。
- tenantId。
- projectId。
- actionType。
- operationId。
- objectType。
- objectId。
- request summary。
- result status。
- ip。
- userAgent。
- createdAt。

AgentRunRecord 必须记录：

- agent profile。
- model。
- prompt version。
- tools used。
- EvidenceRef。
- Action Proposal。
- user confirmation。
- execution result。

## 权限拒绝表现

系统不只返回“无权限”，必须返回：

- 当前用户角色。
- 所需角色。
- 资源归属。
- 是否可申请权限。
- 可替代动作。

## 验收用例

1. data_clerk 在归档工作台点击生成正式归档包，系统显示需要 data_admin。
2. 非项目成员通过项目 URL 进入，系统拒绝并不泄露项目名称和文件信息。
3. Agent 试图执行 `deleteUploadFile`，但当前用户不是 data_admin，Action Proposal 不可执行。
4. OperationLog 能查到某次批量著录的用户、文件数量、operationId 和结果。
