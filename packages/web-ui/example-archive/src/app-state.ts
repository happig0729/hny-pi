import type { Agent } from "@earendil-works/pi-agent-core";
import type { ChatPanel } from "@earendil-works/pi-web-ui";
import {
	AppStorage,
	CustomProvidersStore,
	IndexedDBStorageBackend,
	ProviderKeysStore,
	SessionsStore,
	SettingsStore,
	setAppStorage,
} from "@earendil-works/pi-web-ui";
import type { ArchiveDashboardData, ProjectMemberRecord } from "./archive-api.js";
import { createApiClient, loadArchiveDashboardData } from "./archive-api.js";
import { loadAuthContext } from "./auth-service.js";
import type { AuthContext, ProjectMemberInfo } from "./auth-types.js";
import { analyzeArchiveWorkspace, analyzeEmptyWorkspace, type ArchiveOntologyAnalysis } from "./archive-ontology-analysis.js";
import { ontologyManifest, ontologyRuntime } from "./ontology-runtime.js";
import { loadConfig } from "./config.js";
import { getWorkspace, type WorkspaceId } from "./workspace-definitions.js";

type LoadState = "loading" | "ready" | "error";

export interface AppState {
	loadState: LoadState;
	authMessage?: string;
	authContext?: AuthContext;
	error?: string;
	data?: ArchiveDashboardData;
}

export const config = loadConfig();
export const apiClient = createApiClient(config);

export let activeWorkspaceId: WorkspaceId = "cockpit";
export let activeAgentPanelTab = "suggestions" as "suggestions" | "evidence" | "actions";
export let appState: AppState = { loadState: "loading" };
export let archiveAgent: Agent | undefined;
export let chatPanel: ChatPanel | undefined;
export let agentUnsubscribe: (() => void) | undefined;

export function setArchiveAgent(agent: Agent): void { archiveAgent = agent; }
export function setChatPanel(panel: ChatPanel): void { chatPanel = panel; }
export function setAgentUnsubscribe(fn: (() => void) | undefined): void { agentUnsubscribe = fn; }

const settings = new SettingsStore();
export const providerKeys = new ProviderKeysStore();
const sessions = new SessionsStore();
const customProviders = new CustomProvidersStore();
const backend = new IndexedDBStorageBackend({
	dbName: "archive-ai-native",
	version: 1,
	stores: [
		settings.getConfig(),
		SessionsStore.getMetadataConfig(),
		providerKeys.getConfig(),
		customProviders.getConfig(),
		sessions.getConfig(),
	],
});

settings.setBackend(backend);
providerKeys.setBackend(backend);
customProviders.setBackend(backend);
sessions.setBackend(backend);
export const storage = new AppStorage(settings, providerKeys, sessions, customProviders, backend);
setAppStorage(storage);

export function requireData(): ArchiveDashboardData {
	if (!appState.data) throw new Error("Archive dashboard data is not loaded");
	return appState.data;
}

export function getCurrentAnalysis(): ArchiveOntologyAnalysis {
	return analyzeArchiveWorkspace(activeWorkspaceId, requireData(), appState.authContext);
}

export function getArchiveAgentSnapshot() {
	const workspace = getWorkspace(activeWorkspaceId);
	const data = appState.data;
	const analysis = data ? analyzeArchiveWorkspace(activeWorkspaceId, data, appState.authContext) : analyzeEmptyWorkspace(activeWorkspaceId);

	return {
		workspace: {
			id: workspace.id,
			label: workspace.label,
			agentName: workspace.agentName,
			agentKind: workspace.agentKind,
			actionType: workspace.actionType,
			ontologyScope: workspace.ontologyScope,
			primaryObjects: workspace.primaryObjects,
		},
		project: data?.selectedProject
			? {
				id: data.selectedProject.id,
				name: data.selectedProject.name,
				code: data.selectedProject.code,
				status: data.selectedProject.status,
			}
			: undefined,
		lifecycleStage: {
			id: analysis.lifecycleStage,
			label: analysis.lifecycleStageLabel,
		},
		lifecycleContext: analysis.lifecycleContext,
		loadState: appState.loadState,
		auth: apiClient.getAuthStatus(),
		metrics: analysis.metrics,
		issues: analysis.issues,
		evidenceRefs: analysis.evidenceRefs,
		actionProposal: analysis.actionProposal,
		counts: analysis.counts,
		apiErrors: analysis.apiErrors,
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
	};
}

export function buildArchiveAgentSystemPrompt(): string {
	const workspace = getWorkspace(activeWorkspaceId);
	const roleConstraint = appState.authContext
		? `当前用户角色：${appState.authContext.systemRole}${appState.authContext.currentProjectMember ? `（项目角色：${appState.authContext.currentProjectMember.role}）` : ""}。只能向用户提议其有权执行的动作。`
		: "";
	return `你是工程档案全生命周期管理系统的生产级业务智能体，不是自由聊天助手。

当前右侧身份：${workspace.agentName}（${workspace.agentKind}）。
${roleConstraint}
工作原则：
- 本体是领域知识字典，显式定义对象、关系、动作、策略、证据和生命周期；回答必须基于本体和真实后端数据。
- 涉及项目、资料、上传文件、审核、签章、预检、归档包、采集项时，先调用 archive_context 获取本体推导后的当前上下文。
- 需要补充读取后端数据时，只能通过 archive_api_read 读取后端只读接口。
- 不要声称已经创建、更新、审核、签章、归档或删除任何对象；当前工具层不开放写操作。
- 对高风险动作只给出"办理草案、业务依据、影响对象、确认条件、阻塞项"，等待人工确认。
- 如果数据不足，明确指出缺少哪些后端业务数据或可追溯依据，不要编造。

输出要求：
- 优先给出结论，再给证据。
- 使用工程档案业务语言：项目、单位工程、目录节点、资料、文件著录、编制、审核、签章、预检、归档包、采集。
- 每个建议应说明关联对象、依据、下一步动作和是否需要人工确认。`;
}

let onStateChanged: (() => void) | undefined;

export function setRenderCallback(cb: () => void): void {
	onStateChanged = cb;
}

export function setActiveWorkspace(workspaceId: WorkspaceId): void {
	activeWorkspaceId = workspaceId;
	if (archiveAgent) archiveAgent.state.systemPrompt = buildArchiveAgentSystemPrompt();
	onStateChanged?.();
}

export function setActiveAgentPanelTab(tab: "suggestions" | "evidence" | "actions"): void {
	activeAgentPanelTab = tab;
	onStateChanged?.();
}

export async function refreshData(): Promise<void> {
	appState = { loadState: "loading", authMessage: apiClient.getAuthStatus().message };
	onStateChanged?.();
	try {
		await apiClient.login();
		const authContext = await loadAuthContext(apiClient);
		const projectId = getProjectIdFromUrl();
		const data = await loadArchiveDashboardData(apiClient, projectId);
		let currentProjectMember: ProjectMemberInfo | undefined;
		if (authContext && data.selectedProject) {
			const member = data.members.find((m: { userId?: number }) => m.userId === authContext.user.id);
			if (member) {
				currentProjectMember = { userId: authContext.user.id, projectId: data.selectedProject.id, role: member.role };
			}
		}
		appState = {
			loadState: "ready",
			authMessage: apiClient.getAuthStatus().message,
			authContext: authContext ? { ...authContext, currentProjectMember } : undefined,
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

function getProjectIdFromUrl(): number | undefined {
	const value = new URLSearchParams(window.location.search).get("projectId");
	if (!value) return undefined;
	const numeric = Number(value);
	return Number.isFinite(numeric) ? numeric : undefined;
}
