import type { AgentTool } from "@earendil-works/pi-agent-core";
import { type Static, Type } from "typebox";
import type { ApiCallOptions, ApiClient } from "./archive-api.js";

export interface ArchiveAgentSnapshot {
	workspace: {
		id: string;
		label: string;
		agentName: string;
		agentKind: string;
		actionType: string;
		ontologyScope: string[];
		primaryObjects: string[];
	};
	project?: {
		id: number;
		name: string;
		code?: string;
		status: string;
	};
	lifecycleStage: {
		id: string;
		label: string;
	};
	loadState: string;
	auth: {
		enabled: boolean;
		attempted: boolean;
		authenticated: boolean;
		message?: string;
	};
	metrics: Array<{
		label: string;
		value: string;
		description: string;
		tone: string;
	}>;
	issues: Array<{
		title: string;
		description: string;
		severity: string;
		objectType: string;
		objectId: string;
		suggestedAction?: string;
	}>;
	evidenceRefs: Array<{
		id: string;
		sourceType: string;
		objectType?: string;
		objectId?: string | number;
		field?: string;
		excerpt?: string;
		confidence?: number;
		createdAt: string;
	}>;
	actionProposal: {
		actionType: string;
		operationId?: string;
		label: string;
		confirmationLevel: string;
		requiredRole: string;
		requiredProjectRole?: string;
		sideEffects: string[];
		evidenceCount: number;
		canExecute: boolean;
	};
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
	operationId: string;
	response: unknown;
}

const archiveContextSchema = Type.Object({
	includeApiErrors: Type.Optional(
		Type.Boolean({
			description: "Include current backend loading errors in the context snapshot. Defaults to true.",
		}),
	),
});

const archiveApiReadSchema = Type.Object({
	operationId: Type.String({
		description: "Read-only backend operationId. Use archive_context first when you only need current page state.",
	}),
	pathParams: Type.Optional(Type.Record(Type.String(), Type.Union([Type.String(), Type.Number()]))),
	query: Type.Optional(Type.Record(Type.String(), Type.Union([Type.String(), Type.Number(), Type.Boolean()]))),
});

type ArchiveContextParams = Static<typeof archiveContextSchema>;
type ArchiveApiReadParams = Static<typeof archiveApiReadSchema>;

const READ_ONLY_OPERATION_IDS = new Set([
	"healthCheck",
	"listProjects",
	"getProject",
	"getProjectStats",
	"listUnits",
	"getUnit",
	"listDocuments",
	"getDocument",
	"listUploadFiles",
	"listCompilationInstances",
	"listReviews",
	"listReviewHistory",
	"listSigningTasks",
	"getSigningTask",
	"getLatestPrecheck",
	"listArchivePackages",
	"listCollectionItems",
]);

export function createArchiveContextTool(getSnapshot: () => ArchiveAgentSnapshot): AgentTool<typeof archiveContextSchema, ArchiveContextToolDetails> {
	return {
		label: "Archive Context",
		name: "archive_context",
		description:
			"Read the current engineering archive workspace context: selected project, lifecycle stage, metrics, issues, evidence refs, ontology scope, and action proposal. Use this before answering workflow questions.",
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
			"Call approved read-only backend APIs for engineering archive data. This tool cannot create, update, submit, sign, review, package, archive, or delete business objects.",
		parameters: archiveApiReadSchema,
		executionMode: "parallel",
		execute: async (_toolCallId: string, params: ArchiveApiReadParams, signal?: AbortSignal) => {
			if (!READ_ONLY_OPERATION_IDS.has(params.operationId)) {
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
