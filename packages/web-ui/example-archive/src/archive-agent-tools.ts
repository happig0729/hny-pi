import type { AgentTool } from "@earendil-works/pi-agent-core";
import { type Static, Type } from "typebox";
import type { ApiCallOptions, ApiClient, Project } from "./archive-api.js";
import { isReadOnlyOperationId, type ReadOnlyOperationId } from "./archive-operation-policy.js";
import type { ActionProposalView, IssueView, MetricView } from "./archive-ontology-analysis.js";
import type { EntityFormState, FormField, VisualizationState } from "./app-state.js";
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

export function createGenerateReportTool(
	onReport: (html: string) => void,
	onReportMeta: (prompt: string, toolName: string, toolParams: string) => void,
): AgentTool<typeof generateReportSchema, GenerateReportToolDetails> {
	return {
		label: "Generate Report",
		name: "generate_report",
		description:
			"将生成的报表 HTML 渲染到页面主区域。当用户请求报表、统计图表、数据可视化、汇总表、分析报告时使用此工具。HTML 只能使用 <div> 及内部标签，不得包含 <!DOCTYPE>、<html>、<head>、<body> 等文档结构标签。",
		parameters: generateReportSchema,
		execute: async (_toolCallId: string, params: GenerateReportParams) => {
			onReport(params.html);
			onReportMeta("", "generate_report", JSON.stringify(params));
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

const ALLOWED_CHART_TYPES = new Set(["bar", "line", "pie", "scatter", "radar", "gauge", "treemap", "heatmap", "sankey", "funnel"]);

const visualizeDataSchema = Type.Object({
	title: Type.String({ description: "图表标题" }),
	chartType: Type.String({
		description: "ECharts 图表类型，如 bar（柱状图）、line（折线图）、pie（饼图）、scatter（散点图）、radar（雷达图）、gauge（仪表盘）、treemap（矩形树图）",
	}),
	optionJson: Type.String({
		description: "ECharts option 对象的 JSON 字符串，定义图表的完整配置",
	}),
	description: Type.Optional(Type.String({
		description: "图表下方的文字说明，解释数据含义或关键发现",
	})),
});

type VisualizeDataParams = Static<typeof visualizeDataSchema>;

export interface VisualizeDataToolDetails {
	title: string;
	chartType: string;
}

export function createVisualizeDataTool(onVisualize: (state: VisualizationState) => void): AgentTool<typeof visualizeDataSchema, VisualizeDataToolDetails> {
	return {
		label: "Visualize Data",
		name: "visualize_data",
		description:
			"当查询结果适合用图表可视化展示时，生成 ECharts 图表配置并以弹窗形式展示。支持柱状图、折线图、饼图、散点图、雷达图、仪表盘等常见图表类型。",
		parameters: visualizeDataSchema,
		execute: async (_toolCallId: string, params: VisualizeDataParams) => {
			const errors: string[] = [];
			if (!params.title?.trim()) errors.push("图表标题不能为空");
			if (!params.chartType?.trim()) errors.push("图表类型不能为空");
			if (!params.optionJson?.trim()) errors.push("图表配置不能为空");
			if (params.chartType && !ALLOWED_CHART_TYPES.has(params.chartType)) {
				errors.push(`不支持的图表类型「${params.chartType}」，可选：${[...ALLOWED_CHART_TYPES].join("、")}`);
			}
			let parsed: Record<string, unknown> | undefined;
			if (params.optionJson) {
				try {
					parsed = JSON.parse(params.optionJson);
					if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
						errors.push("optionJson 必须是一个有效的 JSON 对象");
					} else if (!parsed.series && !parsed.dataset) {
						errors.push("图表配置缺少 series 或 dataset，无法渲染数据");
					}
				} catch {
					errors.push("optionJson 不是合法的 JSON 字符串");
				}
			}
			if (errors.length > 0) {
				return {
					content: [{ type: "text", text: `可视化配置校验失败：\n${errors.map((e) => "- " + e).join("\n")}\n\n请修正后重新调用。` }],
					details: { title: params.title ?? "校验失败", chartType: params.chartType ?? "" },
					isError: true,
				} as { content: { type: "text"; text: string }[]; details: VisualizeDataToolDetails; isError: boolean };
			}
			const html = buildEChartsHtml(params.title, params.chartType, params.optionJson, params.description);
			onVisualize({ title: params.title, chartHtml: html });
			return {
				content: [{ type: "text", text: `已生成「${params.title}」可视化图表，弹窗已展示给用户。` }],
				details: { title: params.title, chartType: params.chartType },
			};
		},
	};
}

function buildEChartsHtml(title: string, chartType: string, optionJson: string, description?: string): string {
	let option: Record<string, unknown>;
	try {
		option = JSON.parse(optionJson);
	} catch {
		return buildErrorHtml(title, "图表数据解析失败", "传入的配置不是有效的 JSON 格式。请检查数据格式后重试。");
	}
	if (!option.series && !option.dataset) {
		return buildErrorHtml(title, "图表配置不完整", "缺少 series（数据系列）或 dataset（数据集）配置，无法渲染图表。");
	}
	const escapedOption = JSON.stringify(option).replace(/</g, "\\u003c").replace(/<\/script>/gi, "<\\/script>");
	const descHtml = description ? `<div class="chart-desc">${escapeHtml(description)}</div>` : "";
	return `<div class="viz-container">
  <div class="viz-title">${escapeHtml(title)}</div>
  <div id="chart" style="width:100%;height:420px;"></div>
  <div id="chart-error" style="display:none;padding:24px;text-align:center;color:#b84035;"></div>
  ${descHtml}
</div>
<script src="https://cdn.jsdelivr.net/npm/echarts@5.6.0/dist/echarts.min.js" onerror="document.getElementById('chart-error').style.display='block';document.getElementById('chart-error').textContent='ECharts 组件加载失败，请检查网络连接后刷新页面。';document.getElementById('chart').style.display='none';"><\/script>
<script>
(function(){
  try {
    var el = document.getElementById('chart');
    if(!el || typeof echarts === 'undefined'){
      document.getElementById('chart-error').style.display='block';
      document.getElementById('chart-error').textContent='ECharts 组件未能加载，请检查网络连接。';
      el.style.display='none';
      return;
    }
    var chart = echarts.init(el);
    var option = ${escapedOption};
    if(!option.title) option.title = {text: ${JSON.stringify(title)}};
    if(!option.tooltip) option.tooltip = {trigger: '${chartType === "pie" || chartType === "gauge" || chartType === "treemap" || chartType === "funnel" ? "item" : "axis"}'};
    chart.setOption(option);
    window.addEventListener('resize', function(){ chart.resize(); });
  } catch(e) {
    var errEl = document.getElementById('chart-error');
    errEl.style.display = 'block';
    errEl.textContent = '图表渲染出错：' + (e.message || '未知错误');
    document.getElementById('chart').style.display = 'none';
  }
})();
<\/script>`;
}

function buildErrorHtml(title: string, errorTitle: string, errorMessage: string): string {
	return `<div class="viz-container">
  <div class="viz-title">${escapeHtml(title)}</div>
  <div style="padding:32px;text-align:center;">
    <div style="font-size:48px;color:#b84035;margin-bottom:16px;">⚠</div>
    <div style="font-size:16px;font-weight:700;color:#b84035;margin-bottom:8px;">${escapeHtml(errorTitle)}</div>
    <div style="font-size:14px;color:#66716b;line-height:1.6;">${escapeHtml(errorMessage)}</div>
  </div>
</div>`;
}

function escapeHtml(text: string): string {
	return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const runPinnedReportSchema = Type.Object({
	pinnedReportId: Type.String({ description: "已固化报表的 ID" }),
});

type RunPinnedReportParams = Static<typeof runPinnedReportSchema>;

export function createRunPinnedReportTool(
	onReport: (html: string) => void,
	onReportMeta: (prompt: string, toolName: string, toolParams: string) => void,
): AgentTool<typeof runPinnedReportSchema, Record<string, never>> {
	return {
		label: "Run Pinned Report",
		name: "run_pinned_report",
		description: "一键调用已固化的报表功能，无需重新配置参数即可生成相同样式的报表。通过 ID 指定要运行的固化报表。",
		parameters: runPinnedReportSchema,
		execute: async (_toolCallId: string, params: RunPinnedReportParams) => {
			const { getPinnedReport } = await import("./pinned-store.js");
			const report = await getPinnedReport(params.pinnedReportId);
			if (!report) {
				return {
					content: [{ type: "text", text: `未找到 ID 为「${params.pinnedReportId}」的固化报表，可能已被删除。` }],
					isError: true,
					details: {},
				};
			}
			onReport(report.reportHtml);
			onReportMeta(report.agentPrompt, "run_pinned_report", JSON.stringify(params));
			return {
				content: [{ type: "text", text: `已运行固化报表「${report.name}」并渲染到页面主区域。` }],
				details: {},
			};
		},
	};
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
