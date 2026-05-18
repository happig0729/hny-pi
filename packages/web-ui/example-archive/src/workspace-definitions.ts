import type { LifecycleInferenceContext, LifecycleStage, OntologyActionType } from "./ontology-runtime.js";

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
	actionType: OntologyActionType;
	ontologyScope: string[];
	primaryObjects: string[];
	emptyLifecycleContext: LifecycleInferenceContext;
}

export const workspaces: WorkspaceDefinition[] = [
	{
		id: "cockpit",
		label: "项目驾驶舱",
		icon: "layout-dashboard",
		agentName: "项目总控智能体",
		agentKind: "项目总控智能体",
		eyebrow: "项目总控智能体",
		title: "项目全生命周期驾驶舱",
		subtitle: "本体定义业务对象、关系、操作和规则，智能体基于真实后端数据判断项目状态、阻塞问题和下一步办理建议。",
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
		agentName: "文件著录智能体",
		agentKind: "文件著录智能体",
		eyebrow: "文件著录智能体",
		title: "文件上传、解析、分类与著录",
		subtitle: "本体定义上传文件与目录节点关系，智能体只基于业务依据生成分类、著录和批量提交建议。",
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
		agentName: "编制填报智能体",
		agentKind: "编制填报智能体",
		eyebrow: "编制填报智能体",
		title: "智能编制与表单填报",
		subtitle: "字段来源、可编辑操作和依据要求由本体约束，智能体推断必须能追溯到真实业务数据。",
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
		agentName: "审核整改智能体",
		agentKind: "审核整改智能体",
		eyebrow: "审核整改智能体",
		title: "审核、问题标注与整改闭环",
		subtitle: "审核建议来自本体规则、后端状态和证据链；退回等高风险动作必须由人员确认。",
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
		agentName: "签章流转智能体",
		agentKind: "签章流转智能体",
		eyebrow: "签章流转智能体",
		title: "签章流程编排与待签聚合",
		subtitle: "签章任务、签章节点、印章和权限规则共同决定签章办理建议，智能体负责解释阻塞原因。",
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
		agentName: "归档预检智能体",
		agentKind: "归档预检智能体",
		eyebrow: "归档预检智能体",
		title: "合规预检、归档包与采集闭环",
		subtitle: "归档动作由本体中的完整性、标准映射、签章、文件版本和采集状态共同约束。",
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
		agentName: "权限审计智能体",
		agentKind: "权限审计智能体",
		eyebrow: "权限审计智能体",
		title: "权限、审计与智能体依据链",
		subtitle: "本体显式定义业务对象、关系、操作、规则、依据和生命周期，所有智能体建议必须可追溯、可审计。",
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
