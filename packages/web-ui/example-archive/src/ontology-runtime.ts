export type ConfirmationLevel = "none" | "low" | "medium" | "high";

export type OntologyObjectType =
	| "Project"
	| "Unit"
	| "CatalogTemplateNode"
	| "CityArchiveCatalogNode"
	| "CompilationInstance"
	| "Document"
	| "UploadFile"
	| "UploadFileVersion"
	| "Review"
	| "SigningTask"
	| "SigningNode"
	| "CompliancePrecheck"
	| "ArchivePackage"
	| "CollectedItem"
	| "ProjectMember";

export type OntologyActionType =
	| "createProject"
	| "archiveProject"
	| "createUnit"
	| "bulkSubmitUploadFiles"
	| "updateCompilationFormData"
	| "rejectReview"
	| "createSigningTask"
	| "runPrecheck"
	| "packageProject";

export type EvidenceSourceType =
	| "api"
	| "file_text"
	| "ocr"
	| "ontology_rule"
	| "history"
	| "user_confirmation"
	| "ai_inference";

export interface ObjectTypeDefinition {
	name: OntologyObjectType;
	label: string;
	domain: string;
	description: string;
	interfaces: string[];
	statusValues?: string[];
}

export interface LinkTypeDefinition {
	name: string;
	source: OntologyObjectType;
	target: OntologyObjectType;
	cardinality: string;
	description: string;
}

export interface ActionTypeDefinition {
	name: OntologyActionType;
	label: string;
	domain: string;
	operationId?: string;
	trigger: string;
	inputs: string[];
	sideEffects: string[];
}

export interface FunctionDefinition {
	name: string;
	label: string;
	domain: string;
	description: string;
}

export interface InterfaceDefinition {
	name: string;
	label: string;
	description: string;
	implementers: string[];
}

export interface LifecycleStageDefinition {
	id: LifecycleStage;
	label: string;
	description: string;
	objectTypes: OntologyObjectType[];
	recommendedActions: OntologyActionType[];
}

export interface LifecycleGraph {
	stages: LifecycleStageDefinition[];
}

export interface ActionPolicy {
	actionType: OntologyActionType;
	operationId?: string;
	requiredRole: string;
	requiredProjectRole?: string;
	inputSchemaRef?: string;
	confirmationLevel: ConfirmationLevel;
	sideEffects: string[];
	auditRequired: boolean;
	evidenceRequired: boolean;
}

export interface EvidenceRef {
	id: string;
	sourceType: EvidenceSourceType;
	objectType?: OntologyObjectType;
	objectId?: string | number;
	field?: string;
	excerpt?: string;
	confidence?: number;
	createdAt: string;
}

export interface OntologyManifest {
	objectTypes: Record<OntologyObjectType, ObjectTypeDefinition>;
	linkTypes: Record<string, LinkTypeDefinition>;
	actionTypes: Record<OntologyActionType, ActionTypeDefinition>;
	functions: Record<string, FunctionDefinition>;
	interfaces: Record<string, InterfaceDefinition>;
	lifecycle: LifecycleGraph;
	policies: Record<OntologyActionType, ActionPolicy>;
}

export interface UserContext {
	systemRole: string;
	projectRole?: string;
}

export interface LifecycleInferenceContext {
	projectStatus: "active" | "project_archive";
	hasCatalogTemplate: boolean;
	compilationInProgress: number;
	uncataloguedFiles: number;
	reviewPending: number;
	signingPending: number;
	precheckStatus?: "running" | "passed" | "failed" | "warning";
	archivePackageReady: boolean;
	collectedCount: number;
}

export interface AgentOutputDraft {
	kind: "fact" | "inference" | "suggestion" | "action";
	text: string;
	evidenceRefs: EvidenceRef[];
	actionType?: OntologyActionType;
}

export type LifecycleStage =
	| "setup"
	| "template"
	| "compilation"
	| "cataloguing"
	| "review"
	| "signing"
	| "precheck"
	| "packaging"
	| "collection"
	| "archived";

// Runtime subset used by the example archive workbench. The full semantic model
// lives under ontology/ and OpenAPI remains the backend capability source.
export const ontologyManifest: OntologyManifest = {
	objectTypes: {
		Project: {
			name: "Project",
			label: "项目",
			domain: "project-management",
			description: "建设工程档案生命周期的主对象。",
			interfaces: ["HasStatus", "HasAudit", "HasOwner", "BelongsToTenant", "HasAccessCode", "HasExtension"],
			statusValues: ["active", "project_archive"],
		},
		Unit: {
			name: "Unit",
			label: "单位工程/标段",
			domain: "project-management",
			description: "项目下的单位工程或标段。",
			interfaces: ["HasStatus", "HasAudit", "BelongsToProject", "HasExtension"],
		},
		CatalogTemplateNode: {
			name: "CatalogTemplateNode",
			label: "目录模板节点",
			domain: "template-catalog",
			description: "项目档案目录树节点，file 节点是档案生产项。",
			interfaces: ["HasAudit"],
		},
		CityArchiveCatalogNode: {
			name: "CityArchiveCatalogNode",
			label: "城建档案馆目录节点",
			domain: "template-catalog",
			description: "城建档案馆标准目录节点。",
			interfaces: ["HasAudit", "HasStatus"],
		},
		CompilationInstance: {
			name: "CompilationInstance",
			label: "编制实例",
			domain: "document-lifecycle",
			description: "在线编制产生的一次档案编制任务。",
			interfaces: ["HasStatus", "HasAudit", "HasOwner", "BelongsToProject", "Versioned", "Archivable", "CanBeSigned"],
			statusValues: ["drafting", "completed", "signing", "signed", "collected"],
		},
		Document: {
			name: "Document",
			label: "著录文档",
			domain: "document-lifecycle",
			description: "在线编辑或上传产生的正式档案记录。",
			interfaces: ["HasStatus", "HasAudit", "HasOwner", "BelongsToProject", "Versioned", "Archivable", "HasAssignee"],
			statusValues: ["draft", "under_review", "approved", "rejected"],
		},
		UploadFile: {
			name: "UploadFile",
			label: "上传文件",
			domain: "document-lifecycle",
			description: "外部文件进入档案系统后的入口对象。",
			interfaces: ["HasStatus", "HasAudit", "HasOwner", "BelongsToProject", "Archivable", "CanBeSigned"],
			statusValues: ["pending", "signing", "signed", "collected", "returned"],
		},
		UploadFileVersion: {
			name: "UploadFileVersion",
			label: "上传文件版本",
			domain: "document-lifecycle",
			description: "上传文件替换后的版本记录。",
			interfaces: ["HasAudit", "Versioned"],
		},
		Review: {
			name: "Review",
			label: "审核记录",
			domain: "review-signing",
			description: "审核通过、退回和意见的责任记录。",
			interfaces: ["HasStatus", "HasAudit", "HasAssignee"],
			statusValues: ["pending", "approved", "rejected"],
		},
		SigningTask: {
			name: "SigningTask",
			label: "签章任务",
			domain: "review-signing",
			description: "签章流程编排容器。",
			interfaces: ["HasStatus", "HasAudit", "HasOwner", "BelongsToProject"],
			statusValues: ["pending", "in_progress", "completed", "rejected"],
		},
		SigningNode: {
			name: "SigningNode",
			label: "签章节点",
			domain: "review-signing",
			description: "签章任务中的具体待签节点。",
			interfaces: ["HasStatus", "HasAudit", "HasAssignee"],
			statusValues: ["pending", "signed", "rejected"],
		},
		CompliancePrecheck: {
			name: "CompliancePrecheck",
			label: "合规预检",
			domain: "ai-compliance",
			description: "归档前完整性、格式、内容、映射检查结果。",
			interfaces: ["HasStatus", "HasAudit", "BelongsToProject"],
			statusValues: ["running", "passed", "failed", "warning"],
		},
		ProjectMember: {
			name: "ProjectMember",
			label: "项目成员",
			domain: "project-management",
			description: "项目团队成员，定义角色和数据权限范围。",
			interfaces: ["HasAudit"],
		},
		ArchivePackage: {
			name: "ArchivePackage",
			label: "归档包",
			domain: "archive-collection",
			description: "项目生成的正式或草案归档包。",
			interfaces: ["HasStatus", "HasAudit", "HasOwner", "BelongsToProject"],
			statusValues: ["generating", "ready", "submitted"],
		},
		CollectedItem: {
			name: "CollectedItem",
			label: "已采集档案项",
			domain: "archive-collection",
			description: "归档采集记录，防止重复采集。",
			interfaces: ["HasAudit", "HasOwner", "BelongsToProject"],
		},
	},
	linkTypes: {
		project_has_unit: {
			name: "project_has_unit",
			source: "Project",
			target: "Unit",
			cardinality: "1:N",
			description: "项目包含若干单位工程。",
		},
		upload_file_belongs_to_project: {
			name: "upload_file_belongs_to_project",
			source: "UploadFile",
			target: "Project",
			cardinality: "N:1",
			description: "上传文件归属项目。",
		},
		upload_file_has_versions: {
			name: "upload_file_has_versions",
			source: "UploadFile",
			target: "UploadFileVersion",
			cardinality: "1:N",
			description: "上传文件版本历史。",
		},
		city_node_maps_to_project_node: {
			name: "city_node_maps_to_project_node",
			source: "CityArchiveCatalogNode",
			target: "CatalogTemplateNode",
			cardinality: "M:N",
			description: "城建档案馆标准与项目目录节点映射。",
		},
		signing_task_has_nodes: {
			name: "signing_task_has_nodes",
			source: "SigningTask",
			target: "SigningNode",
			cardinality: "1:N",
			description: "签章任务包含签章节点。",
		},
		project_has_archive_package: {
			name: "project_has_archive_package",
			source: "Project",
			target: "ArchivePackage",
			cardinality: "1:N",
			description: "项目生成若干归档包。",
		},
		project_has_collected_items: {
			name: "project_has_collected_items",
			source: "Project",
			target: "CollectedItem",
			cardinality: "1:N",
			description: "项目拥有归档采集记录。",
		},
	},
	actionTypes: {
		createProject: {
			name: "createProject",
			label: "创建项目",
			domain: "project-management",
			operationId: "createProject",
			trigger: "tenant_admin",
			inputs: ["name", "type", "buildingUnit", "location"],
			sideEffects: ["生成接入码", "创建默认目录结构", "记录操作日志"],
		},
		createUnit: {
			name: "createUnit",
			label: "创建单位工程",
			domain: "project-management",
			operationId: "createUnit",
			trigger: "project_admin",
			inputs: ["name", "engType", "structureType", "floors", "buildingArea"],
			sideEffects: ["创建单位工程/标段", "关联到项目", "记录操作日志"],
		},
		archiveProject: {
			name: "archiveProject",
			label: "项目归档锁定",
			domain: "project-management",
			operationId: "archiveProject",
			trigger: "project_admin",
			inputs: ["projectId"],
			sideEffects: ["项目状态变为 project_archive", "触发归档预检", "阻断编制和上传"],
		},
		bulkSubmitUploadFiles: {
			name: "bulkSubmitUploadFiles",
			label: "批量提交上传文件",
			domain: "document-lifecycle",
			operationId: "bulkSubmitUploadFiles",
			trigger: "data_clerk",
			inputs: ["projectId", "fileIds", "directoryUpdates"],
			sideEffects: ["校验文件状态", "更新目录著录", "提交进入后续流程"],
		},
		updateCompilationFormData: {
			name: "updateCompilationFormData",
			label: "更新编制表单字段",
			domain: "document-lifecycle",
			operationId: "updateCompilationFormData",
			trigger: "data_clerk",
			inputs: ["projectId", "instanceId", "fieldKey", "fieldValue"],
			sideEffects: ["upsert 表单字段", "更新修改时间"],
		},
		rejectReview: {
			name: "rejectReview",
			label: "审核退回",
			domain: "review-signing",
			operationId: "rejectReview",
			trigger: "data_admin",
			inputs: ["reviewId", "reason"],
			sideEffects: ["Review 状态变为 rejected", "通知创建者", "形成整改闭环"],
		},
		createSigningTask: {
			name: "createSigningTask",
			label: "创建签章任务",
			domain: "review-signing",
			operationId: "createSigningTask",
			trigger: "data_admin",
			inputs: ["projectId", "sourceType", "sourceId", "flowMode", "nodes"],
			sideEffects: ["创建 SigningTask", "创建 SigningNodes", "校验印章有效性"],
		},
		runPrecheck: {
			name: "runPrecheck",
			label: "运行合规预检",
			domain: "archive-collection",
			operationId: "runPrecheck",
			trigger: "data_admin",
			inputs: ["projectId", "options"],
			sideEffects: ["生成 CompliancePrecheck", "记录问题统计", "写入审计日志"],
		},
		packageProject: {
			name: "packageProject",
			label: "生成归档包",
			domain: "archive-collection",
			operationId: "packageProject",
			trigger: "data_admin",
			inputs: ["projectId"],
			sideEffects: ["打包文件", "生成 ArchivePackage", "更新存储用量"],
		},
	},
	functions: {
		checkProjectArchiveCompleteness: {
			name: "checkProjectArchiveCompleteness",
			label: "档案完整性校验",
			domain: "archive-collection",
			description: "遍历项目目录 file 节点，检查对应 Document 或 UploadFile。",
		},
		validateCityArchiveMapping: {
			name: "validateCityArchiveMapping",
			label: "目录映射校验",
			domain: "archive-collection",
			description: "比对项目目录与城建档案馆标准目录映射。",
		},
		generateReviewHints: {
			name: "generateReviewHints",
			label: "审核智能提示",
			domain: "review-signing",
			description: "基于规则和合规标准生成审核风险提示。",
		},
		aiClassifyFile: {
			name: "aiClassifyFile",
			label: "AI 文件分类",
			domain: "document-lifecycle",
			description: "识别文件类型、推荐目录节点、提取元数据。",
		},
	},
	interfaces: {
		HasStatus: {
			name: "HasStatus",
			label: "生命周期状态",
			description: "具备状态流转能力的实体。",
			implementers: ["Project", "Document", "UploadFile", "SigningTask", "SigningNode", "CompliancePrecheck", "ArchivePackage"],
		},
		BelongsToProject: {
			name: "BelongsToProject",
			label: "项目归属",
			description: "归属于某个项目的实体。",
			implementers: ["Unit", "Document", "UploadFile", "SigningTask", "CompliancePrecheck", "ArchivePackage", "CollectedItem"],
		},
		Archivable: {
			name: "Archivable",
			label: "可归档实体",
			description: "可被采集归档的档案实体。",
			implementers: ["Document", "UploadFile", "CompilationInstance"],
		},
		CanBeSigned: {
			name: "CanBeSigned",
			label: "可签章实体",
			description: "可进入签章流程的实体。",
			implementers: ["CompilationInstance", "UploadFile"],
		},
	},
	lifecycle: {
		stages: [
			{
				id: "setup",
				label: "立项",
				description: "项目、成员、单体工程初始化。",
				objectTypes: ["Project", "Unit"],
				recommendedActions: ["createProject"],
			},
			{
				id: "template",
				label: "目录",
				description: "目录模板、表单模板和城建映射准备。",
				objectTypes: ["CatalogTemplateNode", "CityArchiveCatalogNode"],
				recommendedActions: [],
			},
			{
				id: "compilation",
				label: "编制",
				description: "在线编制和表单填报。",
				objectTypes: ["CompilationInstance", "Document"],
				recommendedActions: ["updateCompilationFormData"],
			},
			{
				id: "cataloguing",
				label: "著录",
				description: "上传文件解析、分类和著录。",
				objectTypes: ["UploadFile", "UploadFileVersion"],
				recommendedActions: ["bulkSubmitUploadFiles"],
			},
			{
				id: "review",
				label: "审核",
				description: "审核、退回和复审。",
				objectTypes: ["Review", "Document", "UploadFile"],
				recommendedActions: ["rejectReview"],
			},
			{
				id: "signing",
				label: "签章",
				description: "签章任务和节点推进。",
				objectTypes: ["SigningTask", "SigningNode"],
				recommendedActions: ["createSigningTask"],
			},
			{
				id: "precheck",
				label: "预检",
				description: "归档前合规检查。",
				objectTypes: ["CompliancePrecheck"],
				recommendedActions: ["runPrecheck"],
			},
			{
				id: "packaging",
				label: "打包",
				description: "归档包生成和提交。",
				objectTypes: ["ArchivePackage"],
				recommendedActions: ["packageProject"],
			},
			{
				id: "collection",
				label: "采集",
				description: "采集记录和去重。",
				objectTypes: ["CollectedItem"],
				recommendedActions: [],
			},
			{
				id: "archived",
				label: "归档",
				description: "项目或单体进入归档锁定状态。",
				objectTypes: ["Project", "Unit"],
				recommendedActions: ["archiveProject"],
			},
		],
	},
	policies: {
		createProject: {
			actionType: "createProject",
			operationId: "createProject",
			requiredRole: "tenant_admin",
			confirmationLevel: "medium",
			sideEffects: ["生成接入码", "创建项目", "记录操作日志"],
			auditRequired: true,
			evidenceRequired: false,
		},
		archiveProject: {
			actionType: "archiveProject",
			operationId: "archiveProject",
			requiredRole: "tenant_user",
			requiredProjectRole: "project_admin",
			confirmationLevel: "high",
			sideEffects: ["项目锁定", "禁止编制和上传", "触发归档预检"],
			auditRequired: true,
			evidenceRequired: true,
		},
		createUnit: {
			actionType: "createUnit",
			operationId: "createUnit",
			requiredRole: "tenant_user",
			requiredProjectRole: "project_admin",
			confirmationLevel: "medium",
			sideEffects: ["创建单位工程/标段", "关联到项目", "记录操作日志"],
			auditRequired: true,
			evidenceRequired: false,
		},
		bulkSubmitUploadFiles: {
			actionType: "bulkSubmitUploadFiles",
			operationId: "bulkSubmitUploadFiles",
			requiredRole: "tenant_user",
			requiredProjectRole: "data_clerk",
			confirmationLevel: "medium",
			sideEffects: ["批量更新文件目录和状态", "进入后续流程"],
			auditRequired: true,
			evidenceRequired: true,
		},
		updateCompilationFormData: {
			actionType: "updateCompilationFormData",
			operationId: "updateCompilationFormData",
			requiredRole: "tenant_user",
			requiredProjectRole: "data_clerk",
			confirmationLevel: "low",
			sideEffects: ["更新表单字段", "记录修改时间"],
			auditRequired: true,
			evidenceRequired: false,
		},
		rejectReview: {
			actionType: "rejectReview",
			operationId: "rejectReview",
			requiredRole: "tenant_user",
			requiredProjectRole: "data_admin",
			confirmationLevel: "high",
			sideEffects: ["退回审核对象", "通知创建者", "形成整改任务"],
			auditRequired: true,
			evidenceRequired: true,
		},
		createSigningTask: {
			actionType: "createSigningTask",
			operationId: "createSigningTask",
			requiredRole: "tenant_user",
			requiredProjectRole: "data_admin",
			confirmationLevel: "high",
			sideEffects: ["创建签章任务", "锁定签章对象", "通知待签人"],
			auditRequired: true,
			evidenceRequired: true,
		},
		runPrecheck: {
			actionType: "runPrecheck",
			operationId: "runPrecheck",
			requiredRole: "tenant_user",
			requiredProjectRole: "data_admin",
			confirmationLevel: "medium",
			sideEffects: ["创建预检记录", "生成问题清单", "记录审计"],
			auditRequired: true,
			evidenceRequired: false,
		},
		packageProject: {
			actionType: "packageProject",
			operationId: "packageProject",
			requiredRole: "tenant_user",
			requiredProjectRole: "data_admin",
			confirmationLevel: "high",
			sideEffects: ["生成归档包", "更新存储用量", "产生交付物"],
			auditRequired: true,
			evidenceRequired: true,
		},
	},
};

const roleRank: Record<string, number> = {
	tenant_user: 1,
	system_admin: 2,
	tenant_admin: 3,
	super_admin: 4,
};

const projectRoleRank: Record<string, number> = {
	data_clerk: 1,
	data_admin: 2,
	project_admin: 3,
};

export class OntologyRuntime {
	constructor(private readonly manifest: OntologyManifest) {}

	getObjectDefinition(type: OntologyObjectType): ObjectTypeDefinition {
		return this.manifest.objectTypes[type];
	}

	getLinksForObject(type: OntologyObjectType): LinkTypeDefinition[] {
		return Object.values(this.manifest.linkTypes).filter((link) => link.source === type || link.target === type);
	}

	getActionPolicy(actionType: OntologyActionType): ActionPolicy {
		return this.manifest.policies[actionType];
	}

	bindOperation(actionType: OntologyActionType): string | undefined {
		return this.manifest.policies[actionType]?.operationId ?? this.manifest.actionTypes[actionType]?.operationId;
	}

	inferLifecycleStage(context: LifecycleInferenceContext): LifecycleStage {
		if (context.projectStatus === "project_archive") return "archived";
		if (context.archivePackageReady && context.collectedCount > 0) return "collection";
		if (context.archivePackageReady) return "packaging";
		if (context.precheckStatus && context.precheckStatus !== "passed") return "precheck";
		if (context.signingPending > 0) return "signing";
		if (context.reviewPending > 0) return "review";
		if (context.uncataloguedFiles > 0) return "cataloguing";
		if (context.compilationInProgress > 0) return "compilation";
		if (context.hasCatalogTemplate) return "template";
		return "setup";
	}

	filterActionsByPermission(userContext: UserContext, actionTypes: OntologyActionType[]): ActionPolicy[] {
		return actionTypes
			.map((actionType) => this.getActionPolicy(actionType))
			.filter((policy): policy is ActionPolicy => Boolean(policy))
			.filter((policy) => this.canExecuteAction(userContext, policy));
	}

	canExecuteAction(userContext: UserContext, policy: ActionPolicy): boolean {
		const userRoleRank = roleRank[userContext.systemRole] ?? 0;
		const requiredRoleRank = roleRank[policy.requiredRole] ?? Number.MAX_SAFE_INTEGER;
		if (userRoleRank >= requiredRoleRank && userRoleRank >= roleRank.tenant_admin) return true;
		if (userRoleRank < requiredRoleRank) return false;
		if (!policy.requiredProjectRole) return true;

		const userProjectRoleRank = userContext.projectRole ? (projectRoleRank[userContext.projectRole] ?? 0) : 0;
		const requiredProjectRoleRank = projectRoleRank[policy.requiredProjectRole] ?? Number.MAX_SAFE_INTEGER;
		return userProjectRoleRank >= requiredProjectRoleRank;
	}

	requireEvidence(output: AgentOutputDraft): boolean {
		if (output.kind !== "action") return true;
		if (!output.actionType) return true;
		const policy = this.getActionPolicy(output.actionType);
		if (!policy.evidenceRequired) return true;
		return output.evidenceRefs.length > 0;
	}
}

export const ontologyRuntime = new OntologyRuntime(ontologyManifest);
