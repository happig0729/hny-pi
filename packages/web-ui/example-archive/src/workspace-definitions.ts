import type { LifecycleInferenceContext, LifecycleStage } from "./ontology-runtime.js";

export type WorkspaceId =
	| "cockpit"
	| "intake"
	| "compile"
	| "review"
	| "signing"
	| "archive"
	| "governance";

export interface WorkspaceDefinition {
	id: WorkspaceId;
	label: string;
	icon: string;
	agentName: string;
	agentKind: string;
	eyebrow: string;
	title: string;
	subtitle: string;
	actionType: string;
	ontologyScope: string[];
	primaryObjects: string[];
	emptyLifecycleContext: LifecycleInferenceContext;
}

export const workspaces: WorkspaceDefinition[] = [
	{
		id: "cockpit",
		label: "项目驾驶舱",
		icon: "layout-dashboard",
		agentName: "项目总控 Agent",
		agentKind: "Project Control Agent",
		eyebrow: "Project Control Agent",
		title: "项目全生命周期驾驶舱",
		subtitle: "围绕 Project / Unit / Catalog / File / Review / Signing / ArchivePackage 的生产状态、阻塞和下一步动作。",
		actionType: "runPrecheck",
		ontologyScope: ["Project", "Unit", "UploadFile", "Document", "SigningTask", "CompliancePrecheck", "ArchivePackage"],
		primaryObjects: ["Project", "Unit", "CompliancePrecheck"],
		emptyLifecycleContext: {
			projectStatus: "active",
			hasCatalogTemplate: false,
			compilationInProgress: 0,
			uncataloguedFiles: 0,
			reviewPending: 0,
			signingPending: 0,
			archivePackageReady: false,
			collectedCount: 0,
		},
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
		actionType: "bulkSubmitUploadFiles",
		ontologyScope: ["UploadFile", "UploadFileVersion", "CatalogTemplateNode", "CityArchiveCatalogNode", "Archivable"],
		primaryObjects: ["UploadFile", "CatalogTemplateNode"],
		emptyLifecycleContext: {
			projectStatus: "active",
			hasCatalogTemplate: false,
			compilationInProgress: 0,
			uncataloguedFiles: 0,
			reviewPending: 0,
			signingPending: 0,
			archivePackageReady: false,
			collectedCount: 0,
		},
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
		actionType: "updateCompilationFormData",
		ontologyScope: ["CompilationInstance", "CompilationFormData", "Template", "TemplateAutofillConfig"],
		primaryObjects: ["CompilationInstance", "Document"],
		emptyLifecycleContext: {
			projectStatus: "active",
			hasCatalogTemplate: false,
			compilationInProgress: 0,
			uncataloguedFiles: 0,
			reviewPending: 0,
			signingPending: 0,
			archivePackageReady: false,
			collectedCount: 0,
		},
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
		actionType: "rejectReview",
		ontologyScope: ["Review", "Document", "UploadFile", "ReviewHintGenerator"],
		primaryObjects: ["Review", "Document"],
		emptyLifecycleContext: {
			projectStatus: "active",
			hasCatalogTemplate: false,
			compilationInProgress: 0,
			uncataloguedFiles: 0,
			reviewPending: 0,
			signingPending: 0,
			archivePackageReady: false,
			collectedCount: 0,
		},
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
		actionType: "createSigningTask",
		ontologyScope: ["SigningTask", "SigningNode", "Seal", "CanBeSigned", "HasAssignee"],
		primaryObjects: ["SigningTask", "SigningNode", "Seal"],
		emptyLifecycleContext: {
			projectStatus: "active",
			hasCatalogTemplate: false,
			compilationInProgress: 0,
			uncataloguedFiles: 0,
			reviewPending: 0,
			signingPending: 0,
			archivePackageReady: false,
			collectedCount: 0,
		},
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
		actionType: "packageProject",
		ontologyScope: ["CompliancePrecheck", "ArchivePackage", "CollectedItem", "Archivable", "CityArchiveMapping"],
		primaryObjects: ["CompliancePrecheck", "ArchivePackage", "CollectedItem"],
		emptyLifecycleContext: {
			projectStatus: "active",
			hasCatalogTemplate: false,
			compilationInProgress: 0,
			uncataloguedFiles: 0,
			reviewPending: 0,
			signingPending: 0,
			archivePackageReady: false,
			collectedCount: 0,
		},
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
		actionType: "runPrecheck",
		ontologyScope: ["OperationLog", "AgentRunRecord", "ActionPolicy", "EvidenceRef"],
		primaryObjects: ["OperationLog", "AgentRunRecord"],
		emptyLifecycleContext: {
			projectStatus: "active",
			hasCatalogTemplate: false,
			compilationInProgress: 0,
			uncataloguedFiles: 0,
			reviewPending: 0,
			signingPending: 0,
			archivePackageReady: false,
			collectedCount: 0,
		},
	},
];

export const lifecycleStageOrder: LifecycleStage[] = [
	"setup",
	"template",
	"compilation",
	"cataloguing",
	"review",
	"signing",
	"precheck",
	"packaging",
	"collection",
	"archived",
];

export function getWorkspace(id: WorkspaceId): WorkspaceDefinition {
	return workspaces.find((workspace) => workspace.id === id) ?? workspaces[0];
}
