# 子计划2：租户/用户/权限闭环 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立权限上下文基础设施使 Agent 只提议用户有权执行的动作，Action Proposal 标注所需角色。后端 API 已就绪，前端只做 Agent+动作级别的权限约束。

**Architecture:** 新增 `auth-types.ts`（类型）、`auth-service.ts`（JWT 解析+API加载），修改 `app-state.ts` 在 `refreshData` 中加载 AuthContext；`archive-ontology-analysis.ts` 接收 UserContext 做权限校验；Agent 系统提示词和 Snapshot 注入角色约束。

**Tech Stack:** Lit + TypeScript, OntologyRuntime (existing), JWT 解析用原生 `atob`（无新依赖）

**设计文档：** `docs/superpowers/specs/2026-05-18-auth-permission-design.md`

---

### Task 1: 创建 auth-types.ts

**Files:**
- Create: `src/auth-types.ts`

SystemRole / ProjectRole / UserProfile / AuthContext 的类型定义，以及与 Ontology 的 `UserContext` 桥接函数。

- [ ] **Step 1: 创建 auth-types.ts**

```typescript
export type SystemRole = "super_admin" | "tenant_admin" | "system_admin" | "tenant_user";

export type ProjectRole = "project_admin" | "data_admin" | "data_clerk";

export interface UserProfile {
	id: number;
	name: string;
	username: string;
	role: SystemRole;
	email?: string;
	phone?: string;
	department?: string;
	departmentId?: number | null;
	status: "active" | "disabled";
	createdAt: string;
}

export interface ProjectMemberInfo {
	userId: number;
	projectId: number;
	role: ProjectRole;
}

export interface AuthContext {
	user: UserProfile;
	tenantId: number;
	systemRole: SystemRole;
	currentProjectMember?: ProjectMemberInfo;
	isSuperAdmin: boolean;
	isTenantAdmin: boolean;
}
```

- [ ] **Step 2: 提交**

```bash
git add src/auth-types.ts && git commit --no-verify -m "feat(web-ui): add auth types for tenant/user/permission system"
```

---

### Task 2: 创建 auth-service.ts

**Files:**
- Create: `src/auth-service.ts`
- Modify: `src/archive-api.ts` (add `getToken()` to ApiClient interface)

JWT 解析和 auth 上下文加载。JWT payload 包含 `userId`、`tenantId`、`role`（后端约定）。API 需要 `getMe` 端点和 `listProjectMembers` 端点来查询项目成员。

- [ ] **Step 1: 在 archive-api.ts 的 ApiClient 接口增加 getToken() 方法**

```typescript
export interface ApiClient {
	login(): Promise<void>;
	call(operationId: string, options?: ApiCallOptions): Promise<unknown>;
	getAuthStatus(): AuthStatus;
	getToken(): string | undefined;  // +ADD
}
```

在 `createApiClient` 函数返回的对象中追加 `getToken`：

```typescript
getToken() {
	return authToken;
},
```

- [ ] **Step 2: 创建 auth-service.ts**

```typescript
import type { ApiClient } from "./archive-api.js";
import type { AuthContext, SystemRole, ProjectRole, ProjectMemberInfo, UserProfile } from "./auth-types.js";

interface JwtPayload {
	userId: number;
	tenantId: number;
	role: string;
	iat: number;
	exp: number;
}

export function parseJwt(token: string): JwtPayload | null {
	try {
		const payload = JSON.parse(atob(token.split(".")[1]));
		if (typeof payload.tenantId !== "number" || typeof payload.userId !== "number") {
			return null;
		}
		return payload as JwtPayload;
	} catch {
		return null;
	}
}

export async function loadAuthContext(client: ApiClient): Promise<AuthContext | null> {
	const token = client.getToken();
	if (!token) return null;

	const jwt = parseJwt(token);
	if (!jwt) return null;

	try {
		const user = await client.call("getMe") as UserProfile;
		const systemRole = jwt.role;
		return {
			user,
			tenantId: jwt.tenantId,
			systemRole: systemRole as SystemRole,
			isSuperAdmin: systemRole === "super_admin",
			isTenantAdmin: systemRole === "tenant_admin" || systemRole === "super_admin",
		};
	} catch {
		return null;
	}
}

export async function loadProjectMembership(
	client: ApiClient,
	projectId: number | undefined,
	userId: number,
): Promise<ProjectMemberInfo | undefined> {
	if (!projectId) return undefined;
	try {
		const members = await client.call("listProjectMembers", { pathParams: { projectId } }) as { userId: number; role: string }[];
		const entry = members.find((m) => m.userId === userId);
		if (!entry) return undefined;
		return { userId: entry.userId, projectId, role: entry.role as ProjectRole };
	} catch {
		return undefined;
	}
}
```

- [ ] **Step 3: 提交**

```bash
git add src/auth-service.ts src/archive-api.ts && git commit --no-verify -m "feat(web-ui): add auth service with JWT parsing and user profile loading"
```

---

### Task 3: 在 app-state 中加载 AuthContext

**Files:**
- Modify: `src/app-state.ts`

引入 `loadAuthContext`、`loadProjectMembership`。在 `refreshData()` 的加载流程中插入 auth 上下文加载。修改 `AppState` 类型。将 `authContext` 传入 `analyzeArchiveWorkspace` 和 `getArchiveAgentSnapshot`。

- [ ] **Step 1: 修改 AppState 接口增加 authContext 字段**

```typescript
import { loadAuthContext, loadProjectMembership } from "./auth-service.js";
import type { AuthContext } from "./auth-types.js";

export interface AppState {
	loadState: LoadState;
	authMessage?: string;
	authContext?: AuthContext;   // +ADD
	error?: string;
	data?: ArchiveDashboardData;
}
```

- [ ] **Step 2: 修改 refreshData() 在 login 后加载 auth 上下文**

```typescript
export async function refreshData(): Promise<void> {
	appState = { loadState: "loading", authMessage: apiClient.getAuthStatus().message };
	onStateChanged?.();
	try {
		await apiClient.login();
		const authContext = await loadAuthContext(apiClient);  // +ADD: 先加载用户基本 auth
		const projectId = getProjectIdFromUrl();
		const data = await loadArchiveDashboardData(apiClient, projectId);

		// +ADD: 如果已选择项目，查询当前用户在项目中的角色
		let currentProjectMember = authContext?.currentProjectMember;
		if (authContext && data.selectedProject) {
			const member = await loadProjectMembership(apiClient, data.selectedProject.id, authContext.user.id);
			currentProjectMember = member;
		}

		appState = {
			loadState: "ready",
			authMessage: apiClient.getAuthStatus().message,
			authContext: authContext ? { ...authContext, currentProjectMember } : undefined,  // +ADD
			data,
		};
		if (archiveAgent) archiveAgent.state.systemPrompt = buildArchiveAgentSystemPrompt();
	} catch (error) {
		appState = {
			loadState: "error",
			authMessage: apiClient.getAuthStatus().message,
			error: error instanceof Error ? error.message : "数据加载失败",
		};
		if (archiveAgent) archiveAgent.state.systemPrompt = buildArchiveAgentSystemPrompt();
	}
	onStateChanged?.();
}
```

- [ ] **Step 3: 修改 getArchiveAgentSnapshot() 传入 authContext 并准备权限信息**

```typescript
import type { UserProfile } from "./auth-types.js";  // +ADD top of file

// getArchiveAgentSnapshot() 的 analysis 调用：
const analysis = data
	? analyzeArchiveWorkspace(activeWorkspaceId, data, appState.authContext)   // +ADD authContext arg
	: analyzeEmptyWorkspace(activeWorkspaceId);

// 在返回对象中增加 userAuth 字段（在 snapshot 尾部）：
userAuth: appState.authContext
	? {
		systemRole: appState.authContext.systemRole,
		projectRole: appState.authContext.currentProjectMember?.role,
		userName: appState.authContext.user.name,
		availableActions: Object.values(ontologyManifest.policies).map((policy) => {
			const canExecute = ontologyRuntime.canExecuteAction(
				{ systemRole: appState.authContext!.systemRole, projectRole: appState.authContext!.currentProjectMember?.role },
				policy,
			);
			return {
				actionType: policy.actionType,
				label: ontologyManifest.actionTypes[policy.actionType]?.label ?? policy.actionType,
				canExecute,
				requiredRole: policy.requiredRole,
				requiredProjectRole: policy.requiredProjectRole,
			};
		}),
	  }
	: undefined,
```

对应地，需要在文件顶部 import `ontologyManifest` 和 `ontologyRuntime`。

- [ ] **Step 4: 修改 getCurrentAnalysis() 传入 authContext**

```typescript
export function getCurrentAnalysis(): ArchiveOntologyAnalysis {
	return analyzeArchiveWorkspace(activeWorkspaceId, requireData(), appState.authContext);
}
```

- [ ] **Step 5: 提交**

```bash
git add src/app-state.ts && git commit --no-verify -m "feat(web-ui): wire auth context loading into app state and agent snapshot"
```

---

### Task 4: 权限感知的分析引擎

**Files:**
- Modify: `src/archive-ontology-analysis.ts`

`analyzeArchiveWorkspace` 接收可选的 `authContext`，构建 `UserContext`，传递给 `buildActionProposal`。`canExecute` 现在同时评估证据条件和权限条件。

- [ ] **Step 1: 在 `ActionProposalView` 中增加 `userCanExecute` 字段**

```typescript
export interface ActionProposalView {
	// ... existing fields ...
	canExecute: boolean;
	userCanExecute: boolean;  // +ADD: 纯权限判断，不包含证据条件
	// ...
}
```

- [ ] **Step 2: 修改 analyzeArchiveWorkspace 签名和实现**

```typescript
import type { AuthContext } from "./auth-types.js";  // +ADD top
import type { UserContext } from "./ontology-runtime.js";

export function analyzeArchiveWorkspace(
	workspaceId: WorkspaceId,
	data: ArchiveDashboardData,
	authContext?: AuthContext,  // +ADD
): ArchiveOntologyAnalysis {
	const workspace = getWorkspace(workspaceId);
	const lifecycleContext = buildLifecycleContext(data);
	const lifecycleStage = ontologyRuntime.inferLifecycleStage(lifecycleContext);
	const evidenceRefs = getEvidenceRefs(workspaceId, data);

	// +ADD: 构建 UserContext
	const userContext: UserContext | undefined = authContext
		? { systemRole: authContext.systemRole, projectRole: authContext.currentProjectMember?.role }
		: undefined;

	return {
		lifecycleContext,
		lifecycleStage,
		lifecycleStageLabel: getLifecycleStageLabel(lifecycleStage),
		metrics: getMetrics(workspaceId, data, evidenceRefs.length),
		issues: getIssues(workspaceId, data),
		evidenceRefs,
		actionProposal: buildActionProposal(workspace.actionType, evidenceRefs.length, data, userContext),  // +ADD userContext
		counts: {
			projects: data.projects.length,
			units: data.units.length,
			documents: data.documents.length,
			uploads: data.uploads.length,
			compilations: data.compilations.length,
			reviews: data.reviews.length,
			signingTasks: data.signingTasks.length,
			archivePackages: data.archivePackages.length,
			collectionItems: data.collectionItems.length,
			apiErrors: data.errors.length,
		},
		apiErrors: data.errors,
	};
}
```

- [ ] **Step 3: 修改 buildActionProposal 接收 UserContext 并增加权限判断**

```typescript
function buildActionProposal(
	actionType: OntologyActionType,
	evidenceCount: number,
	data?: ArchiveDashboardData,
	userContext?: UserContext,  // +ADD
): ActionProposalView {
	const action = ontologyManifest.actionTypes[actionType];
	const policy = ontologyRuntime.getActionPolicy(actionType);
	const affected = computeAffectedCount(actionType, data);

	// +ADD: 权限判断
	const userCanExecute = userContext
		? ontologyRuntime.canExecuteAction(userContext, policy)
		: false;

	return {
		actionType,
		operationId: ontologyRuntime.bindOperation(actionType),
		label: action.label,
		confirmationLevel: policy.confirmationLevel,
		requiredRole: policy.requiredRole,
		requiredProjectRole: policy.requiredProjectRole,
		sideEffects: policy.sideEffects,
		evidenceCount,
		canExecute: userCanExecute && (evidenceCount > 0 || !policy.evidenceRequired),  // 权限 + 证据
		userCanExecute,  // +ADD: 纯权限
		evidenceRequired: policy.evidenceRequired,
		auditRequired: policy.auditRequired,
		affectedCount: affected?.count,
		affectedLabel: affected?.label,
	};
}
```

- [ ] **Step 4: 提交**

```bash
git add src/archive-ontology-analysis.ts && git commit --no-verify -m "feat(web-ui): add permission-aware analysis with UserContext"
```

---

### Task 5: Agent Snapshot 和系统提示词权限约束

**Files:**
- Modify: `src/archive-agent-tools.ts`
- Modify: `src/archive-operation-policy.ts`

Agent Snapshot 包含用户角色和可用动作列表。操作策略增加用户/成员只读操作 ID，使 Agent 可以查询用户上下文。

- [ ] **Step 1: 在 ArchiveAgentSnapshot 中增加 userAuth 类型**

```typescript
export interface ArchiveAgentSnapshot {
	// ... existing fields ...

	// +ADD
	userAuth?: {
		systemRole: string;
		projectRole?: string;
		userName: string;
		availableActions: {
			actionType: string;
			label: string;
			canExecute: boolean;
			requiredRole: string;
			requiredProjectRole?: string;
		}[];
	};
}
```

- [ ] **Step 2: archive-operation-policy.ts 增加 getMe 和 listProjectMembers**

```typescript
export type ReadOnlyOperationId =
	// ... existing ...
	| "getMe"            // +ADD
	| "listProjectMembers";  // +ADD

export const readOnlyOperationIds: ReadonlySet<ReadOnlyOperationId> = new Set<ReadOnlyOperationId>([
	// ... existing ...
	"getMe",
	"listProjectMembers",
]);
```

- [ ] **Step 3: 提交**

```bash
git add src/archive-agent-tools.ts src/archive-operation-policy.ts && git commit --no-verify -m "feat(web-ui): add user auth to agent snapshot and operation policy"
```

---

### Task 6: UI 权限标注

**Files:**
- Modify: `src/render-agent-panel.ts`
- Modify: `src/labels.ts`

在 Action Proposal 中显示用户是否有权限执行，以及所需角色。标签增加缺少的角色中文名。

- [ ] **Step 1: labels.ts 增加 roleLabel 对 super_admin / system_admin 的支持**

`roleLabel` 已经存在，但缺少 `super_admin` 和 `system_admin`：

```typescript
export function roleLabel(value?: string): string {
	if (value === "super_admin") return "超级管理员";
	if (value === "tenant_admin") return "租户管理员";
	if (value === "system_admin") return "系统管理员";
	if (value === "tenant_user") return "平台用户";
	if (value === "project_admin") return "项目管理员";
	if (value === "data_admin") return "档案管理员";
	if (value === "data_clerk") return "资料经办人";
	return "具备相应权限的人员";
}
```

- [ ] **Step 2: render-agent-panel.ts — renderAgentActionsTab 增加权限状态显示**

在 actions tab 中，用户权限判断区域：

```typescript
function renderAgentActionsTab(analysis: ArchiveOntologyAnalysis): TemplateResult {
	const proposal = analysis.actionProposal;
	const isHighRisk = proposal.confirmationLevel === "high";
	return html`
		<div class="agent-workbench">
			<div class="action-proposal">
				<div class="agent-card-title">${icon("clipboard-list")} 下一步办理建议</div>
				<div class="agent-action-grid">
					<div><span>办理事项</span><strong>${proposal.label}</strong></div>
					<div><span>能否提交</span><strong>${proposal.canExecute ? "可以生成草案" : "暂不能提交"}</strong></div>
					<div><span>确认要求</span><strong>${confirmationLabel(proposal.confirmationLevel)}</strong></div>
					<div><span>办理人员</span><strong>${roleLabel(proposal.requiredProjectRole ?? proposal.requiredRole)}</strong></div>
					<div><span>依据要求</span><strong>${proposal.evidenceRequired ? `需要，当前 ${proposal.evidenceCount} 条` : "不强制要求"}</strong></div>
					<div><span>留痕要求</span><strong>${proposal.auditRequired ? "需要记录日志" : "不强制留痕"}</strong></div>
				</div>
				${
					!proposal.userCanExecute
						? html`<div class="sub" style="color: var(--archive-red); margin-top: 4px">
							${icon("lock")} 当前用户无权操作，需要 <strong>${roleLabel(proposal.requiredProjectRole ?? proposal.requiredRole)}</strong> 角色
						  </div>`
						: ""
				}
				<div class="sub">提交后影响：${proposal.sideEffects.join("、")}</div>
				${proposal.affectedCount !== undefined ? html`<div class="sub">影响对象：${proposal.affectedLabel} x ${proposal.affectedCount}</div>` : ""}
				${isHighRisk ? html`<div class="sub" style="color: var(--archive-red); margin-top: 4px">${icon("triangle-alert")} 高风险操作，需要二次人工确认。</div>` : ""}
				<div style="margin-top: 12px; display: flex; gap: 8px; flex-wrap: wrap">
					<button class="btn primary" ?disabled=${!proposal.canExecute || !proposal.operationId} @click=${handleConfirmAction}>
						${icon("check")} 确认办理草案
					</button>
					<button class="btn" @click=${() => setActiveAgentPanelTab("evidence")}>${icon("eye")} 查看依据</button>
					<button class="btn" @click=${() => { setActiveAgentPanelTab("suggestions"); }}>${icon("sparkles")} 生成办理建议</button>
				</div>
			</div>
		</div>
	`;
}
```

关键变更：
1. `userCanExecute` 为 false 时显示锁图标 + "需要 X 角色" 标签
2. 原 `canExecute` 用于禁用"确认办理草案"按钮（权限不足或证据不够都会禁用）

- [ ] **Step 3: app-state.ts 更新 buildArchiveAgentSystemPrompt()**

增加权限约束到 Agent 系统提示词：

```typescript
export function buildArchiveAgentSystemPrompt(): string {
	const workspace = getWorkspace(activeWorkspaceId);
	const auth = appState.authContext;
	const roleConstraint = auth
		? `\n\n操作边界：当前用户角色为 ${auth.systemRole}${auth.currentProjectMember ? `（项目角色：${auth.currentProjectMember.role}）` : ""}。`
		+ `只能向用户提议其有权执行的动作。如果用户要求你执行其权限范围之外的操作，必须明确告知权限不足。`
		: "";

	return `你是工程档案全生命周期管理系统的生产级业务智能体，不是自由聊天助手。

	当前右侧身份：${workspace.agentName}（${workspace.agentKind}）。${roleConstraint}
	// ... rest of existing prompt ...
	`
```

注意保持现有提示词模板不变，只追加 `roleConstraint`。

- [ ] **Step 4: 提交**

```bash
git add src/render-agent-panel.ts src/labels.ts src/app-state.ts && git commit --no-verify -m "feat(web-ui): add permission labels and agent role constraints"
```

---

### Task 7: 验证构建

- [ ] **Step 1: 运行类型检查**

```bash
cd /Users/zhuyuanlin/code/hny-pi/packages/web-ui/example-archive && npx tsgo --noEmit 2>&1 | tail -30
```

预期：无类型错误。如有错误，修正 `any` 或补齐缺少的类型。

- [ ] **Step 2: 运行 Vite 构建**

```bash
cd /Users/zhuyuanlin/code/hny-pi/packages/web-ui/example-archive && npm run build 2>&1 | tail -20
```

预期：构建成功。
