import type { AgentTool } from "@earendil-works/pi-agent-core";
import { type Static, Type } from "typebox";
import type { ApiCallOptions, ApiClient, Project } from "./archive-api.js";
import { isReadOnlyOperationId, type ReadOnlyOperationId } from "./archive-operation-policy.js";
import type { ActionProposalView, IssueView, MetricView } from "./archive-ontology-analysis.js";
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
