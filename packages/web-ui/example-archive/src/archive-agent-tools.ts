import type { AgentTool } from "@earendil-works/pi-agent-core";
import { type Static, Type } from "typebox";
import type { ApiCallOptions, ApiClient, Project } from "./archive-api.js";
import { isReadOnlyOperationId, type ReadOnlyOperationId } from "./archive-operation-policy.js";
import type { ActionProposalView, IssueView, MetricView } from "./archive-ontology-analysis.js";
import type { EntityFormState, FormField } from "./app-state.js";
import type { EvidenceRef, LifecycleInferenceContext, LifecycleStage, OntologyActionType } from "./ontology-runtime.js";
import type { WorkspaceId } from "./workspace-definitions.js";

export interface ArchiveAgentSnapshot {
	workspace: {
		id: WorkspaceId;
		label: string;
		agentName: string;
		agentKind: string;
		actionType: OntologyActionType;
		ontologyScope: string[];
		primaryObjects: string[];
	};
	project?: {
		id: number;
		name: string;
		code?: string;
		status: Project["status"];
	};
	lifecycleStage: {
		id: LifecycleStage;
		label: string;
	};
	lifecycleContext: LifecycleInferenceContext;
	loadState: string;
	auth: {
		enabled: boolean;
		attempted: boolean;
		authenticated: boolean;
		message?: string;
	};
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

export interface ArchiveContextToolDetails {
	snapshot: ArchiveAgentSnapshot;
}

export interface ArchiveApiReadToolDetails {
	operationId: ReadOnlyOperationId;
	response: unknown;
}

const archiveContextSchema = Type.Object({
	includeApiErrors: Type.Optional(
	Type.Boolean({
			description: "是否在上下文快照中包含当前后端加载错误，默认包含。",
		}),
	),
});

const archiveApiReadSchema = Type.Object({
	operationId: Type.String({
		description: "只读后端 operationId。只需要当前页面状态时应先使用 archive_context。",
	}),
	pathParams: Type.Optional(Type.Record(Type.String(), Type.Union([Type.String(), Type.Number()]))),
	query: Type.Optional(Type.Record(Type.String(), Type.Union([Type.String(), Type.Number(), Type.Boolean()]))),
});

type ArchiveContextParams = Static<typeof archiveContextSchema>;
type ArchiveApiReadParams = Static<typeof archiveApiReadSchema>;

const generateReportSchema = Type.Object({
	title: Type.String({
		description: "报表标题",
	}),
	html: Type.String({
		description: "纯 HTML 片段内容，只包含 <div> 及内部标签，不含文档结构标签",
	}),
});

type GenerateReportParams = Static<typeof generateReportSchema>;

export interface GenerateReportToolDetails {
	title: string;
}

export function createGenerateReportTool(onReport: (html: string) => void): AgentTool<typeof generateReportSchema, GenerateReportToolDetails> {
	return {
		label: "Generate Report",
		name: "generate_report",
		description:
			"将生成的报表 HTML 渲染到页面主区域。当用户请求报表、统计图表、数据可视化、汇总表、分析报告时使用此工具。HTML 只能使用 <div> 及内部标签，不得包含 <!DOCTYPE>、<html>、<head>、<body> 等文档结构标签。",
		parameters: generateReportSchema,
		execute: async (_toolCallId: string, params: GenerateReportParams) => {
			onReport(params.html);
			return {
				content: [{ type: "text", text: `报表「${params.title}」已生成并渲染到页面主区域。` }],
				details: { title: params.title },
			};
		},
	};
}

const formFieldSchema = Type.Object({
	name: Type.String({ description: "字段名（对应 API 请求体属性名）" }),
	label: Type.String({ description: "表单显示标签" }),
	type: Type.Union([Type.Literal("text"), Type.Literal("number"), Type.Literal("date"), Type.Literal("select"), Type.Literal("textarea")], {
		description: "字段类型",
	}),
	required: Type.Boolean({ description: "是否必填" }),
	placeholder: Type.Optional(Type.String({ description: "占位提示文本" })),
	options: Type.Optional(Type.Array(Type.String(), { description: "select 类型的可选项列表" })),
});

const createEntitySchema = Type.Object({
	entityType: Type.String({ description: "实体类型标识，如 Project、Unit、Document 等" }),
	entityLabel: Type.String({ description: "实体中文名称，如 项目、单位工程、文档 等" }),
	operationId: Type.String({ description: "对应的 API operationId，如 createProject、createUnit 等" }),
	fields: Type.Array(formFieldSchema, { description: "表单字段定义列表" }),
});

type CreateEntityParams = Static<typeof createEntitySchema>;

export interface CreateEntityToolDetails {
	entityType: string;
	operationId: string;
}

export function createCreateEntityTool(
	apiClient: { call: (operationId: string, options?: { query?: Record<string, string | number | boolean | undefined> }) => Promise<unknown> },
	onFormOpen: (form: EntityFormState) => void,
): AgentTool<typeof createEntitySchema, CreateEntityToolDetails> {
	return {
		label: "Create Entity",
		name: "create_entity",
		description:
			"当用户意图创建业务实体（如项目、单位工程、文档、上传文件等）时，生成对应的表单定义并以弹窗形式展示给用户填写。根据本体模型定义字段类型和验证规则。对于 select 类型字段会自动从后端字典获取有效选项。",
		parameters: createEntitySchema,
		execute: async (_toolCallId: string, params: CreateEntityParams) => {
			const dictionaryMap = await loadDictionaries(apiClient);
			const fields: FormField[] = params.fields.map((f) => {
				const dictKey = `${params.entityType}.${f.name}`;
				const dictValues = dictionaryMap.get(dictKey) ?? dictionaryMap.get(f.name);
				const resolvedOptions = f.type === "select" && f.options && f.options.length > 0
					? f.options
					: dictValues ?? f.options;
				const resolvedType = resolvedOptions && resolvedOptions.length > 0 ? "select" : f.type;
				return {
					name: f.name,
					label: f.label,
					type: resolvedType,
					required: f.required,
					placeholder: f.placeholder,
					options: resolvedOptions,
					value: "",
					error: undefined,
				};
			});
			onFormOpen({
				entityType: params.entityType,
				entityLabel: params.entityLabel,
				operationId: params.operationId,
				fields,
				submitting: false,
				submitted: false,
			});
			return {
				content: [{ type: "text", text: `已为「${params.entityLabel}」生成创建表单，等待用户填写并提交。` }],
				details: { entityType: params.entityType, operationId: params.operationId },
			};
		},
	};
}

async function loadDictionaries(
	apiClient: { call: (operationId: string, options?: { query?: Record<string, string | number | boolean | undefined> }) => Promise<unknown> },
): Promise<Map<string, string[]>> {
	const map = new Map<string, string[]>();
	try {
		const result = await apiClient.call("listDictionaries");
		const dicts = Array.isArray(result) ? result : [];
		for (const dict of dicts) {
			if (!dict || typeof dict !== "object") continue;
			const code = (dict as Record<string, unknown>).code as string;
			const items = (dict as Record<string, unknown>).items;
			if (!code || !Array.isArray(items)) continue;
			const values = items
				.filter((item): item is Record<string, unknown> => item && typeof item === "object")
				.map((item) => String(item.name ?? item.code ?? ""));
			if (values.length > 0) map.set(code, values);
		}
	} catch {
	}
	try {
		const projects = await apiClient.call("listProjects");
		if (Array.isArray(projects)) {
			const types = [...new Set(projects.map((p: Record<string, unknown>) => p.type).filter(Boolean))] as string[];
			if (types.length > 0) map.set("type", types);
		}
	} catch {
	}
	return map;
}

export function createArchiveContextTool(getSnapshot: () => ArchiveAgentSnapshot): AgentTool<typeof archiveContextSchema, ArchiveContextToolDetails> {
	return {
		label: "Archive Context",
		name: "archive_context",
		description:
			"读取当前工程档案工作台上下文，包括项目、生命周期阶段、指标、阻塞项、证据、本体范围和动作草案。回答流程问题前先使用此工具。",
		parameters: archiveContextSchema,
		execute: async (_toolCallId: string, params: ArchiveContextParams) => {
			const snapshot = getSnapshot();
			const visibleSnapshot = params.includeApiErrors === false ? { ...snapshot, apiErrors: [] } : snapshot;
			return {
				content: [{ type: "text", text: JSON.stringify(visibleSnapshot, null, 2) }],
				details: { snapshot: visibleSnapshot },
			};
		},
	};
}

export function createArchiveApiReadTool(apiClient: ApiClient): AgentTool<typeof archiveApiReadSchema, ArchiveApiReadToolDetails> {
	return {
		label: "Archive API Read",
		name: "archive_api_read",
		description:
			"调用允许的只读后端接口读取工程档案数据。此工具不能创建、更新、提交、签章、审核、打包、归档或删除业务对象。",
		parameters: archiveApiReadSchema,
		executionMode: "parallel",
		execute: async (_toolCallId: string, params: ArchiveApiReadParams, signal?: AbortSignal) => {
			if (!isReadOnlyOperationId(params.operationId)) {
				throw new Error(`Operation ${params.operationId} is not available through archive_api_read because it is not read-only.`);
			}
			const options: ApiCallOptions = {
				pathParams: params.pathParams,
				query: params.query,
				signal,
			};
			const response = await apiClient.call(params.operationId, options);
			return {
				content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
				details: {
					operationId: params.operationId,
					response,
				},
			};
		},
	};
}
