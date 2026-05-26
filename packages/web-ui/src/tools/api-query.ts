import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { ToolResultMessage } from "@earendil-works/pi-ai";
import { html } from "lit";
import { createRef, ref } from "lit/directives/ref.js";
import { Terminal } from "lucide";
import { type Static, Type } from "typebox";
import type { ApiEndpoint } from "./api-endpoints.js";
import { API_ENDPOINTS } from "./api-endpoints.js";

const ENDPOINTS = API_ENDPOINTS as unknown as Record<string, ApiEndpoint>;

import { registerToolRenderer, renderCollapsibleHeader, renderHeader } from "./renderer-registry.js";
import type { ToolRenderer, ToolRenderResult } from "./types.js";

// ============================================================================
// Build a summary of API tags for the tool description
// ============================================================================

const TAG_SUMMARIES: Record<string, string> = {
	health: "服务健康检查",
	metrics: "Prometheus 运行指标",
	projects: "项目管理：创建、查询、更新、删除项目，获取项目统计",
	units: "单位工程管理：项目下的单位工程增删改查",
	documents: "资料编制：资料增删改查、提交审核、编制实例管理、表单数据读写",
	reviews: "审核流程：审核资料、查询审核列表与历史",
	archives: "档案管理：档案归档、借阅、查询",
	"project-members": "项目成员管理：添加、移除成员、查询成员列表",
	users: "用户管理：用户信息查询、更新",
	departments: "部门管理",
	templates: "模板管理：创建、查询、更新模板",
	auth: "认证授权：登录、注册、刷新Token、修改密码",
	seals: "印章认证：印章管理、认证",
	tenants: "租户管理（SaaS）：租户配置",
	system: "系统管理：系统配置、字典管理",
	enterprises: "企业管理",
	signing: "电子签名",
	"invite-links": "邀请链接管理",
	"compliance-precheck": "归档合规预检",
	ai: "AI 助手：智能问答、资料推荐",
	"form-fill": "智能表单填充",
	"seal-flow": "用印流程管理",
	"api-keys": "API Key 管理",
	wechat: "微信小程序登录",
	"user-preferences": "用户偏好设置",
};

const TAG_LIST = Object.entries(TAG_SUMMARIES)
	.map(([tag, desc]) => `  - ${tag}: ${desc}`)
	.join("\n");

// ============================================================================
// TYPES
// ============================================================================

const apiQuerySchema = Type.Object({
	operationId: Type.String({
		description: `The API operation to call. Available API domains:\n${TAG_LIST}\n\nUse "healthCheck" to test connectivity.`,
	}),
	pathParams: Type.Optional(
		Type.Record(Type.String(), Type.Union([Type.String(), Type.Number()]), {
			description:
				"Path parameters to substitute into the URL template (e.g., {projectId}). The key should match the parameter name without braces.",
		}),
	),
	query: Type.Optional(
		Type.Record(Type.String(), Type.Unknown(), {
			description: "Query string parameters as key-value pairs.",
		}),
	),
	body: Type.Optional(
		Type.Unknown({
			description: "Request body as a JSON object. Only applicable for POST/PUT operations.",
		}),
	),
});

export type ApiQueryParams = Static<typeof apiQuerySchema>;

export interface ApiQueryResult {
	operationId: string;
	method: string;
	path: string;
	status: number;
	statusText: string;
	responseBody: unknown;
	error?: string;
}

// ============================================================================
// TOOL
// ============================================================================

export function createApiQueryTool(): AgentTool<typeof apiQuerySchema, ApiQueryResult> & {
	baseUrl?: string;
	authToken?: string;
} {
	const tool = {
		label: "API Query",
		name: "api_query",
		baseUrl: undefined as string | undefined,
		authToken: undefined as string | undefined,
		description: `Call the backend API to query or manage data. The system is an engineering archive management platform (工程档案管理平台).

Available API domains and their purposes:
${TAG_LIST}

To call an endpoint, provide the operationId (shown in the domain list above) and any required parameters. The tool will look up the endpoint details from the API spec and execute the request.`,
		parameters: apiQuerySchema,
		execute: async (_toolCallId: string, args: ApiQueryParams, signal?: AbortSignal) => {
			if (signal?.aborted) throw new Error("API query aborted");

			const endpoint = ENDPOINTS[args.operationId];
			if (!endpoint) {
				const availableOps = Object.keys(ENDPOINTS);
				return {
					content: [
						{
							type: "text" as const,
							text: `Unknown operationId: "${args.operationId}". Available operations: ${availableOps.join(", ")}`,
						},
					],
					details: {
						operationId: args.operationId,
						method: "",
						path: "",
						status: 0,
						statusText: "Unknown operation",
						responseBody: null,
						error: `Unknown operationId: ${args.operationId}`,
					},
				};
			}

			// Build URL by substituting path params
			let path = endpoint.path;
			if (args.pathParams) {
				for (const [key, value] of Object.entries(args.pathParams)) {
					path = path.replace(`{${key}}`, encodeURIComponent(String(value)));
				}
			}

			// Check for unresolved path params
			const unresolved = path.match(/\{[^}]+\}/g);
			if (unresolved) {
				return {
					content: [
						{
							type: "text" as const,
							text: `Missing path parameters: ${unresolved.join(", ")}. Provide them in pathParams.`,
						},
					],
					details: {
						operationId: args.operationId,
						method: endpoint.method,
						path,
						status: 0,
						statusText: "Missing parameters",
						responseBody: null,
						error: `Missing path parameters: ${unresolved.join(", ")}`,
					},
				};
			}

			// Build URL
			const baseUrl = tool.baseUrl || "";
			const url = new URL(`${baseUrl}${path}`, window.location.origin);

			// Add query params
			if (args.query) {
				for (const [key, value] of Object.entries(args.query)) {
					if (value !== undefined && value !== null) {
						url.searchParams.set(key, String(value));
					}
				}
			}

			// Build headers
			const headers: Record<string, string> = {
				"Content-Type": "application/json",
			};
			if (tool.authToken && !["login", "register", "refreshToken"].includes(args.operationId)) {
				headers.Authorization = `Bearer ${tool.authToken}`;
			}

			// Make the request
			const fetchOptions: RequestInit = {
				method: endpoint.method,
				headers,
				signal,
			};

			if (endpoint.hasBody && args.body !== undefined) {
				fetchOptions.body = JSON.stringify(args.body);
			}

			try {
				const response = await fetch(url.toString(), fetchOptions);

				let responseBody: unknown;
				const contentType = response.headers.get("content-type") || "";
				if (contentType.includes("application/json")) {
					responseBody = await response.json();
				} else {
					responseBody = await response.text();
				}

				// Format the response for the LLM
				const textContent = typeof responseBody === "string" ? responseBody : JSON.stringify(responseBody, null, 2);

				const resultText = response.ok
					? `✅ ${endpoint.method} ${endpoint.path} → ${response.status}\n\n${textContent}`
					: `❌ ${endpoint.method} ${endpoint.path} → ${response.status} ${response.statusText}\n\n${textContent}`;

				return {
					content: [{ type: "text" as const, text: resultText }],
					details: {
						operationId: args.operationId,
						method: endpoint.method,
						path,
						status: response.status,
						statusText: response.statusText,
						responseBody,
						error: response.ok ? undefined : `HTTP ${response.status}`,
					},
				};
			} catch (error: any) {
				if (error.name === "AbortError") throw error;

				const errorText = `Error calling ${endpoint.method} ${endpoint.path}: ${error.message}`;
				return {
					content: [{ type: "text" as const, text: errorText }],
					details: {
						operationId: args.operationId,
						method: endpoint.method,
						path,
						status: 0,
						statusText: error.message,
						responseBody: null,
						error: error.message,
					},
				};
			}
		},
	};
	return tool;
}

// Export a default instance
export const apiQueryTool = createApiQueryTool();

// ============================================================================
// RENDERER
// ============================================================================

export const apiQueryRenderer: ToolRenderer<ApiQueryParams, ApiQueryResult> = {
	render(
		params: ApiQueryParams | undefined,
		result: ToolResultMessage<ApiQueryResult> | undefined,
		isStreaming?: boolean,
	): ToolRenderResult {
		const state = result ? (result.isError ? "error" : "complete") : isStreaming ? "inprogress" : "complete";
		const contentRef = createRef<HTMLDivElement>();
		const chevronRef = createRef<HTMLSpanElement>();

		if (result && params) {
			const details = result.details;
			const ep = params.operationId ? ENDPOINTS[params.operationId] : null;
			const methodTag = ep ? `${ep.method}` : details?.method || "";
			const pathStr = ep?.path || details?.path || "";
			const statusStr = details?.status ? `${details.status}` : "";
			const isError = result.isError || (details?.status && details.status >= 400);

			const title = isError
				? `${methodTag} ${pathStr} — ${statusStr} Error`
				: `${methodTag} ${pathStr} → ${statusStr}`;

			// Format response body for display
			const responseBody =
				details?.responseBody && typeof details.responseBody === "string"
					? (details.responseBody as string)
					: details?.responseBody
						? JSON.stringify(details.responseBody, null, 2)
						: "";

			const output =
				result.content
					?.filter((c) => c.type === "text")
					.map((c: any) => c.text)
					.join("\n") || "";

			// Extract the clean JSON response (after status line)
			const cleanJson = output.replace(/^[✅❌]\s.*?\n\n/, "");

			return {
				content: html`
					<div>
						${renderCollapsibleHeader(state, Terminal, title, contentRef, chevronRef, false)}
						<div ${ref(contentRef)} class="max-h-0 overflow-hidden transition-all duration-300 space-y-3">
							${
								params.operationId
									? html`<div class="text-sm text-gray-600 dark:text-gray-400">
											<strong>Operation:</strong> ${params.operationId}
										</div>`
									: ""
							}
							${
								responseBody && !isError
									? html`<code-block .code=${cleanJson} language="json"></code-block>`
									: ""
							}
							${
								isError && cleanJson
									? html`<console-block .content=${cleanJson} .variant=${"error"}></console-block>`
									: ""
							}
						</div>
					</div>
				`,
				isCustom: false,
			};
		}

		if (params) {
			const ep = ENDPOINTS[params.operationId];
			const methodTag = ep ? `${ep.method}` : "";
			const pathStr = ep?.path || "";
			return {
				content: html`
					<div>
						${renderCollapsibleHeader(
							state,
							Terminal,
							`${methodTag} ${pathStr}...`,
							contentRef,
							chevronRef,
							false,
						)}
					</div>
				`,
				isCustom: false,
			};
		}

		return {
			content: renderHeader(state, Terminal, "Preparing API query..."),
			isCustom: false,
		};
	},
};

// Auto-register the renderer
registerToolRenderer("api_query", apiQueryRenderer);
