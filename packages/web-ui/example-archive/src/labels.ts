import type { IssueSeverity, MetricTone } from "./archive-ontology-analysis.js";
import type { ConfirmationLevel, EvidenceSourceType, LifecycleStage } from "./ontology-runtime.js";
import { lifecycleStageOrder } from "./workspace-definitions.js";

const objectLabels: Record<string, string> = {
	API: "后端接口",
	Project: "项目",
	Unit: "单位工程",
	CatalogTemplateNode: "目录节点",
	CityArchiveCatalogNode: "城建档案目录",
	CompilationInstance: "编制实例",
	CompilationFormData: "编制表单",
	Document: "资料",
	UploadFile: "上传文件",
	UploadFileVersion: "文件版本",
	Review: "审核任务",
	SigningTask: "签章任务",
	SigningNode: "签章节点",
	Seal: "印章",
	CompliancePrecheck: "归档预检",
	ArchivePackage: "归档包",
	CollectedItem: "采集记录",
	OperationLog: "操作日志",
	AgentRunRecord: "智能体运行记录",
	ActionPolicy: "操作规则",
	EvidenceRef: "业务依据",
};

const statusLabels: Record<string, string> = {
	active: "进行中",
	project_archive: "已归档",
	pending: "待处理",
	processing: "处理中",
	running: "运行中",
	completed: "已完成",
	approved: "已通过",
	rejected: "已退回",
	returned: "已退回",
	ready: "可提交",
	submitted: "已提交",
	signed: "已签章",
	passed: "已通过",
	failed: "未通过",
	warning: "有风险",
	draft: "草稿",
	archived: "已归档",
};

const fieldLabels: Record<string, string> = {
	status: "状态",
	nodeId: "目录节点",
	nodeLabel: "目录节点",
	errorCount: "阻断项",
	warningCount: "警告项",
};

export function objectLabel(value?: string): string {
	if (!value) return "业务对象";
	return objectLabels[value] ?? value;
}

export function objectLabelList(values: readonly string[]): string {
	return values.map((value) => objectLabel(value)).join("、");
}

export function statusLabel(value?: string): string {
	if (!value) return "未知状态";
	return statusLabels[value] ?? (/[A-Za-z_]/.test(value) ? "其他状态" : value);
}

export function fieldLabel(value?: string): string {
	if (!value) return "关键记录";
	return fieldLabels[value] ?? (/[A-Za-z_]/.test(value) ? "关键记录" : value);
}

export function flowModeLabel(value?: string): string {
	if (value === "serial") return "顺序签章";
	if (value === "parallel") return "并行签章";
	if (!value) return "-";
	return /[A-Za-z_]/.test(value) ? "其他流程" : value;
}

export function confirmationLabel(level: ConfirmationLevel): string {
	if (level === "high") return "必须人工确认";
	if (level === "medium") return "需要经办人确认";
	if (level === "low") return "普通确认";
	return "无需确认";
}

export function roleLabel(value?: string): string {
	if (value === "tenant_admin") return "租户管理员";
	if (value === "tenant_user") return "平台用户";
	if (value === "project_admin") return "项目管理员";
	if (value === "data_admin") return "档案管理员";
	if (value === "data_clerk") return "资料经办人";
	return "具备相应权限的人员";
}

export function evidenceSourceLabel(value: EvidenceSourceType): string {
	if (value === "api") return "后端业务数据";
	if (value === "file_text") return "文件正文";
	if (value === "ocr") return "图片文字识别";
	if (value === "ontology_rule") return "业务规则";
	if (value === "history") return "历史记录";
	if (value === "user_confirmation") return "人工确认";
	return "智能推断";
}

export function issueTone(severity: IssueSeverity): MetricTone {
	if (severity === "blocking") return "red";
	if (severity === "warning") return "amber";
	return "blue";
}

export function stageState(stage: LifecycleStage, currentStage: LifecycleStage): string {
	const currentIndex = lifecycleStageOrder.indexOf(currentStage);
	const stageIndex = lifecycleStageOrder.indexOf(stage);
	if (stageIndex < currentIndex) return "done";
	if (stageIndex === currentIndex) return "current";
	return "";
}
