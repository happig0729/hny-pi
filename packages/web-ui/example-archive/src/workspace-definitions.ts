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
		subtitle: "按项目组织、文件著录、编制审核、签章确认、预检归档查看当前业务进展和下一步办理动作。",
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
		subtitle: "围绕文件进入档案系统后的目录归类、著录字段、状态流转和批量提交进行办理。",
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
		subtitle: "聚焦编制实例、在线资料和字段来源，确保填报内容可追溯、可审核、可进入归档链路。",
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
		subtitle: "集中处理待审核资料、退回原因和整改闭环，高风险退回动作必须由人员确认。",
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
		subtitle: "聚合签章任务、流程节点、待签责任人和完成状态，定位签章环节阻塞原因。",
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
		subtitle: "检查归档完整性、预检结果、归档包状态和采集闭环，明确能否进入最终归档。",
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
		subtitle: "查看接口加载、操作规则、权限约束和依据链状态，确保智能体建议可追溯、可审计。",
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
