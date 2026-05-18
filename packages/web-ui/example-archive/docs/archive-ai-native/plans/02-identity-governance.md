# 子计划 02：租户、组织、用户与权限治理

## 目标

建立工程档案系统的多租户、组织、用户、项目成员、权限和审计基础，保证所有业务对象和 AI 操作都在权限边界内执行。

## 范围

- Tenant。
- Department。
- Enterprise。
- User。
- Session。
- ApiKey。
- ProjectMember。
- Role / Permission。
- OperationLog。
- JWT + API Key 双通道认证。
- AuthGuard、RolesGuard、ProjectRoleGuard。

## 交付物

- 身份和权限模型。
- 租户隔离策略。
- 项目隔离策略。
- 角色动作矩阵。
- API Key 和 JWT 处理规范。
- 审计日志规范。
- AI 权限边界规范。

## 关键能力

- 所有业务查询自动注入租户上下文。
- 项目资源必须检查 ProjectMember，管理员角色按规则绕过。
- AI Agent 只能看到当前用户可见对象。
- AI Agent 只能提议当前用户可执行或可申请的动作。
- 所有写操作生成 OperationLog。

## 独立验证

- tenant_user 不能访问其他租户项目。
- 非项目成员不能读取项目档案。
- data_clerk 不能执行归档审批、删除文件、创建签章任务等高权限动作。
- API Key 请求能被识别为 agent 客户端并受到速率限制。
- AI 无法把 JWT、API Key 或密钥内容放进模型上下文。

## 不包含

- 不实现具体项目、文件、审核业务。
- 不定义所有 UI 细节。
