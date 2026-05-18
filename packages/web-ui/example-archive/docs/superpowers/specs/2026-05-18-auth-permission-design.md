# 子计划2：租户、组织、用户与权限闭环 — 设计文档

## 目标

在 Archive AI OS 前端建立权限上下文基础设施，使 Agent 只提议用户有权执行的动作，并通过 Action Proposal 标注所需角色。后端 API 已就绪，前端聚焦在权限感知和数据接入层。

## 范围

- 新增 `auth-types.ts`：SystemRole / ProjectRole / UserProfile / ProjectMember / AuthContext 类型
- 新增 `auth-service.ts`：JWT 解析 + getMe + listProjectMembers 加载
- 扩展 `app-state.ts`：AuthContext 加载与缓存
- 扩展 `archive-ontology-analysis.ts`：ActionProposalView 增加权限字段
- 扩展 `archive-agent-tools.ts`：Agent Snapshot 增加 userAuth 字段
- 扩展 `app-state.ts` buildArchiveAgentSystemPrompt：注入角色约束
- 扩展 `render-agent-panel.ts`：显示权限不足标签

非范围：全面 UI 按钮显隐、多租户切换 UI、OperationLog 页面、后端守卫前端模拟。

## 类型设计

### SystemRole（系统角色）

```
super_admin > tenant_admin > system_admin > tenant_user
```

### ProjectRole（项目角色）

```
project_admin > data_admin > data_clerk
```

### AuthContext

```typescript
interface AuthContext {
  user: UserProfile;
  tenantId: number;
  systemRole: SystemRole;
  currentProjectMember?: { userId: number; projectId: number; role: ProjectRole };
  isSuperAdmin: boolean;
  isTenantAdmin: boolean;
}
```

## 数据流

```
refreshData()
  → apiClient.login()                    [已有]
  → loadAuthContext(apiClient)           [新增]
     → apiClient.call("getMe")           → UserProfile
     → parseJwt(token)                   → tenantId
  → loadArchiveDashboardData()           [已有]
  → if project selected:
     listProjectMembers(projectId)       [新增]
     → 匹配当前用户 → currentProjectMember
  → appState = { ..., authContext }

getArchiveAgentSnapshot()
  → 从 appState.authContext 提取权限信息
  → 计算 availableActions（每个动作的 canExecute 状态）
  → 返回 ArchiveAgentSnapshot.userAuth

buildArchiveAgentSystemPrompt()
  → 注入角色约束文本
```

## AI Agent 权限约束

Agent Snapshot 增加 `userAuth`：

```typescript
userAuth: {
  systemRole: string;
  projectRole?: string;
  availableActions: {
    actionType: string;
    label: string;
    canExecute: boolean;
    requiredRole: string;
    requiredProjectRole?: string;
    reason?: string;
  }[];
}
```

系统提示词增加：

```
你的操作边界：当前用户角色为 {systemRole}（项目角色：{projectRole}）。
你可以执行的动作：{canExecuteList}。
你无权执行的动作：{cannotExecuteList}，不得向用户提议这些动作。
```

## Action Proposal 权限标注

`ActionProposalView` 增加：

```typescript
userCanExecute: boolean;
requiredRoleLabel: string;  // 如 "租户管理员"
requiredProjectRoleLabel?: string;  // 如 "项目管理员"
```

渲染时 `canExecute === false` 的草案显示锁定图标 + "需要 X 角色"标签。

## 文件变更清单

| 文件 | 操作 | 改动内容 |
|------|------|---------|
| `src/auth-types.ts` | 新增 | SystemRole, ProjectRole, UserProfile, AuthContext |
| `src/auth-service.ts` | 新增 | parseJwt(), loadAuthContext(), buildUserContext() |
| `src/app-state.ts` | 修改 | AppState.authContext, refreshData() 加载 auth |
| `src/archive-ontology-analysis.ts` | 修改 | ActionProposalView 权限字段 |
| `src/archive-agent-tools.ts` | 修改 | ArchiveAgentSnapshot.userAuth |
| `src/archive-operation-policy.ts` | 修改 | 增加用户/角色只读 operationId |
| `src/ontology-runtime.ts` | 修改 | UserContext 结构调整 |
| `src/render-agent-panel.ts` | 修改 | 权限不足标签渲染 |
