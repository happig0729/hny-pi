import { Agent } from "@earendil-works/pi-agent-core";
import { getModel } from "@earendil-works/pi-ai";
import {
	ApiKeyPromptDialog,
	AppStorage,
	ChatPanel,
	CustomProvidersStore,
	IndexedDBStorageBackend,
	ProviderKeysStore,
	SessionsStore,
	SettingsStore,
	setAppStorage,
} from "@earendil-works/pi-web-ui";
import { html, render, type TemplateResult } from "lit";
import { createIcons, icons } from "lucide";
import {
	type ArchiveAgentSnapshot,
	createArchiveApiReadTool,
	createArchiveContextTool,
} from "./archive-agent-tools.js";
import {
	type ArchiveDashboardData,
	type ArchivePackageRecord,
	type CollectionItemRecord,
	createApiClient,
	type DocumentRecord,
	type PrecheckRecord,
	type Project,
	type ReviewRecord,
	type SigningTaskRecord,
	type Unit,
	type UploadFileRecord,
	loadArchiveDashboardData,
} from "./archive-api.js";
import { loadConfig } from "./config.js";
import {
	type ActionPolicy,
	type EvidenceRef,
	type LifecycleInferenceContext,
	type LifecycleStage,
	ontologyManifest,
	ontologyRuntime,
} from "./ontology-runtime.js";
import { getWorkspace, lifecycleStageOrder, type WorkspaceId, workspaces } from "./workspace-definitions.js";
import "./app.css";

type LoadState = "loading" | "ready" | "error";
type Tone = "green" | "blue" | "amber" | "red";
type IssueSeverity = "info" | "warning" | "blocking";
type AgentPanelTab = "suggestions" | "evidence" | "actions";

interface MetricView {
	label: string;
	value: string;
	description: string;
	tone: Tone;
}

interface IssueView {
	title: string;
	description: string;
	severity: IssueSeverity;
	objectType: string;
	objectId: string;
	suggestedAction?: string;
}

interface ActionProposalView {
	actionType: string;
	operationId?: string;
	label: string;
	confirmationLevel: ActionPolicy["confirmationLevel"];
	requiredRole: string;
	requiredProjectRole?: string;
	sideEffects: string[];
	evidenceCount: number;
	canExecute: boolean;
}

interface AppState {
	loadState: LoadState;
	authMessage?: string;
	error?: string;
	data?: ArchiveDashboardData;
}

const config = loadConfig();
const apiClient = createApiClient(config);
let activeWorkspaceId: WorkspaceId = "cockpit";
let activeAgentPanelTab: AgentPanelTab = "suggestions";
let appState: AppState = { loadState: "loading" };
let archiveAgent: Agent | undefined;
let chatPanel: ChatPanel | undefined;
let agentUnsubscribe: (() => void) | undefined;

const settings = new SettingsStore();
const providerKeys = new ProviderKeysStore();
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
const storage = new AppStorage(settings, providerKeys, sessions, customProviders, backend);
setAppStorage(storage);

const icon = (name: string): TemplateResult => html`<i data-lucide=${name}></i>`;

function issueTone(severity: IssueSeverity): Tone {
	if (severity === "blocking") return "red";
	if (severity === "warning") return "amber";
	return "blue";
}

function stageState(stage: LifecycleStage, currentStage: LifecycleStage): string {
	const currentIndex = lifecycleStageOrder.indexOf(currentStage);
	const stageIndex = lifecycleStageOrder.indexOf(stage);
	if (stageIndex < currentIndex) return "done";
	if (stageIndex === currentIndex) return "current";
	return "";
}

function renderTopbar(): TemplateResult {
	const project = appState.data?.selectedProject;
	return html`
		<header class="topbar">
			<div class="brand">
				<div class="brand-mark">${icon("archive")}</div>
				<span>Archive AI OS</span>
			</div>
			<div class="project-switcher">
				${icon("building-2")}
				<strong>${project?.name ?? "未选择项目"}</strong>
				<span class="badge ${project?.status === "project_archive" ? "green" : "amber"}">${project?.status ?? "无项目"}</span>
			</div>
			<div class="search">
				${icon("search")}
				<span>搜索项目、文件、目录节点、审核意见、签章任务</span>
			</div>
			<div class="top-actions">
				<button class="icon-btn" title="刷新" @click=${() => void refreshData()}>${icon("refresh-cw")}</button>
				<button class="icon-btn" title="审计">${icon("shield-check")}</button>
				<button class="icon-btn" title="设置">${icon("settings")}</button>
			</div>
		</header>
	`;
}

function renderSidebar(): TemplateResult {
	return html`
		<nav class="sidebar">
			<div class="nav-label">生命周期工作台</div>
			${workspaces
				.filter((workspace) => workspace.id !== "governance")
				.map(
					(workspace) => html`
						<button
							class="nav-btn ${workspace.id === activeWorkspaceId ? "active" : ""}"
							@click=${() => setActiveWorkspace(workspace.id)}
						>
							${icon(workspace.icon)}
							<span>${workspace.label}</span>
						</button>
					`,
				)}
			<div class="nav-label">治理</div>
			${workspaces
				.filter((workspace) => workspace.id === "governance")
				.map(
					(workspace) => html`
						<button
							class="nav-btn ${workspace.id === activeWorkspaceId ? "active" : ""}"
							@click=${() => setActiveWorkspace(workspace.id)}
						>
							${icon(workspace.icon)}
							<span>${workspace.label}</span>
						</button>
					`,
				)}
		</nav>
	`;
}

function renderLoading(): TemplateResult {
	return html`
		<main class="main">
			<div class="card pad">
				<div class="agent-card-title">${icon("loader-circle")} 正在加载真实后端数据</div>
				<div class="sub">正在登录并调用项目、文件、审核、签章、预检、归档接口。</div>
			</div>
		</main>
	`;
}

function renderError(): TemplateResult {
	return html`
		<main class="main">
			<div class="card pad">
				<div class="agent-card-title">${icon("triangle-alert")} 数据加载失败</div>
				<div class="sub">${appState.error ?? "未知错误"}</div>
				${appState.authMessage ? html`<div class="sub">认证状态：${appState.authMessage}</div>` : ""}
				<div style="margin-top: 12px">
					<button class="btn primary" @click=${() => void refreshData()}>${icon("refresh-cw")} 重试</button>
				</div>
			</div>
		</main>
	`;
}

function renderMetrics(): TemplateResult {
	const data = requireData();
	const metrics = getMetrics(activeWorkspaceId, data);
	return html`
		<div class="grid cols-3">
			${metrics.map(
				(metric) => html`
					<div class="card pad metric">
						<div class="metric-top">
							<span>${metric.label}</span>
							${icon(metric.tone === "red" ? "triangle-alert" : metric.tone === "blue" ? "sparkles" : "chart-no-axes-column")}
						</div>
						<div class="metric-value">${metric.value}</div>
						<div class="sub">${metric.description}</div>
					</div>
				`,
			)}
		</div>
	`;
}

function renderLifecycle(): TemplateResult {
	const data = requireData();
	const currentStage = getCurrentLifecycleStage(data);
	return html`
		<div class="section">
			<div class="section-head">
				<h2>生命周期阶段</h2>
				<span class="badge blue">当前：${ontologyManifest.lifecycle.stages.find((stage) => stage.id === currentStage)?.label}</span>
			</div>
			<div class="timeline">
				${ontologyManifest.lifecycle.stages.map(
					(stage) => html`
						<div class="stage ${stageState(stage.id, currentStage)}">
							<strong>${stage.label}</strong>
							<span>${stage.description}</span>
						</div>
					`,
				)}
			</div>
		</div>
	`;
}

function renderIssueTable(): TemplateResult {
	const issues = getIssues(activeWorkspaceId, requireData());
	return html`
		<div class="card">
			<div class="section-head" style="padding: 14px 14px 0">
				<h2>阻塞与建议</h2>
				<span class="badge ${issues.some((issue) => issue.severity === "blocking") ? "red" : "blue"}">${issues.length} 项</span>
			</div>
			${issues.length === 0
				? renderEmptyState("当前接口数据未发现阻塞项")
				: html`
					<table class="table" style="border: 0; border-radius: 0; margin-top: 8px">
						<tr>
							<th>问题</th>
							<th>影响对象</th>
							<th>建议</th>
						</tr>
						${issues.map(
							(issue) => html`
								<tr>
									<td>
										<strong>${issue.title}</strong>
										<div class="sub">${issue.description}</div>
									</td>
									<td>
										<span class="badge ${issueTone(issue.severity)}">${issue.objectType}</span>
										<div class="sub">${issue.objectId}</div>
									</td>
									<td>${issue.suggestedAction ? html`<span class="badge blue">${issue.suggestedAction}</span>` : "待分析"}</td>
								</tr>
							`,
						)}
					</table>
				`}
		</div>
	`;
}

function renderActionProposal(): TemplateResult {
	const workspace = getWorkspace(activeWorkspaceId);
	const proposal = buildActionProposal(workspace.actionType, getEvidenceRefs(activeWorkspaceId, requireData()).length);
	return html`
		<div class="card pad">
			<div class="section-head">
				<h2>Action Proposal</h2>
				<span class="badge ${proposal.canExecute ? "green" : "red"}">${proposal.canExecute ? "可执行草案" : "权限不足"}</span>
			</div>
			<div class="action-proposal">
				<div class="agent-card-title">${icon("workflow")} ${proposal.label}</div>
				<dl class="kv">
					<dt>Action Type</dt>
					<dd>${proposal.actionType}</dd>
					<dt>operationId</dt>
					<dd>${proposal.operationId ?? "未绑定"}</dd>
					<dt>确认等级</dt>
					<dd>${proposal.confirmationLevel}</dd>
					<dt>所需角色</dt>
					<dd>${proposal.requiredProjectRole ?? proposal.requiredRole}</dd>
					<dt>证据数量</dt>
					<dd>${proposal.evidenceCount}</dd>
				</dl>
				<div class="sub">副作用：${proposal.sideEffects.join("、")}</div>
				<div style="margin-top: 12px">
					<button class="btn primary">${icon("check")} 确认草案</button>
					<button class="btn">${icon("eye")} 查看证据</button>
				</div>
			</div>
		</div>
	`;
}

function renderGenericWorkspace(): TemplateResult {
	return html`
		${renderMetrics()}
		${renderLifecycle()}
		<div class="section grid cols-2">
			${renderIssueTable()}
			${renderActionProposal()}
		</div>
	`;
}

function renderIntakeWorkspace(): TemplateResult {
	const uploads = requireData().uploads;
	return html`
		${renderMetrics()}
		<div class="section split">
			<div class="card tree">
				<h2 style="padding: 4px 8px 10px">后端返回目录节点</h2>
				${renderUploadNodeTree(uploads)}
			</div>
			<div class="card">
				${uploads.length === 0
					? renderEmptyState("当前项目暂无上传文件")
					: html`
						<table class="table">
							<tr>
								<th>文件</th>
								<th>目录节点</th>
								<th>著录字段</th>
								<th>状态</th>
								<th>时间</th>
							</tr>
							${uploads.map(
								(file) => html`
									<tr>
										<td><strong>${file.title || file.fileName}</strong><div class="sub">${file.mimeType ?? file.fileType ?? "未知类型"} · ${formatFileSize(file.fileSize)}</div></td>
										<td>${file.nodeLabel || file.nodeId || "未著录"}</td>
										<td>${[file.compiler, file.compileDate, file.responsible].filter(Boolean).join(" / ") || "未补齐"}</td>
										<td><span class="badge ${file.status === "returned" ? "red" : file.status === "pending" ? "amber" : "green"}">${file.status}</span></td>
										<td>${formatDate(file.updatedAt ?? file.uploadedAt)}</td>
									</tr>
								`,
							)}
						</table>
					`}
			</div>
		</div>
		<div class="section grid cols-2">
			${renderIssueTable()}
			${renderActionProposal()}
		</div>
	`;
}

function renderCompileWorkspace(): TemplateResult {
	const data = requireData();
	return html`
		${renderMetrics()}
		<div class="section grid cols-2">
			<div class="card">
				<div class="section-head" style="padding: 14px 14px 0">
					<h2>编制实例</h2>
					<span class="badge blue">${data.compilations.length} 条</span>
				</div>
				${renderCompilationTable(data.compilations)}
			</div>
			<div class="card">
				<div class="section-head" style="padding: 14px 14px 0">
					<h2>在线资料</h2>
					<span class="badge blue">${data.documents.filter((document) => document.type === "online").length} 条</span>
				</div>
				${renderDocumentTable(data.documents.filter((document) => document.type === "online"))}
			</div>
		</div>
		<div class="section">${renderActionProposal()}</div>
	`;
}

function renderReviewWorkspace(): TemplateResult {
	const reviews = requireData().reviews;
	return html`
		${renderMetrics()}
		<div class="section grid cols-2">
			<div class="card">
				<div class="section-head" style="padding: 14px 14px 0">
					<h2>待审核任务</h2>
					<span class="badge amber">${reviews.length} 条</span>
				</div>
				${reviews.length === 0
					? renderEmptyState("当前没有待审核任务")
					: html`
						<table class="table" style="border: 0; border-radius: 0; margin-top: 8px">
							<tr>
								<th>资料</th>
								<th>审核人</th>
								<th>提交人</th>
								<th>状态</th>
							</tr>
							${reviews.map(
								(review) => html`
									<tr>
										<td><strong>${review.documentTitle ?? `Document #${review.documentId}`}</strong><div class="sub">${formatDate(review.createdAt)}</div></td>
										<td>${review.assignedToName ?? "-"}</td>
										<td>${review.submittedByName ?? "-"}</td>
										<td><span class="badge ${review.status === "pending" ? "amber" : review.status === "rejected" ? "red" : "green"}">${review.status}</span></td>
									</tr>
								`,
							)}
						</table>
					`}
			</div>
			${renderIssueTable()}
		</div>
		<div class="section">${renderActionProposal()}</div>
	`;
}

function renderSigningWorkspace(): TemplateResult {
	const tasks = requireData().signingTasks;
	return html`
		${renderMetrics()}
		<div class="section grid cols-2">
			<div class="card">
				<div class="section-head" style="padding: 14px 14px 0">
					<h2>签章任务</h2>
					<span class="badge amber">${tasks.length} 条</span>
				</div>
				${tasks.length === 0
					? renderEmptyState("当前项目暂无签章任务")
					: html`
						<table class="table" style="border: 0; border-radius: 0; margin-top: 8px">
							<tr>
								<th>任务</th>
								<th>流程</th>
								<th>状态</th>
								<th>更新时间</th>
							</tr>
							${tasks.map(
								(task) => html`
									<tr>
										<td><strong>${task.docName ?? task.documentTitle ?? `SigningTask #${task.id ?? "-"}`}</strong></td>
										<td>${task.flowMode ?? "-"}</td>
										<td><span class="badge ${task.status === "completed" ? "green" : task.status === "rejected" ? "red" : "amber"}">${task.status ?? "unknown"}</span></td>
										<td>${formatDate(task.updatedAt ?? task.createdAt)}</td>
									</tr>
								`,
							)}
						</table>
					`}
			</div>
			${renderActionProposal()}
		</div>
	`;
}

function renderArchiveWorkspace(): TemplateResult {
	const data = requireData();
	const precheck = data.latestPrecheck;
	const totalChecks = precheck?.totalChecks ?? 0;
	const passedChecks = precheck?.passedChecks ?? 0;
	const ratio = totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 0;
	return html`
		${renderMetrics()}
		<div class="section precheck-grid">
			<div class="card pad">
				<div class="section-head">
					<h2>最新预检结果</h2>
					<span class="badge ${precheck?.status === "passed" ? "green" : precheck ? "red" : "blue"}">${precheck?.status ?? "无预检"}</span>
				</div>
				<div class="ring" style=${`--precheck-ratio: ${ratio}%`}><div class="ring-inner">${ratio}%</div></div>
				<div class="grid cols-3">
					<div class="metric"><div class="metric-value">${passedChecks}</div><div class="sub">通过项</div></div>
					<div class="metric"><div class="metric-value">${precheck?.warningCount ?? 0}</div><div class="sub">警告项</div></div>
					<div class="metric"><div class="metric-value">${precheck?.errorCount ?? 0}</div><div class="sub">阻断项</div></div>
				</div>
			</div>
			${renderIssueTable()}
		</div>
		<div class="section grid cols-2">
			${renderArchivePackageTable(data.archivePackages)}
			${renderCollectionTable(data.collectionItems)}
		</div>
		<div class="section">${renderActionProposal()}</div>
	`;
}

function renderGovernanceWorkspace(): TemplateResult {
	const data = requireData();
	return html`
		${renderMetrics()}
		<div class="section grid cols-2">
			<div class="card pad">
				<div class="section-head">
					<h2>接口加载状态</h2>
					<span class="badge ${data.errors.length === 0 ? "green" : "amber"}">${data.errors.length === 0 ? "全部可用" : `${data.errors.length} 个接口异常`}</span>
				</div>
				${data.errors.length === 0
					? html`<div class="sub">当前工作台数据全部来自后端接口，没有使用模拟业务数据。</div>`
					: html`<ul class="agent-list">${data.errors.map((error) => html`<li>${error}</li>`)}</ul>`}
			</div>
			<div class="card pad">
				<div class="section-head">
					<h2>Ontology Runtime 验证</h2>
					<span class="badge blue">00 已接入</span>
				</div>
				<dl class="kv">
					<dt>Object Types</dt>
					<dd>${Object.keys(ontologyManifest.objectTypes).length}</dd>
					<dt>Action Types</dt>
					<dd>${Object.keys(ontologyManifest.actionTypes).length}</dd>
					<dt>Policies</dt>
					<dd>${Object.keys(ontologyManifest.policies).length}</dd>
					<dt>UploadFile Links</dt>
					<dd>${ontologyRuntime.getLinksForObject("UploadFile").length}</dd>
				</dl>
			</div>
		</div>
	`;
}

function renderMain(): TemplateResult {
	if (appState.loadState === "loading") return renderLoading();
	if (appState.loadState === "error") return renderError();

	const workspace = getWorkspace(activeWorkspaceId);
	return html`
		<main class="main">
			<section>
				<div class="page-head">
					<div>
						<div class="eyebrow">${workspace.eyebrow}</div>
						<h1>${workspace.title}</h1>
						<div class="sub">${workspace.subtitle}</div>
					</div>
					<div>
						<button class="btn" @click=${() => void refreshData()}>${icon("refresh-cw")} 刷新</button>
						<button class="btn primary">${icon("play-circle")} 生成动作草案</button>
					</div>
				</div>
				${renderWorkspaceBody()}
			</section>
		</main>
	`;
}

function renderWorkspaceBody(): TemplateResult {
	if (activeWorkspaceId === "intake") return renderIntakeWorkspace();
	if (activeWorkspaceId === "compile") return renderCompileWorkspace();
	if (activeWorkspaceId === "review") return renderReviewWorkspace();
	if (activeWorkspaceId === "signing") return renderSigningWorkspace();
	if (activeWorkspaceId === "archive") return renderArchiveWorkspace();
	if (activeWorkspaceId === "governance") return renderGovernanceWorkspace();
	return renderGenericWorkspace();
}

async function setupArchiveAgent(): Promise<void> {
	if (agentUnsubscribe) {
		agentUnsubscribe();
		agentUnsubscribe = undefined;
	}
	if (config.apiKeys.deepseek) {
		await providerKeys.set("deepseek", config.apiKeys.deepseek);
	}

	archiveAgent = new Agent({
		initialState: {
			systemPrompt: buildArchiveAgentSystemPrompt(),
			model: getModel("deepseek", "deepseek-v4-flash"),
			thinkingLevel: "off",
			messages: [],
			tools: [],
		},
	});
	chatPanel = new ChatPanel();
	agentUnsubscribe = archiveAgent.subscribe(() => renderApp());
	await chatPanel.setAgent(archiveAgent, {
		onApiKeyRequired: async (provider: string) => ApiKeyPromptDialog.prompt(provider),
		onBeforeSend: () => {
			if (archiveAgent) archiveAgent.state.systemPrompt = buildArchiveAgentSystemPrompt();
		},
		toolsFactory: () => [createArchiveContextTool(getArchiveAgentSnapshot), createArchiveApiReadTool(apiClient)],
	});
	renderApp();
}

function buildArchiveAgentSystemPrompt(): string {
	const workspace = getWorkspace(activeWorkspaceId);
	return `你是工程档案全生命周期管理系统的生产级业务 Agent，不是自由聊天助手。

当前右侧身份：${workspace.agentName}（${workspace.agentKind}）。

工作原则：
- 回答必须围绕真实后端数据、当前工作台上下文、Ontology Runtime、EvidenceRef、Action Proposal。
- 涉及项目、资料、上传文件、审核、签章、预检、归档包、采集项时，先调用 archive_context 获取当前页面上下文。
- 需要补充读取后端数据时，只能调用 archive_api_read 的只读 operationId。
- 不要声称已经创建、更新、审核、签章、归档或删除任何对象；当前工具层不开放写操作。
- 对高风险动作只给出“动作草案、证据、影响对象、确认条件、阻塞项”，等待人确认。
- 如果数据不足，明确指出缺少哪个接口数据或 EvidenceRef，不要编造。

输出要求：
- 优先给出结论，再给证据。
- 使用工程档案业务语言：项目、单位工程、目录节点、资料、文件著录、编制、审核、签章、预检、归档包、采集。
- 每个建议应说明关联对象、依据、下一步动作和是否需要人工确认。`;
}

function getArchiveAgentSnapshot(): ArchiveAgentSnapshot {
	const workspace = getWorkspace(activeWorkspaceId);
	const data = appState.data;
	const currentStage = data ? getCurrentLifecycleStage(data) : workspace.emptyLifecycleContext.projectStatus === "project_archive" ? "archived" : "setup";
	const stageLabel = ontologyManifest.lifecycle.stages.find((stage) => stage.id === currentStage)?.label ?? currentStage;
	const evidenceRefs = data ? getEvidenceRefs(activeWorkspaceId, data) : [];
	const actionProposal = buildActionProposal(workspace.actionType, evidenceRefs.length);

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
			id: currentStage,
			label: stageLabel,
		},
		loadState: appState.loadState,
		auth: apiClient.getAuthStatus(),
		metrics: data ? getMetrics(activeWorkspaceId, data) : [],
		issues: data ? getIssues(activeWorkspaceId, data) : [],
		evidenceRefs,
		actionProposal,
		counts: {
			projects: data?.projects.length ?? 0,
			units: data?.units.length ?? 0,
			documents: data?.documents.length ?? 0,
			uploads: data?.uploads.length ?? 0,
			compilations: data?.compilations.length ?? 0,
			reviews: data?.reviews.length ?? 0,
			signingTasks: data?.signingTasks.length ?? 0,
			archivePackages: data?.archivePackages.length ?? 0,
			collectionItems: data?.collectionItems.length ?? 0,
			apiErrors: data?.errors.length ?? 0,
		},
		apiErrors: data?.errors ?? [],
	};
}

function renderAgentTabs(): TemplateResult {
	return html`
		<div class="agent-tabs">
			<button class="agent-tab ${activeAgentPanelTab === "suggestions" ? "active" : ""}" @click=${() => setActiveAgentPanelTab("suggestions")}>建议</button>
			<button class="agent-tab ${activeAgentPanelTab === "evidence" ? "active" : ""}" @click=${() => setActiveAgentPanelTab("evidence")}>证据</button>
			<button class="agent-tab ${activeAgentPanelTab === "actions" ? "active" : ""}" @click=${() => setActiveAgentPanelTab("actions")}>动作</button>
		</div>
	`;
}

function renderAgentWorkbench(workspaceId: WorkspaceId, data?: ArchiveDashboardData): TemplateResult {
	if (!data) {
		return html`
			<div class="agent-workbench">
				<div class="agent-card important">
					<div class="agent-card-title">${icon("loader-circle")} 等待真实后端数据</div>
					<div class="sub">Agent 已初始化，业务建议、证据和动作会在接口数据加载后生成。</div>
				</div>
			</div>
		`;
	}
	if (activeAgentPanelTab === "evidence") return renderAgentEvidenceTab(workspaceId, data);
	if (activeAgentPanelTab === "actions") return renderAgentActionsTab(workspaceId, data);
	return renderAgentSuggestionsTab(workspaceId, data);
}

function renderAgentSuggestionsTab(workspaceId: WorkspaceId, data: ArchiveDashboardData): TemplateResult {
	const workspace = getWorkspace(workspaceId);
	const issues = getIssues(workspaceId, data);
	const metrics = getMetrics(workspaceId, data);
	const currentStage = getCurrentLifecycleStage(data);
	const stageLabel = ontologyManifest.lifecycle.stages.find((stage) => stage.id === currentStage)?.label ?? currentStage;
	return html`
		<div class="agent-workbench">
			<div class="agent-mini-metrics">
				${metrics.slice(0, 3).map(
					(metric) => html`
						<div class="agent-mini-metric">
							<span>${metric.label}</span>
							<strong>${metric.value}</strong>
						</div>
					`,
				)}
			</div>
			<div class="agent-card important">
				<div class="agent-card-title">${icon("sparkles")} 当前上下文判断</div>
				<ul class="agent-list">
					<li>生命周期阶段：${stageLabel}。</li>
					<li>API：${data.errors.length === 0 ? "已加载" : `${data.errors.length} 个异常`}。</li>
				</ul>
			</div>
			<div class="agent-card">
				<div class="agent-card-title">${icon("triangle-alert")} 建议处理项</div>
				${issues.length === 0
					? html`<div class="sub">当前工作台未发现阻塞项。可继续询问 Agent 检查归档条件或生成动作草案。</div>`
					: html`
						<div class="agent-items">
							${issues.slice(0, 2).map(
								(issue) => html`
									<div class="agent-item">
										<div>
											<strong>${issue.title}</strong>
											<span>${issue.description}</span>
										</div>
					<div class="agent-item-meta">
						<span class="badge ${issueTone(issue.severity)}">${issue.objectType}</span>
					</div>
				</div>
			`,
							)}
						</div>
					`}
			</div>
		</div>
	`;
}

function renderAgentEvidenceTab(workspaceId: WorkspaceId, data: ArchiveDashboardData): TemplateResult {
	const workspace = getWorkspace(workspaceId);
	const evidenceRefs = getEvidenceRefs(workspaceId, data);
	return html`
		<div class="agent-workbench">
			<div class="agent-card compact">
				<div class="agent-card-title">${icon("braces")} Ontology Scope</div>
				<ul class="agent-list">${workspace.ontologyScope.slice(0, 6).map((item) => html`<li>${item}</li>`)}</ul>
			</div>
			<div class="agent-card compact">
				<div class="agent-card-title">${icon("file-search")} EvidenceRef</div>
				${evidenceRefs.length === 0
					? html`<div class="sub">当前后端数据未形成可执行证据。</div>`
					: html`
						<div class="agent-items">
							${evidenceRefs.slice(0, 2).map(
								(evidence) => html`
									<div class="agent-item">
										<div>
											<strong>${evidence.objectType ?? "unknown"} · ${evidence.field ?? evidence.id}</strong>
											<span>${evidence.excerpt ?? evidence.id}</span>
										</div>
										<div class="agent-item-meta">
											<span class="badge blue">${evidence.sourceType}</span>
											<span>${Math.round((evidence.confidence ?? 0) * 100)}%</span>
										</div>
									</div>
								`,
							)}
						</div>
					`}
			</div>
		</div>
	`;
}

function renderAgentActionsTab(workspaceId: WorkspaceId, data: ArchiveDashboardData): TemplateResult {
	const workspace = getWorkspace(workspaceId);
	const evidenceRefs = getEvidenceRefs(workspaceId, data);
	const proposal = buildActionProposal(workspace.actionType, evidenceRefs.length);
	return html`
		<div class="agent-workbench">
			<div class="action-proposal">
				<div class="agent-card-title">${icon("clipboard-list")} Action Proposal</div>
				<div class="agent-action-grid">
					<div><span>Action Type</span><strong>${proposal.actionType}</strong></div>
					<div><span>operationId</span><strong>${proposal.operationId ?? "未绑定"}</strong></div>
					<div><span>确认等级</span><strong>${proposal.confirmationLevel}</strong></div>
					<div><span>所需角色</span><strong>${proposal.requiredProjectRole ?? proposal.requiredRole}</strong></div>
				</div>
			</div>
		</div>
	`;
}

function renderAgentPanel(): TemplateResult {
	const workspace = getWorkspace(activeWorkspaceId);
	const data = appState.data;
	const evidenceRefs = data ? getEvidenceRefs(activeWorkspaceId, data) : [];
	const currentStage = data ? getCurrentLifecycleStage(data) : workspace.emptyLifecycleContext.projectStatus === "project_archive" ? "archived" : "setup";
	const stageLabel = ontologyManifest.lifecycle.stages.find((stage) => stage.id === currentStage)?.label ?? currentStage;
	return html`
		<aside class="agent-panel">
			<div class="agent-head">
				<div class="agent-title">
					<div>
						<div class="eyebrow">${workspace.agentKind}</div>
						<h2>${workspace.agentName}</h2>
					</div>
					<span class="badge ${appState.loadState === "ready" ? "green" : "amber"}">${appState.loadState === "ready" ? "在线" : "等待数据"}</span>
				</div>
				<div class="agent-context">
					<div>阶段：${stageLabel}</div>
					<div>对象：${workspace.primaryObjects.join(" / ")}</div>
					<div>证据：${evidenceRefs.length} 条 EvidenceRef</div>
				</div>
				${renderAgentTabs()}
			</div>
			${renderAgentWorkbench(activeWorkspaceId, data)}
			<div class="agent-chat-shell">
				${chatPanel
					? chatPanel
					: html`
						<div class="agent-loading">
							${icon("loader-circle")}
							<span>正在初始化 Pi Agent</span>
						</div>
					`}
			</div>
		</aside>
	`;
}

function renderApp(): void {
	const app = document.getElementById("app");
	if (!app) throw new Error("App container not found");

	render(
		html`
			<div class="mobile-note">移动端以核心内容栈式展示；桌面端可查看完整三栏工作台。</div>
			<div class="archive-app">
				${renderTopbar()}
				${renderSidebar()}
				${renderMain()}
				${renderAgentPanel()}
			</div>
		`,
		app,
	);

	createIcons({ icons });
}

function setActiveWorkspace(workspaceId: WorkspaceId): void {
	activeWorkspaceId = workspaceId;
	if (archiveAgent) archiveAgent.state.systemPrompt = buildArchiveAgentSystemPrompt();
	renderApp();
}

function setActiveAgentPanelTab(tab: AgentPanelTab): void {
	activeAgentPanelTab = tab;
	renderApp();
}

async function refreshData(): Promise<void> {
	appState = { loadState: "loading", authMessage: apiClient.getAuthStatus().message };
	renderApp();
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
	renderApp();
}

function requireData(): ArchiveDashboardData {
	if (!appState.data) throw new Error("Archive dashboard data is not loaded");
	return appState.data;
}

function getMetrics(workspaceId: WorkspaceId, data: ArchiveDashboardData): MetricView[] {
	const approvedDocuments = data.documents.filter((document) => document.status === "approved").length;
	const pendingUploads = data.uploads.filter((file) => file.status === "pending").length;
	const returnedUploads = data.uploads.filter((file) => file.status === "returned").length;
	const pendingSigningTasks = data.signingTasks.filter((task) => task.status !== "completed").length;
	const latestPrecheck = data.latestPrecheck;

	if (workspaceId === "intake") {
		return [
			{ label: "上传文件", value: String(data.uploads.length), description: "来自 listUploadFiles", tone: "blue" },
			{ label: "待著录", value: String(pendingUploads), description: "status=pending 的上传文件", tone: pendingUploads > 0 ? "amber" : "green" },
			{ label: "退回文件", value: String(returnedUploads), description: "status=returned 的上传文件", tone: returnedUploads > 0 ? "red" : "green" },
		];
	}
	if (workspaceId === "compile") {
		return [
			{ label: "编制实例", value: String(data.compilations.length), description: "来自 listCompilationInstances", tone: "blue" },
			{ label: "在线资料", value: String(data.documents.filter((document) => document.type === "online").length), description: "Document.type=online", tone: "green" },
			{ label: "草稿资料", value: String(data.documents.filter((document) => document.status === "draft").length), description: "Document.status=draft", tone: "amber" },
		];
	}
	if (workspaceId === "review") {
		return [
			{ label: "待审核", value: String(data.reviews.length), description: "来自 listReviews?status=pending", tone: data.reviews.length > 0 ? "amber" : "green" },
			{ label: "已通过资料", value: String(approvedDocuments), description: "Document.status=approved", tone: "green" },
			{ label: "被退回资料", value: String(data.documents.filter((document) => document.status === "rejected").length), description: "Document.status=rejected", tone: "red" },
		];
	}
	if (workspaceId === "signing") {
		return [
			{ label: "签章任务", value: String(data.signingTasks.length), description: "来自 listSigningTasks", tone: "blue" },
			{ label: "未完成", value: String(pendingSigningTasks), description: "status 非 completed", tone: pendingSigningTasks > 0 ? "amber" : "green" },
			{ label: "已完成", value: String(data.signingTasks.length - pendingSigningTasks), description: "status=completed", tone: "green" },
		];
	}
	if (workspaceId === "archive") {
		return [
			{ label: "预检状态", value: latestPrecheck?.status ?? "无", description: "来自 getLatestPrecheck", tone: latestPrecheck?.status === "passed" ? "green" : latestPrecheck ? "red" : "blue" },
			{ label: "归档包", value: String(data.archivePackages.length), description: "来自 listArchivePackages", tone: data.archivePackages.length > 0 ? "green" : "blue" },
			{ label: "采集项", value: String(data.collectionItems.length), description: "来自 listCollectionItems", tone: data.collectionItems.length > 0 ? "green" : "blue" },
		];
	}
	if (workspaceId === "governance") {
		return [
			{ label: "接口异常", value: String(data.errors.length), description: "页面真实接口加载错误数", tone: data.errors.length > 0 ? "amber" : "green" },
			{ label: "Action Policies", value: String(Object.keys(ontologyManifest.policies).length), description: "前端 Ontology Runtime", tone: "blue" },
			{ label: "EvidenceRef", value: String(getEvidenceRefs(activeWorkspaceId, data).length), description: "由后端数据派生", tone: "green" },
		];
	}
	const totalDocuments = data.stats?.totalDocuments ?? data.documents.length;
	const completion = totalDocuments > 0 ? Math.round((approvedDocuments / totalDocuments) * 100) : 0;
	return [
		{ label: "档案完成率", value: `${completion}%`, description: `${approvedDocuments} / ${totalDocuments} 个资料 approved`, tone: completion >= 80 ? "green" : "amber" },
		{ label: "待审核", value: String(data.stats?.pendingReviews ?? data.reviews.length), description: "ProjectStats.pendingReviews / listReviews", tone: data.reviews.length > 0 ? "amber" : "green" },
		{ label: "单位工程", value: String(data.stats?.totalUnits ?? data.units.length), description: "ProjectStats.totalUnits / listUnits", tone: "blue" },
	];
}

function getIssues(workspaceId: WorkspaceId, data: ArchiveDashboardData): IssueView[] {
	const issues: IssueView[] = [];
	if (workspaceId === "intake" || workspaceId === "cockpit") {
		for (const file of data.uploads.filter((item) => item.status === "pending" || !item.nodeId)) {
			issues.push({
				title: file.title || file.fileName,
				description: file.nodeId ? "文件仍处于 pending 状态。" : "文件未绑定目录节点。",
				severity: file.nodeId ? "warning" : "blocking",
				objectType: "UploadFile",
				objectId: String(file.id),
				suggestedAction: "补齐著录",
			});
		}
	}
	if (workspaceId === "review" || workspaceId === "cockpit") {
		for (const review of data.reviews) {
			issues.push({
				title: review.documentTitle ?? `Review #${review.id}`,
				description: "审核任务仍处于 pending。",
				severity: "warning",
				objectType: "Review",
				objectId: String(review.id),
				suggestedAction: "处理审核",
			});
		}
	}
	if (workspaceId === "signing" || workspaceId === "cockpit") {
		for (const task of data.signingTasks.filter((item) => item.status !== "completed")) {
			issues.push({
				title: task.docName ?? task.documentTitle ?? `SigningTask #${task.id ?? "-"}`,
				description: `签章任务状态为 ${task.status ?? "unknown"}。`,
				severity: "warning",
				objectType: "SigningTask",
				objectId: String(task.id ?? "-"),
				suggestedAction: "推进签章",
			});
		}
	}
	if ((workspaceId === "archive" || workspaceId === "cockpit") && data.latestPrecheck) {
		const precheck = data.latestPrecheck;
		if ((precheck.errorCount ?? 0) > 0 || precheck.status === "failed") {
			issues.push({
				title: "最新预检未通过",
				description: `error=${precheck.errorCount ?? 0}, warning=${precheck.warningCount ?? 0}`,
				severity: "blocking",
				objectType: "CompliancePrecheck",
				objectId: String(precheck.id ?? "latest"),
				suggestedAction: "查看预检问题",
			});
		}
	}
	if (workspaceId === "governance") {
		for (const error of data.errors) {
			issues.push({
				title: "接口加载异常",
				description: error,
				severity: "warning",
				objectType: "API",
				objectId: "load",
				suggestedAction: "检查后端接口",
			});
		}
	}
	return issues;
}

function getEvidenceRefs(workspaceId: WorkspaceId, data: ArchiveDashboardData): EvidenceRef[] {
	const refs: EvidenceRef[] = [];
	if (data.latestPrecheck) {
		refs.push({
			id: `precheck-${data.latestPrecheck.id ?? "latest"}`,
			sourceType: "api",
			objectType: "CompliancePrecheck",
			objectId: data.latestPrecheck.id ?? "latest",
			field: "status",
			excerpt: `status=${data.latestPrecheck.status ?? "unknown"}, errors=${data.latestPrecheck.errorCount ?? 0}`,
			confidence: 1,
			createdAt: data.latestPrecheck.checkedAt ?? data.latestPrecheck.createdAt ?? new Date().toISOString(),
		});
	}
	if (workspaceId === "intake") {
		for (const file of data.uploads.slice(0, 3)) {
			refs.push({
				id: `upload-${file.id}`,
				sourceType: "api",
				objectType: "UploadFile",
				objectId: file.id,
				field: "status",
				excerpt: `${file.fileName}: status=${file.status}, node=${file.nodeLabel ?? file.nodeId ?? "未著录"}`,
				confidence: 1,
				createdAt: file.updatedAt ?? file.uploadedAt ?? new Date().toISOString(),
			});
		}
	}
	if (workspaceId === "review") {
		for (const review of data.reviews.slice(0, 3)) {
			refs.push({
				id: `review-${review.id}`,
				sourceType: "api",
				objectType: "Review",
				objectId: review.id,
				field: "status",
				excerpt: `${review.documentTitle ?? review.documentId}: ${review.status}`,
				confidence: 1,
				createdAt: review.updatedAt ?? review.createdAt ?? new Date().toISOString(),
			});
		}
	}
	return refs;
}

function buildActionProposal(actionType: string, evidenceCount: number): ActionProposalView {
	const action = ontologyManifest.actionTypes[actionType];
	const policy = ontologyRuntime.getActionPolicy(actionType);
	if (!action || !policy) {
		return {
			actionType,
			label: actionType,
			confirmationLevel: "high",
			requiredRole: "unknown",
			sideEffects: ["Ontology policy missing"],
			evidenceCount,
			canExecute: false,
		};
	}

	return {
		actionType,
		operationId: ontologyRuntime.bindOperation(actionType),
		label: action.label,
		confirmationLevel: policy.confirmationLevel,
		requiredRole: policy.requiredRole,
		requiredProjectRole: policy.requiredProjectRole,
		sideEffects: policy.sideEffects,
		evidenceCount,
		canExecute: evidenceCount > 0 || !policy.evidenceRequired,
	};
}

function getCurrentLifecycleStage(data: ArchiveDashboardData): LifecycleStage {
	const context: LifecycleInferenceContext = {
		projectStatus: data.selectedProject?.status ?? "active",
		hasCatalogTemplate: data.documents.length > 0 || data.uploads.length > 0 || data.compilations.length > 0,
		compilationInProgress: data.compilations.filter((item) => item.status === "drafting").length,
		uncataloguedFiles: data.uploads.filter((file) => file.status === "pending" || !file.nodeId).length,
		reviewPending: data.reviews.length,
		signingPending: data.signingTasks.filter((task) => task.status !== "completed").length,
		precheckStatus: data.latestPrecheck?.status,
		archivePackageReady: data.archivePackages.some((item) => item.status === "ready"),
		collectedCount: data.collectionItems.length,
	};
	return ontologyRuntime.inferLifecycleStage(context);
}

function renderUploadNodeTree(uploads: UploadFileRecord[]): TemplateResult {
	const nodeLabels = Array.from(new Set(uploads.map((upload) => upload.nodeLabel ?? upload.nodeId).filter((value): value is string => Boolean(value))));
	if (nodeLabels.length === 0) {
		return html`<div class="sub" style="padding: 8px">后端上传文件暂无目录节点数据。</div>`;
	}
	return html`${nodeLabels.map((label) => html`<div class="tree-row">${icon("file-text")} ${label}</div>`)}`;
}

function renderCompilationTable(compilations: readonly { id: number; name?: string; itemId?: string; status?: string; lastModifiedAt?: string; createdAt?: string }[]): TemplateResult {
	if (compilations.length === 0) return renderEmptyState("当前项目暂无编制实例");
	return html`
		<table class="table" style="border: 0; border-radius: 0; margin-top: 8px">
			<tr><th>实例</th><th>目录项</th><th>状态</th><th>时间</th></tr>
			${compilations.map(
				(item) => html`
					<tr>
						<td><strong>${item.name ?? `Compilation #${item.id}`}</strong></td>
						<td>${item.itemId ?? "-"}</td>
						<td><span class="badge ${item.status === "completed" || item.status === "signed" ? "green" : "amber"}">${item.status ?? "unknown"}</span></td>
						<td>${formatDate(item.lastModifiedAt ?? item.createdAt)}</td>
					</tr>
				`,
			)}
		</table>
	`;
}

function renderDocumentTable(documents: DocumentRecord[]): TemplateResult {
	if (documents.length === 0) return renderEmptyState("当前项目暂无资料");
	return html`
		<table class="table" style="border: 0; border-radius: 0; margin-top: 8px">
			<tr><th>资料</th><th>分类</th><th>状态</th><th>更新时间</th></tr>
			${documents.map(
				(document) => html`
					<tr>
						<td><strong>${document.title}</strong><div class="sub">${document.code ?? `Document #${document.id}`}</div></td>
						<td>${document.category ?? "-"}</td>
						<td><span class="badge ${document.status === "approved" ? "green" : document.status === "rejected" ? "red" : "amber"}">${document.status}</span></td>
						<td>${formatDate(document.updatedAt ?? document.createdAt)}</td>
					</tr>
				`,
			)}
		</table>
	`;
}

function renderArchivePackageTable(packages: ArchivePackageRecord[]): TemplateResult {
	return html`
		<div class="card">
			<div class="section-head" style="padding: 14px 14px 0">
				<h2>归档包</h2>
				<span class="badge blue">${packages.length} 条</span>
			</div>
			${packages.length === 0
				? renderEmptyState("当前项目暂无归档包")
				: html`
					<table class="table" style="border: 0; border-radius: 0; margin-top: 8px">
						<tr><th>名称</th><th>阶段</th><th>文件数</th><th>状态</th></tr>
						${packages.map(
							(item) => html`
								<tr>
									<td><strong>${item.name ?? `ArchivePackage #${item.id ?? "-"}`}</strong></td>
									<td>${item.stage ?? "-"}</td>
									<td>${item.fileCount ?? "-"}</td>
									<td><span class="badge ${item.status === "ready" || item.status === "submitted" ? "green" : "amber"}">${item.status ?? "unknown"}</span></td>
								</tr>
							`,
						)}
					</table>
				`}
		</div>
	`;
}

function renderCollectionTable(items: CollectionItemRecord[]): TemplateResult {
	return html`
		<div class="card">
			<div class="section-head" style="padding: 14px 14px 0">
				<h2>采集项</h2>
				<span class="badge blue">${items.length} 条</span>
			</div>
			${items.length === 0
				? renderEmptyState("当前项目暂无采集项")
				: html`
					<table class="table" style="border: 0; border-radius: 0; margin-top: 8px">
						<tr><th>itemId</th><th>类型</th><th>采集时间</th></tr>
						${items.map(
							(item) => html`
								<tr>
									<td><strong>${item.itemId ?? item.id ?? "-"}</strong></td>
									<td>${item.fileType ?? "-"}</td>
									<td>${formatDate(item.collectedAt)}</td>
								</tr>
							`,
						)}
					</table>
				`}
		</div>
	`;
}

function renderEmptyState(message: string): TemplateResult {
	return html`<div class="sub" style="padding: 16px">${message}</div>`;
}

function formatDate(value?: string): string {
	if (!value) return "-";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return date.toLocaleString("zh-CN", { hour12: false });
}

function formatFileSize(value?: number): string {
	if (!value) return "未知大小";
	if (value < 1024) return `${value} B`;
	if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
	return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function getProjectIdFromUrl(): number | undefined {
	const value = new URLSearchParams(window.location.search).get("projectId");
	if (!value) return undefined;
	const numeric = Number(value);
	return Number.isFinite(numeric) ? numeric : undefined;
}

async function initApp(): Promise<void> {
	renderApp();
	await setupArchiveAgent();
	await refreshData();
}

void initApp();
