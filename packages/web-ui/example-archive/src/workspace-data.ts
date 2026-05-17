import {
	type ActionPolicy,
	type EvidenceRef,
	type LifecycleInferenceContext,
	type LifecycleStage,
	ontologyManifest,
	ontologyRuntime,
} from "./ontology-runtime.js";

export type WorkspaceId =
	| "cockpit"
	| "intake"
	| "compile"
	| "review"
	| "signing"
	| "archive"
	| "governance";

export interface WorkspaceMetric {
	label: string;
	value: string;
	description: string;
	tone: "green" | "blue" | "amber" | "red";
}

export interface WorkspaceIssue {
	title: string;
	description: string;
	severity: "info" | "warning" | "blocking";
	objectType: string;
	objectId: string;
	suggestedAction?: string;
}

export interface AgentWorkspace {
	id: WorkspaceId;
	label: string;
	icon: string;
	agentName: string;
	agentKind: string;
	eyebrow: string;
	title: string;
	subtitle: string;
	lifecycleContext: LifecycleInferenceContext;
	metrics: WorkspaceMetric[];
	issues: WorkspaceIssue[];
	actionType: string;
	ontologyScope: string[];
	evidenceRefs: EvidenceRef[];
	primaryObjects: string[];
}

export interface ActionProposalView {
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

const now = "2026-05-17T10:30:00+08:00";

const sharedEvidence: EvidenceRef[] = [
	{
		id: "ev-precheck-001",
		sourceType: "api",
		objectType: "CompliancePrecheck",
		objectId: 91,
		field: "issues",
		excerpt: "9 个 blocking issue，12 个 warning issue。",
		confidence: 1,
		createdAt: now,
	},
	{
		id: "ev-catalog-001",
		sourceType: "ontology_rule",
		objectType: "CatalogTemplateNode",
		objectId: "4.2.03",
		field: "nodeId",
		excerpt: "目录 file 节点必须存在对应 Document 或 UploadFile。",
		confidence: 1,
		createdAt: now,
	},
	{
		id: "ev-signing-001",
		sourceType: "api",
		objectType: "SigningTask",
		objectId: 3104,
		field: "status",
		excerpt: "8 个签章节点仍为 pending。",
		confidence: 1,
		createdAt: now,
	},
];

export const workspaces: AgentWorkspace[] = [
	{
		id: "cockpit",
		label: "项目驾驶舱",
		icon: "layout-dashboard",
		agentName: "项目总控 Agent",
		agentKind: "Project Control Agent",
		eyebrow: "Project Control Agent",
		title: "项目全生命周期驾驶舱",
		subtitle: "围绕 Project / Unit / Catalog / File / Review / Signing / ArchivePackage 的生产状态、阻塞和下一步动作。",
		lifecycleContext: {
			projectStatus: "active",
			hasCatalogTemplate: true,
			compilationInProgress: 0,
			uncataloguedFiles: 0,
			reviewPending: 4,
			signingPending: 8,
			precheckStatus: "failed",
			archivePackageReady: false,
			collectedCount: 0,
		},
		metrics: [
			{ label: "档案项完成率", value: "82%", description: "312 / 381 个目录 file 节点已有有效档案对象", tone: "green" },
			{ label: "待处理阻塞", value: "17", description: "缺项 6、未签章 8、目录映射缺失 3", tone: "red" },
			{ label: "AI 可建议项", value: "64", description: "高置信度著录 42、表单填充 18、审核意见 4", tone: "blue" },
		],
		issues: [
			{
				title: "缺少竣工验收备案表",
				description: "CatalogTemplateNode 4.2.03 无 Document 或 UploadFile。",
				severity: "blocking",
				objectType: "CatalogTemplateNode",
				objectId: "4.2.03",
				suggestedAction: "生成整改清单",
			},
			{
				title: "8 个文件未完成签章",
				description: "SigningTask 未 completed，不能进入正式归档包。",
				severity: "blocking",
				objectType: "SigningTask",
				objectId: "3104",
				suggestedAction: "催办待签人",
			},
			{
				title: "3 个目录未映射城建标准",
				description: "CityArchiveMapping 缺失，影响交付目录。",
				severity: "warning",
				objectType: "CityArchiveMapping",
				objectId: "missing:3",
				suggestedAction: "生成映射草案",
			},
		],
		actionType: "runPrecheck",
		ontologyScope: ["Project", "Unit", "UploadFile", "Document", "SigningTask", "CompliancePrecheck", "ArchivePackage"],
		evidenceRefs: sharedEvidence,
		primaryObjects: ["Project", "Unit", "CompliancePrecheck"],
	},
	{
		id: "intake",
		label: "文件著录",
		icon: "files",
		agentName: "文件著录 Agent",
		agentKind: "File Cataloguing Agent",
		eyebrow: "File Cataloguing Agent",
		title: "文件上传、解析、分类与著录",
		subtitle: "AI 负责理解文件，结构化界面负责批量核验、确认和审计。",
		lifecycleContext: {
			projectStatus: "active",
			hasCatalogTemplate: true,
			compilationInProgress: 0,
			uncataloguedFiles: 3,
			reviewPending: 0,
			signingPending: 0,
			precheckStatus: undefined,
			archivePackageReady: false,
			collectedCount: 0,
		},
		metrics: [
			{ label: "高置信度", value: "42", description: "可批量确认著录的文件", tone: "green" },
			{ label: "需抽检", value: "15", description: "中置信度，建议人工抽检", tone: "amber" },
			{ label: "需复核", value: "5", description: "OCR 噪声或分类不确定", tone: "red" },
		],
		issues: [
			{
				title: "扫描件_0421.jpg 置信度低",
				description: "OCR 噪声较高，可能为隐蔽验收记录。",
				severity: "warning",
				objectType: "UploadFile",
				objectId: "842",
				suggestedAction: "进入人工复核",
			},
		],
		actionType: "bulkSubmitUploadFiles",
		ontologyScope: ["UploadFile", "UploadFileVersion", "CatalogTemplateNode", "CityArchiveCatalogNode", "Archivable"],
		evidenceRefs: [
			{
				id: "ev-file-001",
				sourceType: "file_text",
				objectType: "UploadFile",
				objectId: 840,
				field: "extractedText",
				excerpt: "施工组织设计、审批表、施工单位技术负责人签字。",
				confidence: 0.94,
				createdAt: now,
			},
		],
		primaryObjects: ["UploadFile", "CatalogTemplateNode"],
	},
	{
		id: "compile",
		label: "编制填报",
		icon: "clipboard-pen",
		agentName: "编制 Agent",
		agentKind: "Compilation Agent",
		eyebrow: "Compilation Agent",
		title: "智能编制与表单填报",
		subtitle: "字段级展示来源：项目默认值、历史记录、AI 推断、人工输入。",
		lifecycleContext: {
			projectStatus: "active",
			hasCatalogTemplate: true,
			compilationInProgress: 18,
			uncataloguedFiles: 0,
			reviewPending: 0,
			signingPending: 0,
			precheckStatus: undefined,
			archivePackageReady: false,
			collectedCount: 0,
		},
		metrics: [
			{ label: "自动填充字段", value: "28", description: "来自项目默认值和历史记录", tone: "green" },
			{ label: "AI 推断字段", value: "9", description: "需要人工确认来源", tone: "blue" },
			{ label: "缺少来源", value: "3", description: "必须人工填写", tone: "amber" },
		],
		issues: [
			{
				title: "项目负责人缺少可靠来源",
				description: "历史记录和项目扩展字段未找到一致候选值。",
				severity: "warning",
				objectType: "CompilationFormData",
				objectId: "instance:238:projectOwner",
				suggestedAction: "人工确认字段",
			},
		],
		actionType: "updateCompilationFormData",
		ontologyScope: ["CompilationInstance", "CompilationFormData", "Template", "TemplateAutofillConfig"],
		evidenceRefs: [
			{
				id: "ev-form-001",
				sourceType: "history",
				objectType: "CompilationFormData",
				objectId: 238,
				field: "acceptanceConclusion",
				excerpt: "同类项目 14 次历史填写使用该验收结论。",
				confidence: 0.83,
				createdAt: now,
			},
		],
		primaryObjects: ["CompilationInstance", "Document"],
	},
	{
		id: "review",
		label: "审核整改",
		icon: "badge-check",
		agentName: "审核 Agent",
		agentKind: "Review Agent",
		eyebrow: "Review Agent",
		title: "审核、问题标注与整改闭环",
		subtitle: "AI 生成风险提示和审核意见草稿，审核责任仍由人员确认。",
		lifecycleContext: {
			projectStatus: "active",
			hasCatalogTemplate: true,
			compilationInProgress: 0,
			uncataloguedFiles: 0,
			reviewPending: 4,
			signingPending: 0,
			precheckStatus: undefined,
			archivePackageReady: false,
			collectedCount: 0,
		},
		metrics: [
			{ label: "待审核", value: "24", description: "进入 Review 队列的对象", tone: "blue" },
			{ label: "阻断问题", value: "4", description: "日期、签章或必填项错误", tone: "red" },
			{ label: "意见草稿", value: "11", description: "AI 已生成可采纳意见", tone: "green" },
		],
		issues: [
			{
				title: "编制日期非法",
				description: "提取到 2026-06-31，不是有效日期。",
				severity: "blocking",
				objectType: "Document",
				objectId: "doc:501",
				suggestedAction: "退回整改",
			},
			{
				title: "监理章缺失",
				description: "签章节点未完成，不能进入归档包。",
				severity: "warning",
				objectType: "SigningTask",
				objectId: "task:391",
				suggestedAction: "补齐签章",
			},
		],
		actionType: "rejectReview",
		ontologyScope: ["Review", "Document", "UploadFile", "ReviewHintGenerator"],
		evidenceRefs: [
			{
				id: "ev-review-001",
				sourceType: "file_text",
				objectType: "Document",
				objectId: 501,
				field: "compileDate",
				excerpt: "编制日期：2026-06-31。",
				confidence: 1,
				createdAt: now,
			},
		],
		primaryObjects: ["Review", "Document"],
	},
	{
		id: "signing",
		label: "签章流转",
		icon: "signature",
		agentName: "签章 Agent",
		agentKind: "Signing Agent",
		eyebrow: "Signing Agent",
		title: "签章流程编排与待签聚合",
		subtitle: "顺序 / 并行签章由 SigningTask 和 SigningNode 驱动，AI 负责规划和解释阻塞。",
		lifecycleContext: {
			projectStatus: "active",
			hasCatalogTemplate: true,
			compilationInProgress: 0,
			uncataloguedFiles: 0,
			reviewPending: 0,
			signingPending: 8,
			precheckStatus: undefined,
			archivePackageReady: false,
			collectedCount: 0,
		},
		metrics: [
			{ label: "待签节点", value: "8", description: "跨 5 个签章任务", tone: "amber" },
			{ label: "顺序流程", value: "6", description: "需要按节点推进", tone: "blue" },
			{ label: "即将过期印章", value: "1", description: "12 天后过期", tone: "amber" },
		],
		issues: [
			{
				title: "施工组织设计阻塞在监理节点",
				description: "sequential 流程下后续节点不能提前签。",
				severity: "warning",
				objectType: "SigningNode",
				objectId: "node:2",
				suggestedAction: "发送催办",
			},
		],
		actionType: "createSigningTask",
		ontologyScope: ["SigningTask", "SigningNode", "Seal", "CanBeSigned", "HasAssignee"],
		evidenceRefs: [sharedEvidence[2]],
		primaryObjects: ["SigningTask", "SigningNode", "Seal"],
	},
	{
		id: "archive",
		label: "归档预检",
		icon: "package-check",
		agentName: "归档 Agent",
		agentKind: "Archive Agent",
		eyebrow: "Archive Agent",
		title: "合规预检、归档包与采集闭环",
		subtitle: "归档不是按钮，是完整性、标准映射、签章、文件版本和采集状态共同满足后的交付动作。",
		lifecycleContext: {
			projectStatus: "active",
			hasCatalogTemplate: true,
			compilationInProgress: 0,
			uncataloguedFiles: 0,
			reviewPending: 0,
			signingPending: 8,
			precheckStatus: "failed",
			archivePackageReady: false,
			collectedCount: 0,
		},
		metrics: [
			{ label: "预检通过率", value: "74%", description: "312 个检查项通过", tone: "amber" },
			{ label: "阻断项", value: "9", description: "缺项、未签章、目录映射", tone: "red" },
			{ label: "警告项", value: "12", description: "可豁免或需说明", tone: "amber" },
		],
		issues: [
			{
				title: "竣工验收备案表缺失",
				description: "CatalogTemplateNode 4.2.03 无档案对象。",
				severity: "blocking",
				objectType: "CatalogTemplateNode",
				objectId: "4.2.03",
				suggestedAction: "补齐档案项",
			},
			{
				title: "8 个文件未完成签章",
				description: "SigningTask 未 completed，不能进入正式归档包。",
				severity: "blocking",
				objectType: "SigningTask",
				objectId: "pending:8",
				suggestedAction: "完成签章",
			},
		],
		actionType: "packageProject",
		ontologyScope: ["CompliancePrecheck", "ArchivePackage", "CollectedItem", "Archivable", "CityArchiveMapping"],
		evidenceRefs: sharedEvidence,
		primaryObjects: ["CompliancePrecheck", "ArchivePackage", "CollectedItem"],
	},
	{
		id: "governance",
		label: "权限审计",
		icon: "fingerprint",
		agentName: "治理 Agent",
		agentKind: "Governance Agent",
		eyebrow: "Governance Agent",
		title: "权限、审计与 AI 证据链",
		subtitle: "任何 AI 辅助动作都必须能追踪：模型、证据、工具调用、用户确认、Action Type、operationId。",
		lifecycleContext: {
			projectStatus: "active",
			hasCatalogTemplate: true,
			compilationInProgress: 0,
			uncataloguedFiles: 0,
			reviewPending: 0,
			signingPending: 0,
			precheckStatus: undefined,
			archivePackageReady: false,
			collectedCount: 0,
		},
		metrics: [
			{ label: "今日动作", value: "128", description: "POST / PUT / DELETE 审计记录", tone: "blue" },
			{ label: "Agent Run", value: "43", description: "带证据和工具调用记录", tone: "green" },
			{ label: "权限拒绝", value: "6", description: "越权动作被阻断", tone: "amber" },
		],
		issues: [
			{
				title: "归档包生成需 data_admin",
				description: "当前 data_clerk 只能生成建议，不能执行 packageProject。",
				severity: "warning",
				objectType: "ActionPolicy",
				objectId: "packageProject",
				suggestedAction: "申请 data_admin 或转交管理员",
			},
		],
		actionType: "runPrecheck",
		ontologyScope: ["OperationLog", "AgentRunRecord", "ActionPolicy", "EvidenceRef"],
		evidenceRefs: sharedEvidence,
		primaryObjects: ["OperationLog", "AgentRunRecord"],
	},
];

export const lifecycleStages = ontologyManifest.lifecycle.stages;

export const currentUserContext = {
	systemRole: "tenant_user",
	projectRole: "data_admin",
};

export function getWorkspace(id: WorkspaceId): AgentWorkspace {
	const workspace = workspaces.find((item) => item.id === id);
	if (!workspace) return workspaces[0];
	return workspace;
}

export function buildActionProposal(workspace: AgentWorkspace): ActionProposalView {
	const action = ontologyManifest.actionTypes[workspace.actionType];
	const policy = ontologyRuntime.getActionPolicy(workspace.actionType);
	if (!action || !policy) {
		return {
			actionType: workspace.actionType,
			label: workspace.actionType,
			confirmationLevel: "high",
			requiredRole: "unknown",
			sideEffects: ["Ontology policy missing"],
			evidenceCount: workspace.evidenceRefs.length,
			canExecute: false,
		};
	}

	return {
		actionType: workspace.actionType,
		operationId: ontologyRuntime.bindOperation(workspace.actionType),
		label: action.label,
		confirmationLevel: policy.confirmationLevel,
		requiredRole: policy.requiredRole,
		requiredProjectRole: policy.requiredProjectRole,
		sideEffects: policy.sideEffects,
		evidenceCount: workspace.evidenceRefs.length,
		canExecute: ontologyRuntime.canExecuteAction(currentUserContext, policy),
	};
}

export function getCurrentLifecycleStage(workspace: AgentWorkspace): LifecycleStage {
	return ontologyRuntime.inferLifecycleStage(workspace.lifecycleContext);
}
