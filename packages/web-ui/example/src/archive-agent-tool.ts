import type { AgentTool } from "@earendil-works/pi-agent-core";
import { API_ENDPOINTS, type ApiEndpoint } from "@earendil-works/pi-web-ui";
import { type Static, Type } from "typebox";

const ENDPOINTS: Record<string, ApiEndpoint> = API_ENDPOINTS;

const archiveApiSchema = Type.Object({
	mode: Type.Union(
		[Type.Literal("list_operations"), Type.Literal("describe_operation"), Type.Literal("call_operation")],
		{
			description:
				"Use list_operations to discover APIs, describe_operation to inspect one API, and call_operation to execute it.",
		},
	),
	keyword: Type.Optional(
		Type.String({ description: "Optional operationId, tag, path, or summary keyword for list_operations." }),
	),
	tag: Type.Optional(Type.String({ description: "Optional OpenAPI tag filter for list_operations." })),
	operationId: Type.Optional(Type.String({ description: "OpenAPI operationId to describe or call." })),
	pathParams: Type.Optional(Type.Record(Type.String(), Type.Union([Type.String(), Type.Number()]))),
	query: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
	body: Type.Optional(Type.Unknown({ description: "JSON request body for operations with requestBody." })),
	confirmationKey: Type.Optional(
		Type.String({
			description:
				"Required only for write/destructive calls after the user clicked an A2UI archive.confirmOperation action for the exact operation payload.",
		}),
	),
});

export type ArchiveApiParams = Static<typeof archiveApiSchema>;

export interface ArchiveOperationRequest {
	operationId: string;
	pathParams?: Record<string, string | number>;
	query?: Record<string, unknown>;
	body?: unknown;
}

export interface ArchiveOperationDetails {
	operationId: string;
	method: string;
	path: string;
	tag: string;
	summary: string;
	risk: ArchiveOperationRisk;
	pathParams: ApiEndpoint["params"];
	queryParams: ApiEndpoint["params"];
	hasRequestBody: boolean;
}

export interface ArchiveApiResult {
	mode: ArchiveApiParams["mode"];
	operations?: ArchiveOperationDetails[];
	operation?: ArchiveOperationDetails;
	request?: {
		method: string;
		path: string;
		url: string;
	};
	status?: number;
	statusText?: string;
	responseBody?: unknown;
	error?: string;
	requiresConfirmation?: boolean;
	confirmationKey?: string;
}

export type ArchiveOperationRisk = "read" | "write" | "destructive";

export interface ArchiveApiToolOptions {
	baseUrl: string;
	getAuthToken: () => string | undefined;
	consumeConfirmedOperation: (confirmationKey: string, request: ArchiveOperationRequest) => boolean;
}

const DESTRUCTIVE_WORDS = ["delete", "remove", "revoke", "reject", "reset", "archive", "disable", "logout"];

export function createArchiveApiTool(
	options: ArchiveApiToolOptions,
): AgentTool<typeof archiveApiSchema, ArchiveApiResult> {
	return {
		label: "Archive API",
		name: "archive_api",
		description: `Discover and call Archive Manager backend APIs from the OpenAPI operation catalog.

Use this tool for all Archive Manager data and operations. Do not guess URLs.

Modes:
- list_operations: find operationId values by keyword or tag.
- describe_operation: inspect method, path, params, and risk for one operationId.
- call_operation: execute one operation.

Safety:
- GET operations are read-only.
- POST/PUT/DELETE and lifecycle operations are write/destructive.
- A write/destructive call requires a confirmationKey that came from a user-clicked A2UI archive.confirmOperation action for the exact operationId/pathParams/query/body.`,
		parameters: archiveApiSchema,
		execute: async (_toolCallId: string, params: ArchiveApiParams, signal?: AbortSignal) => {
			if (signal?.aborted) throw new Error("Archive API call aborted");

			if (params.mode === "list_operations") {
				const operations = listOperations(params.keyword, params.tag);
				return {
					content: [{ type: "text", text: formatOperationList(operations) }],
					details: { mode: params.mode, operations },
				};
			}

			if (!params.operationId) {
				return createErrorResult(params.mode, "operationId is required for this mode.");
			}

			const endpoint = ENDPOINTS[params.operationId];
			if (!endpoint) {
				return createErrorResult(params.mode, `Unknown operationId: ${params.operationId}`);
			}

			const operation = describeOperation(params.operationId, endpoint);
			if (params.mode === "describe_operation") {
				return {
					content: [{ type: "text", text: formatOperationDetails(operation) }],
					details: { mode: params.mode, operation },
				};
			}

			const request: ArchiveOperationRequest = {
				operationId: params.operationId,
				pathParams: params.pathParams,
				query: params.query,
				body: params.body,
			};

			if (operation.risk !== "read") {
				if (!params.confirmationKey || !options.consumeConfirmedOperation(params.confirmationKey, request)) {
					const confirmationKey = params.confirmationKey ?? createConfirmationKey();
					return {
						content: [
							{
								type: "text",
								text: `Confirmation required before ${operation.method} ${operation.path}. Render an A2UI confirmation surface with action name "archive.confirmOperation" and confirmationKey "${confirmationKey}".`,
							},
						],
						details: {
							mode: params.mode,
							operation,
							requiresConfirmation: true,
							confirmationKey,
						},
					};
				}
			}

			return callOperation(options, operation, request, signal);
		},
	};
}

export function describeArchiveOperation(operationId: string): ArchiveOperationDetails | undefined {
	const endpoint = ENDPOINTS[operationId];
	return endpoint ? describeOperation(operationId, endpoint) : undefined;
}

export function buildArchiveOperationFingerprint(request: ArchiveOperationRequest): string {
	return stableStringify({
		operationId: request.operationId,
		pathParams: request.pathParams ?? {},
		query: request.query ?? {},
		body: request.body ?? null,
	});
}

export function readArchiveOperationRequest(
	value: unknown,
): { confirmationKey: string; request: ArchiveOperationRequest } | undefined {
	if (!isRecord(value)) return undefined;
	const operationId = getString(value.operationId);
	const confirmationKey = getString(value.confirmationKey);
	if (!operationId || !confirmationKey) return undefined;

	const pathParams = readStringNumberRecord(value.pathParams);
	const query = readRecord(value.query);
	const body = value.body !== undefined ? value.body : readJsonString(value.bodyJson);

	return {
		confirmationKey,
		request: {
			operationId,
			pathParams,
			query,
			body,
		},
	};
}

function listOperations(keyword?: string, tag?: string): ArchiveOperationDetails[] {
	const normalizedKeyword = keyword?.trim().toLowerCase();
	const normalizedTag = tag?.trim().toLowerCase();

	return Object.entries(ENDPOINTS)
		.map(([operationId, endpoint]) => describeOperation(operationId, endpoint))
		.filter((operation) => {
			if (normalizedTag && operation.tag.toLowerCase() !== normalizedTag) return false;
			if (!normalizedKeyword) return true;
			const haystack =
				`${operation.operationId} ${operation.method} ${operation.path} ${operation.tag} ${operation.summary}`.toLowerCase();
			return haystack.includes(normalizedKeyword);
		})
		.slice(0, 40);
}

function describeOperation(operationId: string, endpoint: ApiEndpoint): ArchiveOperationDetails {
	return {
		operationId,
		method: endpoint.method,
		path: endpoint.path,
		tag: endpoint.tag,
		summary: endpoint.summary,
		risk: getOperationRisk(operationId, endpoint),
		pathParams: endpoint.params.filter((param) => param.in === "path"),
		queryParams: endpoint.params.filter((param) => param.in === "query"),
		hasRequestBody: endpoint.hasBody,
	};
}

function getOperationRisk(operationId: string, endpoint: ApiEndpoint): ArchiveOperationRisk {
	if (endpoint.method === "GET") return "read";
	if (endpoint.method === "DELETE") return "destructive";

	const normalizedId = operationId.toLowerCase();
	if (DESTRUCTIVE_WORDS.some((word) => normalizedId.includes(word))) {
		return "destructive";
	}
	return "write";
}

async function callOperation(
	options: ArchiveApiToolOptions,
	operation: ArchiveOperationDetails,
	request: ArchiveOperationRequest,
	signal?: AbortSignal,
) {
	const path = buildPath(operation, request.pathParams);
	if (!path.ok) {
		return createErrorResult("call_operation", path.error, operation);
	}

	const url = buildUrl(options.baseUrl, operation, path.value, request.query);
	const headers: Record<string, string> = {};
	if (operation.hasRequestBody && !(request.body instanceof FormData)) {
		headers["Content-Type"] = "application/json";
	}

	const token = options.getAuthToken();
	if (token && operation.tag !== "auth") {
		headers.Authorization = `Bearer ${token}`;
	}

	const response = await fetch(url, {
		method: operation.method,
		headers,
		body: operation.hasRequestBody && request.body !== undefined ? serializeBody(request.body) : undefined,
		signal,
	});

	const responseBody = await parseResponseBody(response);
	const text = formatCallResult(operation, response.status, response.statusText, responseBody);

	return {
		content: [{ type: "text" as const, text }],
		details: {
			mode: "call_operation" as const,
			operation,
			request: {
				method: operation.method,
				path: path.value,
				url,
			},
			status: response.status,
			statusText: response.statusText,
			responseBody,
			error: response.ok ? undefined : `HTTP ${response.status}`,
		},
		isError: response.ok ? undefined : true,
	};
}

function buildPath(
	operation: ArchiveOperationDetails,
	pathParams?: Record<string, string | number>,
): { ok: true; value: string } | { ok: false; error: string } {
	let path = operation.path;
	for (const param of operation.pathParams) {
		const value = pathParams?.[param.name];
		if (value === undefined || value === null || value === "") {
			return { ok: false, error: `Missing path parameter "${param.name}" for ${operation.operationId}.` };
		}
		path = path.replace(`{${param.name}}`, encodeURIComponent(String(value)));
	}
	return { ok: true, value: path };
}

function buildUrl(
	baseUrl: string,
	operation: ArchiveOperationDetails,
	path: string,
	query?: Record<string, unknown>,
): string {
	const resolvedBaseUrl =
		operation.tag === "health" || operation.tag === "metrics" ? baseUrl.replace(/\/api\/v1\/?$/, "") : baseUrl;
	const url = new URL(`${resolvedBaseUrl}${path}`, window.location.origin);
	if (query) {
		for (const [key, value] of Object.entries(query)) {
			if (value === undefined || value === null || value === "") continue;
			if (Array.isArray(value)) {
				for (const item of value) {
					url.searchParams.append(key, String(item));
				}
			} else {
				url.searchParams.set(key, String(value));
			}
		}
	}
	return url.toString();
}

function serializeBody(body: unknown): BodyInit | undefined {
	if (body instanceof FormData) return body;
	return JSON.stringify(body);
}

async function parseResponseBody(response: Response): Promise<unknown> {
	const contentType = response.headers.get("content-type") ?? "";
	if (contentType.includes("application/json")) {
		return response.json();
	}
	return response.text();
}

function formatOperationList(operations: ArchiveOperationDetails[]): string {
	if (operations.length === 0) return "No matching Archive Manager operations found.";
	return operations
		.map((operation) => {
			return `${operation.operationId}: ${operation.method} ${operation.path} [${operation.tag}, ${operation.risk}] ${operation.summary}`;
		})
		.join("\n");
}

function formatOperationDetails(operation: ArchiveOperationDetails): string {
	const pathParams = operation.pathParams.map((param) => `${param.name}:${param.type}`).join(", ") || "none";
	const queryParams = operation.queryParams.map((param) => `${param.name}:${param.type}`).join(", ") || "none";
	return [
		`${operation.operationId}`,
		`${operation.method} ${operation.path}`,
		`tag: ${operation.tag}`,
		`risk: ${operation.risk}`,
		`summary: ${operation.summary}`,
		`pathParams: ${pathParams}`,
		`queryParams: ${queryParams}`,
		`requestBody: ${operation.hasRequestBody ? "yes" : "no"}`,
	].join("\n");
}

function formatCallResult(
	operation: ArchiveOperationDetails,
	status: number,
	statusText: string,
	body: unknown,
): string {
	const bodyText = typeof body === "string" ? body : JSON.stringify(body, null, 2);
	return `${operation.method} ${operation.path} -> ${status} ${statusText}\n\n${bodyText}`;
}

function createErrorResult(mode: ArchiveApiParams["mode"], message: string, operation?: ArchiveOperationDetails) {
	return {
		content: [{ type: "text" as const, text: message }],
		details: {
			mode,
			operation,
			error: message,
		},
		isError: true,
	};
}

function createConfirmationKey(): string {
	return `confirm-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function stableStringify(value: unknown): string {
	if (Array.isArray(value)) {
		return `[${value.map((item) => stableStringify(item)).join(",")}]`;
	}
	if (isRecord(value)) {
		const entries = Object.entries(value)
			.filter(([, item]) => item !== undefined)
			.sort(([left], [right]) => left.localeCompare(right));
		return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
	}
	return JSON.stringify(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
	if (isRecord(value)) return value;
	if (typeof value !== "string") return undefined;
	const parsed = readJsonString(value);
	return isRecord(parsed) ? parsed : undefined;
}

function readStringNumberRecord(value: unknown): Record<string, string | number> | undefined {
	const record = readRecord(value);
	if (!record) return undefined;

	const entries = Object.entries(record).filter((entry): entry is [string, string | number] => {
		return typeof entry[1] === "string" || typeof entry[1] === "number";
	});
	return Object.fromEntries(entries);
}

function readJsonString(value: unknown): unknown {
	if (typeof value !== "string" || !value.trim()) return undefined;
	try {
		return JSON.parse(value);
	} catch {
		return undefined;
	}
}
