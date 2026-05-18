import type { ArchiveDashboardData } from "./archive-api.js";
import type { AuthContext } from "./auth-types.js";
import {
	type ActionPolicy,
	type EvidenceRef,
	type LifecycleInferenceContext,
	type LifecycleStage,
	type OntologyActionType,
	type OntologyObjectType,
	type UserContext,
	ontologyManifest,
	ontologyRuntime,
} from "./ontology-runtime.js";
import { getWorkspace, type WorkspaceId } from "./workspace-definitions.js";

export type MetricTone = "green" | "blue" | "amber" | "red";
export type IssueSeverity = "info" | "warning" | "blocking";
export type IssueObjectType = OntologyObjectType | "API";

export interface MetricView {
	label: string;
	value: string;
	description: string;
	tone: MetricTone;
}

export interface IssueView {
	title: string;
	description: string;
	severity: IssueSeverity;
	objectType: IssueObjectType;
	objectId: string;
	suggestedAction?: string;
}

export interface ActionProposalView {
	actionType: OntologyActionType;
	operationId?: string;
	label: string;
	confirmationLevel: ActionPolicy["confirmationLevel"];
	requiredRole: string;
	requiredProjectRole?: string;
	sideEffects: string[];
	evidenceCount: number;
	canExecute: boolean;
	userCanExecute: boolean;
	evidenceRequired: boolean;
	auditRequired: boolean;
	affectedCount?: number;
	affectedLabel?: string;
}

export interface ArchiveOntologyAnalysis {
	lifecycleContext: LifecycleInferenceContext;
	lifecycleStage: LifecycleStage;
	lifecycleStageLabel: string;
	metrics: MetricView[];
	issues: IssueView[];
	evidenceRefs: EvidenceRef[];
	actionProposal: ActionProposalView;
	counts: {
		projects: number;
		units: number;
		documents: number;
		uploads: number;
		compilations: number;
		reviews: number;
		signingTasks: number;
		archivePackages: number;
		collectionItems: number;
		apiErrors: number;
	};
	apiErrors: string[];
}

export function analyzeArchiveWorkspace(workspaceId: WorkspaceId, data: ArchiveDashboardData, authContext?: AuthContext): ArchiveOntologyAnalysis {
	const workspace = getWorkspace(workspaceId);
	const lifecycleContext = buildLifecycleContext(data);
	const lifecycleStage = ontologyRuntime.inferLifecycleStage(lifecycleContext);
	const evidenceRefs = getEvidenceRefs(workspaceId, data);
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
		actionProposal: buildActionProposal(workspace.actionType, evidenceRefs.length, data, userContext),
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

export function analyzeEmptyWorkspace(workspaceId: WorkspaceId): ArchiveOntologyAnalysis {
	const workspace = getWorkspace(workspaceId);
	const lifecycleStage = ontologyRuntime.inferLifecycleStage(workspace.emptyLifecycleContext);

	return {
		lifecycleContext: workspace.emptyLifecycleContext,
		lifecycleStage,
		lifecycleStageLabel: getLifecycleStageLabel(lifecycleStage),
		metrics: [],
		issues: [],
		evidenceRefs: [],
		actionProposal: buildActionProposal(workspace.actionType, 0, undefined),
		counts: {
			projects: 0,
			units: 0,
			documents: 0,
			uploads: 0,
			compilations: 0,
			reviews: 0,
			signingTasks: 0,
			archivePackages: 0,
			collectionItems: 0,
			apiErrors: 0,
		},
		apiErrors: [],
	};
}

function getLifecycleStageLabel(stage: LifecycleStage): string {
	return ontologyManifest.lifecycle.stages.find((item) => item.id === stage)?.label ?? stage;
}

function statusLabel(value?: string): string {
	if (value === "active") return "进行中";
	if (value === "project_archive") return "已归档";
	if (value === "pending") return "待处理";
	if (value === "draft") return "草稿";
	if (value === "drafting") return "编制中";
	if (value === "returned") return "已退回";
	if (value === "approved") return "已通过";
	if (value === "rejected") return "已退回";
	if (value === "completed") return "已完成";
	if (value === "passed") return "已通过";
	if (value === "failed") return "未通过";
	if (value === "warning") return "有风险";
	if (value === "ready") return "可提交";
	if (value === "submitted") return "已提交";
	if (!value) return "未知状态";
	return /[A-Za-z_]/.test(value) ? "其他状态" : value;
}

function buildLifecycleContext(data: ArchiveDashboardData): LifecycleInferenceContext {
	return {
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
}

function getMetrics(workspaceId: WorkspaceId, data: ArchiveDashboardData, evidenceCount: number): MetricView[] {
	const approvedDocuments = data.documents.filter((document) => document.status === "approved").length;
	const pendingUploads = data.uploads.filter((file) => file.status === "pending").length;
	const returnedUploads = data.uploads.filter((file) => file.status === "returned").length;
	const pendingSigningTasks = data.signingTasks.filter((task) => task.status !== "completed").length;
	const latestPrecheck = data.latestPrecheck;

	if (workspaceId === "intake") {
		return [
			{ label: "上传文件", value: String(data.uploads.length), description: "来自后端上传文件数据", tone: "blue" },
			{ label: "待著录", value: String(pendingUploads), description: "仍处于待处理状态的上传文件", tone: pendingUploads > 0 ? "amber" : "green" },
			{ label: "退回文件", value: String(returnedUploads), description: "已退回、需要整改的上传文件", tone: returnedUploads > 0 ? "red" : "green" },
		];
	}
	if (workspaceId === "compile") {
		return [
			{ label: "编制实例", value: String(data.compilations.length), description: "来自后端编制实例数据", tone: "blue" },
			{ label: "在线资料", value: String(data.documents.filter((document) => document.type === "online").length), description: "当前项目的在线资料", tone: "green" },
			{ label: "草稿资料", value: String(data.documents.filter((document) => document.status === "draft").length), description: "仍处于草稿状态的资料", tone: "amber" },
		];
	}
	if (workspaceId === "review") {
		return [
			{ label: "待审核", value: String(data.reviews.length), description: "当前仍需处理的审核任务", tone: data.reviews.length > 0 ? "amber" : "green" },
			{ label: "已通过资料", value: String(approvedDocuments), description: "审核已通过的资料数量", tone: "green" },
			{ label: "被退回资料", value: String(data.documents.filter((document) => document.status === "rejected").length), description: "审核退回、需要整改的资料", tone: "red" },
		];
	}
	if (workspaceId === "signing") {
		return [
			{ label: "签章任务", value: String(data.signingTasks.length), description: "来自后端签章任务数据", tone: "blue" },
			{ label: "未完成", value: String(pendingSigningTasks), description: "尚未完成的签章任务", tone: pendingSigningTasks > 0 ? "amber" : "green" },
			{ label: "已完成", value: String(data.signingTasks.length - pendingSigningTasks), description: "已经完成的签章任务", tone: "green" },
		];
	}
	if (workspaceId === "archive") {
		return [
			{ label: "预检状态", value: latestPrecheck ? statusLabel(latestPrecheck.status) : "无", description: "最近一次归档预检结果", tone: latestPrecheck?.status === "passed" ? "green" : latestPrecheck ? "red" : "blue" },
			{ label: "归档包", value: String(data.archivePackages.length), description: "当前项目已生成的归档包", tone: data.archivePackages.length > 0 ? "green" : "blue" },
			{ label: "采集项", value: String(data.collectionItems.length), description: "当前项目已采集的归档项", tone: data.collectionItems.length > 0 ? "green" : "blue" },
		];
	}
	if (workspaceId === "governance") {
		return [
			{ label: "接口异常", value: String(data.errors.length), description: "页面真实接口加载错误数", tone: data.errors.length > 0 ? "amber" : "green" },
			{ label: "操作规则", value: String(Object.keys(ontologyManifest.policies).length), description: "已接入的本体操作规则数量", tone: "blue" },
			{ label: "业务依据", value: String(evidenceCount), description: "由本体分析模块从后端数据推导", tone: "green" },
		];
	}

	if (workspaceId === "cockpit") {
		const project = data.selectedProject;
		if (!project) {
			return [{ label: "项目数", value: String(data.projects.length), description: "当前租户下的工程项目", tone: data.projects.length > 0 ? "blue" : "amber" }];
		}
		const memberCount = data.members.length;
		const unitCount = data.units.length;
		return [
			{
				label: "项目状态",
				value: project.status === "project_archive" ? "已归档" : "进行中",
				description: `${project.name} · ${project.type ?? "未分类"} · ${project.code ?? "无编号"}`,
				tone: project.status === "project_archive" ? "green" : "blue",
			},
			{ label: "单位工程", value: String(unitCount), description: "当前项目关联的单位工程/标段", tone: unitCount > 0 ? "green" : "amber" },
			{ label: "项目成员", value: String(memberCount), description: "当前项目的团队成员", tone: memberCount > 0 ? "green" : "amber" },
			{
				label: "参建单位",
				value: [project.buildingUnit, project.constructionUnit, project.supervisionUnit, project.designUnit].filter(Boolean).length + " 家",
				description: [project.buildingUnit && `建设:${project.buildingUnit}`, project.constructionUnit && `施工:${project.constructionUnit}`, project.supervisionUnit && `监理:${project.supervisionUnit}`, project.designUnit && `设计:${project.designUnit}`].filter(Boolean).join("、") || "未配置",
				tone: (project.buildingUnit || project.constructionUnit) ? "green" : "amber",
			},
			{ label: "档案完成率", value: `${data.stats ? Math.round((approvedDocuments / (data.stats.totalDocuments || 1)) * 100) : 0}%`, description: "当前项目档案编制进度", tone: "blue" },
		];
	}

	const totalDocuments = data.stats?.totalDocuments ?? data.documents.length;
	const completion = totalDocuments > 0 ? Math.round((approvedDocuments / totalDocuments) * 100) : 0;
	return [
		{ label: "档案完成率", value: `${completion}%`, description: `${approvedDocuments} / ${totalDocuments} 个资料已通过`, tone: completion >= 80 ? "green" : "amber" },
		{ label: "待审核", value: String(data.stats?.pendingReviews ?? data.reviews.length), description: "当前仍需处理的审核任务", tone: data.reviews.length > 0 ? "amber" : "green" },
		{ label: "单位工程", value: String(data.stats?.totalUnits ?? data.units.length), description: "当前项目关联的单位工程", tone: "blue" },
	];
}

function getIssues(workspaceId: WorkspaceId, data: ArchiveDashboardData): IssueView[] {
	const issues: IssueView[] = [];
	if (workspaceId === "cockpit") {
		const project = data.selectedProject;
		if (project) {
			if (!project.code) {
				issues.push({
					title: "项目缺少编号",
					description: "项目未设置编号，可能影响档案目录编码。",
					severity: "info",
					objectType: "Project",
					objectId: String(project.id),
					suggestedAction: "补充编号",
				});
			}
			if (!project.buildingUnit) {
				issues.push({
					title: "建设单位未指定",
					description: "项目缺少建设单位信息，影响工程档案来源认定。",
					severity: "warning",
					objectType: "Project",
					objectId: String(project.id),
					suggestedAction: "补充建设单位",
				});
			}
			if (data.units.length === 0) {
				issues.push({
					title: "尚未创建单位工程",
					description: "项目还没有单位工程/标段。工程项目必须以单位工程为基本管理单元。",
					severity: "blocking",
					objectType: "Project",
					objectId: String(project.id),
					suggestedAction: "创建单位工程",
				});
			}
			if (data.members.length === 0) {
				issues.push({
					title: "项目尚无成员",
					description: "没有项目成员。添加成员后才能分配编制、审核、签章等任务。",
					severity: "warning",
					objectType: "ProjectMember",
					objectId: String(project.id),
					suggestedAction: "邀请成员",
				});
			}
		}
	}

	if (workspaceId === "intake" || workspaceId === "cockpit") {
		for (const file of data.uploads.filter((item) => item.status === "pending" || !item.nodeId)) {
			issues.push({
				title: file.title || file.fileName,
				description: file.nodeId ? "文件仍处于待处理状态。" : "文件未绑定目录节点。",
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
				title: review.documentTitle ?? `审核任务 #${review.id}`,
				description: "审核任务仍处于待处理状态。",
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
				title: task.docName ?? task.documentTitle ?? `签章任务 #${task.id ?? "-"}`,
				description: `签章任务状态为${statusLabel(task.status)}。`,
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
				description: `阻断项 ${precheck.errorCount ?? 0} 个，警告项 ${precheck.warningCount ?? 0} 个。`,
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
			excerpt: `预检状态：${statusLabel(data.latestPrecheck.status)}；阻断项：${data.latestPrecheck.errorCount ?? 0} 个`,
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
				excerpt: `${file.fileName}：状态为${statusLabel(file.status)}；目录节点为${file.nodeLabel ?? file.nodeId ?? "未著录"}`,
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
				excerpt: `${review.documentTitle ?? review.documentId}：状态为${statusLabel(review.status)}`,
				confidence: 1,
				createdAt: review.updatedAt ?? review.createdAt ?? new Date().toISOString(),
			});
		}
	}
	return refs;
}

function buildActionProposal(actionType: OntologyActionType, evidenceCount: number, data?: ArchiveDashboardData, userContext?: UserContext): ActionProposalView {
	const action = ontologyManifest.actionTypes[actionType];
	const policy = ontologyRuntime.getActionPolicy(actionType);
	const affected = computeAffectedCount(actionType, data);
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
		canExecute: userCanExecute && (evidenceCount > 0 || !policy.evidenceRequired),
		userCanExecute,
		evidenceRequired: policy.evidenceRequired,
		auditRequired: policy.auditRequired,
		affectedCount: affected?.count,
		affectedLabel: affected?.label,
	};
}

interface AffectedCount {
	count: number;
	label: string;
}

function computeAffectedCount(actionType: OntologyActionType, data?: ArchiveDashboardData): AffectedCount | undefined {
	if (!data) return undefined;

	switch (actionType) {
		case "bulkSubmitUploadFiles": {
			const pending = data.uploads.filter((u) => u.status === "pending");
			return { count: pending.length, label: "待提交文件" };
		}
		case "rejectReview": {
			const pending = data.reviews.filter((r) => r.status === "pending");
			return { count: pending.length, label: "待审核记录" };
		}
		case "runPrecheck":
			return { count: 1, label: "预检任务" };
		case "packageProject": {
			const readyPackages = data.archivePackages.filter((p) => p.status === "ready" || p.status === "generating");
			return { count: readyPackages.length || 1, label: "归档包" };
		}
		case "createSigningTask":
			return { count: 1, label: "签章任务" };
		case "updateCompilationFormData": {
			const drafting = data.compilations.filter((c) => c.status === "drafting");
			return { count: drafting.length, label: "编制实例" };
		}
		case "createProject":
			return { count: 1, label: "项目" };
		case "createUnit":
			return { count: 1, label: "单位工程" };
		case "archiveProject":
			return { count: 1, label: "项目" };
		default:
			return undefined;
	}
}
