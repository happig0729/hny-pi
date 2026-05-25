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
	reportAgentPrompt?: string;
	reportToolName?: string;
	reportToolParams?: string;
	entityForm?: EntityFormState;
	visualization?: VisualizationState;
	pinDialog?: PinDialogState;
	pinnedReports?: import("./pinned-store.js").PinnedReport[];
	pinnedPanelOpen?: boolean;
}

export interface VisualizationState {
	title: string;
	chartHtml: string;
}

export interface PinDialogState {
	name: string;
	description: string;
	category: string;
	visibility: "personal" | "public";
	saving: boolean;
	error?: string;
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
export let compilationFormData: Record<string, string | null> = {};
export let selectedCompilationId: number | undefined;

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
	const snapshot = getArchiveAgentSnapshot();
	const ctx = snapshot.lifecycleContext;
	const metricsBlock = snapshot.metrics.length > 0
		? snapshot.metrics.map((m) => `  - ${m.label}：${m.value}（${m.description}）`).join("\n")
		: "  （暂无指标数据）";
	const issuesBlock = snapshot.issues.length > 0
		? snapshot.issues.map((i) => `  - ${i.title}（${i.objectType} ${i.objectId}）：${i.description}${i.suggestedAction ? " → 建议：" + i.suggestedAction : ""}`).join("\n")
		: "  （暂无阻塞问题）";
	const proposalBlock = snapshot.actionProposal
		? `  事项：${snapshot.actionProposal.label}\n  确认级别：${snapshot.actionProposal.confirmationLevel}\n  需要角色：${snapshot.actionProposal.requiredRole}\n  副作用：${snapshot.actionProposal.sideEffects.join("、")}`
		: "  （暂无待办建议）";
	const countsBlock = Object.entries(snapshot.counts).map(([k, v]) => `  ${k}：${v}`).join("；");
	return `你是工程档案全生命周期管理系统的生产级业务智能体，不是自由聊天助手。

当前右侧身份：${workspace.agentName}（${workspace.agentKind}）。

【当前页面上下文（系统自动采集）】
- 工作台：${workspace.label}
- 生命周期阶段：${snapshot.lifecycleStage.label}
- 项目：${snapshot.project ? `${snapshot.project.name}（${snapshot.project.code}，状态：${snapshot.project.status}）` : "未选择项目"}
- 认证状态：${snapshot.auth.authenticated ? "已认证" : snapshot.auth.message}
- 数据加载：${snapshot.loadState}
- 本体推导上下文：${ctx}
- 关键指标：
${metricsBlock}
- 阻塞与问题：
${issuesBlock}
- 下一步办理建议：
${proposalBlock}
- 数据统计：${countsBlock}
【上下文结束】

工作原则：
- 上述【当前页面上下文】由系统在每次页面切换和数据刷新时自动采集并注入，你可直接引用，无需再调用 archive_context 获取基础上下文。
- 需要补充读取后端数据时，只能通过 archive_api_read 读取后端只读接口。
- 不要声称已经创建、更新、审核、签章、归档或删除任何对象；当前工具层不开放写操作。
- 对高风险动作只给出"办理草案、业务依据、影响对象、确认条件、阻塞项"，等待人工确认。
- 如果数据不足，明确指出缺少哪些后端业务数据或可追溯依据，不要编造。

输出要求：
- 优先给出结论，再给证据。
- 使用工程档案业务语言：项目、单位工程、目录节点、资料、文件著录、编制、审核、签章、预检、归档包、采集。
- 每个建议应说明关联对象、依据、下一步动作和是否需要人工确认。

工具使用边界（严格遵守）：
- generate_report：输出在页面 main 区域展示，用于报表、报告类请求。
- create_entity：输出以弹窗形式展示，用于创建/新建实体时生成表单。
- visualize_data：输出以弹窗形式展示，用于查询结果的图表可视化。
- run_pinned_report：一键运行已固化的报表功能，通过 ID 指定。当用户说"运行xx报表"、"打开xx功能"且名称匹配已固化功能时使用。
- 普通对话回复（非上述工具）：直接在聊天面板展示，不触发任何弹窗或 main 区域替换。
- 同一条回复中，上述展示类工具只能选择其中一种调用，禁止同时调用多个展示类工具。

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
- 工具调用后系统会弹出表单供用户填写，不需要在聊天中输出表单内容。

查询结果展示判断（每次查询回复后必须执行）：
当通过 archive_context 或 archive_api_read 获取数据后，按以下流程决定展示方式：

步骤一：判断查询类型
- 数值统计类：涉及数量、面积、百分比、金额、计数等数值 → 适合图表
- 对比分析类：涉及多对象对比、排名、分组 → 适合图表或结构化表格
- 趋势分析类：涉及时间变化、进度变化 → 适合折线图
- 分布占比类：涉及比例、占比、分布 → 适合饼图
- 详情查看类：查看单个对象的具体信息 → 聊天文字即可
- 状态确认类：确认某个对象的状态 → 聊天文字即可

步骤二：判断展示方式
如果查询结果满足以下任一条件，必须调用 visualize_data 工具用弹窗展示：
  1. 包含3条及以上的数值型数据记录
  2. 包含多个对象的对比/排名数据
  3. 包含占比或分布比例数据
  4. 包含时间序列或趋势数据
  5. 包含完成率/进度等指标数据
  6. 文字描述超过300字且包含大量数据

如果不满足以上条件，直接在聊天中以文字回复即可。

步骤三：选择图表类型
  - 多条数值记录 → bar（柱状图）或 line（折线图）
  - 占比/比例 → pie（饼图）
  - 多维度对比 → bar 或 radar（雷达图）
  - 趋势变化 → line 或面积图
  - 完成率/进度 → gauge（仪表盘）

ECharts option 配置要求：
  1. 推荐配色：['#1f7a55','#2d65b8','#a76812','#b84035','#0d6f73','#7c5cbf']
  2. 必须包含完整的 xAxis/yAxis/series 或 series（饼图）
  3. 文字标签使用中文，字号不小于12px
  4. 图表不应过度复杂，优先保证信息清晰可读
不要在聊天文本中输出 ECharts 配置代码或大量原始数据。`;
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

export function setVisualization(state: VisualizationState | undefined): void {
	appState = { ...appState, visualization: state };
	onStateChanged?.();
}

export function setCompilationFormData(data: Record<string, string | null>): void {
	compilationFormData = data;
	onStateChanged?.();
}

export function setSelectedCompilationId(id: number | undefined): void {
	selectedCompilationId = id;
	onStateChanged?.();
}

export function setReportMeta(agentPrompt: string, toolName: string, toolParams: string): void {
	appState = { ...appState, reportAgentPrompt: agentPrompt, reportToolName: toolName, reportToolParams: toolParams };
	onStateChanged?.();
}

export function setPinDialog(state: PinDialogState | undefined): void {
	appState = { ...appState, pinDialog: state };
	onStateChanged?.();
}

export function setPinnedReports(reports: import("./pinned-store.js").PinnedReport[]): void {
	appState = { ...appState, pinnedReports: reports };
	onStateChanged?.();
}

export function setPinnedPanelOpen(open: boolean): void {
	appState = { ...appState, pinnedPanelOpen: open };
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
