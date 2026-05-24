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
import type { ArchiveDashboardData } from "./archive-api.js";
import { createApiClient, loadArchiveDashboardData } from "./archive-api.js";
import { analyzeArchiveWorkspace, analyzeEmptyWorkspace, type ArchiveOntologyAnalysis } from "./archive-ontology-analysis.js";
import { loadConfig } from "./config.js";
import { getWorkspace, type WorkspaceId } from "./workspace-definitions.js";

type LoadState = "loading" | "ready" | "error";

export interface AppState {
	loadState: LoadState;
	authMessage?: string;
	error?: string;
	data?: ArchiveDashboardData;
	reportHtml?: string;
	reportLoading?: boolean;
	entityForm?: EntityFormState;
}

export interface FormField {
	name: string;
	label: string;
	type: "text" | "number" | "date" | "select" | "textarea";
	required: boolean;
	placeholder?: string;
	options?: string[];
	value?: string;
	error?: string;
}

export interface EntityFormState {
	entityType: string;
	entityLabel: string;
	operationId: string;
	fields: FormField[];
	submitting: boolean;
	submitted: boolean;
	submitError?: string;
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
	return analyzeArchiveWorkspace(activeWorkspaceId, requireData());
}

export function getArchiveAgentSnapshot() {
	const workspace = getWorkspace(activeWorkspaceId);
	const data = appState.data;
	const analysis = data ? analyzeArchiveWorkspace(activeWorkspaceId, data) : analyzeEmptyWorkspace(activeWorkspaceId);

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
	};
}

export function buildArchiveAgentSystemPrompt(): string {
	const workspace = getWorkspace(activeWorkspaceId);
	return `你是工程档案全生命周期管理系统的生产级业务智能体，不是自由聊天助手。

当前右侧身份：${workspace.agentName}（${workspace.agentKind}）。

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
- 每个建议应说明关联对象、依据、下一步动作和是否需要人工确认。

报表生成能力：
- 当用户请求涉及"报表"、"报告"、"统计图表"、"数据可视化"、"汇总"、"汇总表"、"分析报告"等语义时，判定为报表生成请求。
- 生成报表时，必须调用 generate_report 工具，将报表标题和 HTML 内容传入工具参数。
- HTML 格式要求：
  1. 只能使用 <div> 标签及其内部内容，不得包含 <!DOCTYPE html>、<html>、<head>、<body> 等文档结构标签
  2. 可以使用内联 style 属性进行样式设置
  3. 可以使用 <table>、<tr>、<td>、<th>、<span>、<strong>、<em>、<h1>~<h6>、<p>、<ul>、<ol>、<li>、<svg>、<canvas> 等 HTML 标签
  4. 报表内容应完整、美观、专业，包含标题、数据表格或图表、摘要说明
- 不要在聊天文本中直接输出 HTML 代码，所有 HTML 内容必须通过 generate_report 工具提交。

实体创建能力：
- 当用户请求涉及"创建"、"新建"、"添加"、"新增"等语义，且目标为本体中定义的业务对象（项目、单位工程、文档、上传文件、编制实例等）时，判定为实体创建请求。
- 必须调用 create_entity 工具，传入实体类型、中文名称、对应 API operationId 和表单字段定义。
- 字段定义必须严格遵从本体模型中的对象属性定义，包括字段名、类型、是否必填。
- 只有本体模型中明确定义为 enum 类型的字段才使用 select 类型并给出 options；其他字段一律使用 text 类型，不要自行编造下拉选项。
- 工具会自动从后端字典（listDictionaries）和已有数据中获取有效选项来填充 select 字段，Agent 只需指定字段名和类型即可。
- 本体模型中明确为 enum 的字段（Agent 可直接使用这些选项）：
  * Project.status: active, project_archive
  * Document.type: online, uploaded
  * Document.status: draft, under_review, approved, rejected
  * UploadFile.status: pending, signing, signed, collected, returned
  * CompilationInstance.status: drafting, completed, signing, signed, collected
  * ProjectMember.role: project_admin, data_admin, data_clerk
  * User.role: super_admin, tenant_admin, system_admin, tenant_user
  * Enterprise.type: building, construction, supervision, design, survey
- 常见实体创建的 operationId 和字段参考：
  * 创建项目 → createProject：必填 name(项目名称,text)、type(项目类型,text)、buildingUnit(建设单位,text)；选填 code、constructionUnit、supervisionUnit、designUnit、location、startDate(date)、endDate(date)、totalArea(number)、description(textarea)
  * 创建单位工程 → createUnit：必填 name(名称,text)；选填 engType(工程类型,text)、structureType(结构类型,text)、floors(层数,number)、buildingArea(建筑面积,number)
  * 创建文档 → createDocument：必填 title(标题,text)、type(类型,text)；选填 code、category、subCategory
  * 创建编制实例 → createCompilationInstance：必填 name(名称,text)；选填 itemId(text)、unitId(number)
- 工具调用后系统会弹出表单供用户填写，不需要在聊天中输出表单内容。`;
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

export function setReportHtml(html: string | undefined): void {
	appState = { ...appState, reportHtml: html, reportLoading: false };
	onStateChanged?.();
}

export function setReportLoading(loading: boolean): void {
	appState = { ...appState, reportLoading: loading };
	onStateChanged?.();
}

export function setEntityForm(form: EntityFormState | undefined): void {
	appState = { ...appState, entityForm: form };
	onStateChanged?.();
}

export function updateEntityForm(fields: FormField[]): void {
	if (!appState.entityForm) return;
	appState = { ...appState, entityForm: { ...appState.entityForm, fields } };
	onStateChanged?.();
}

export function updateEntityFormSubmitting(submitting: boolean, submitted: boolean, submitError?: string): void {
	if (!appState.entityForm) return;
	appState = { ...appState, entityForm: { ...appState.entityForm, submitting, submitted, submitError } };
	onStateChanged?.();
}

export async function refreshData(): Promise<void> {
	appState = { loadState: "loading", authMessage: apiClient.getAuthStatus().message };
	onStateChanged?.();
	try {
		await apiClient.login();
		const projectId = getProjectIdFromUrl();
		const data = await loadArchiveDashboardData(apiClient, projectId);
		appState = { loadState: "ready", authMessage: apiClient.getAuthStatus().message, data };
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
