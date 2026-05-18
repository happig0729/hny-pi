import { API_ENDPOINTS, type ApiEndpoint } from "@earendil-works/pi-web-ui";
import type { AppConfig } from "./config.js";

const ENDPOINTS = API_ENDPOINTS as unknown as Record<string, ApiEndpoint>;

export interface ApiClient {
	login(): Promise<void>;
	call(operationId: string, options?: ApiCallOptions): Promise<unknown>;
	getAuthStatus(): AuthStatus;
	getToken(): string | undefined;
}

export interface AuthStatus {
	enabled: boolean;
	attempted: boolean;
	authenticated: boolean;
	message?: string;
}

export interface ApiCallOptions {
	pathParams?: Record<string, string | number>;
	query?: Record<string, string | number | boolean | undefined>;
	body?: unknown;
	signal?: AbortSignal;
}

export interface Project {
	id: number;
	name: string;
	code?: string;
	type?: string;
	status: "active" | "project_archive";
	buildingUnit?: string;
	constructionUnit?: string;
	supervisionUnit?: string;
	designUnit?: string;
	location?: string;
	startDate?: string;
	endDate?: string;
	totalArea?: number;
	description?: string;
	unitCount?: number;
	documentCount?: number;
	pendingReviewCount?: number;
	createdAt?: string;
	updatedAt?: string;
}

export interface ProjectStats {
	totalDocuments: number;
	approvedDocuments: number;
	pendingReviews: number;
	totalUnits: number;
}

export interface Unit {
	id: number;
	projectId: number;
	name: string;
	engType?: string;
	structureType?: string;
	floors?: number;
	buildingArea?: number;
	documentCount?: number;
	createdAt?: string;
}

export interface CreateProjectRequest {
	name: string;
	code?: string;
	type: string;
	buildingUnit: string;
	constructionUnit?: string;
	supervisionUnit?: string;
	designUnit?: string;
	location?: string;
	startDate?: string;
	endDate?: string;
	totalArea?: number;
	description?: string;
}

export interface CreateUnitRequest {
	name: string;
	engType?: string;
	structureType?: string;
	floors?: number;
	buildingArea?: number;
}

export interface AccessCodeInfo {
	accessCode: string;
	accessPassword?: string;
	createdAt?: string;
	resetAt?: string;
}

export interface ProjectMemberRecord {
	id: number;
	projectId: number;
	userId?: number;
	userName?: string;
	role: "project_admin" | "data_admin" | "data_clerk";
	createdAt?: string;
}

export interface DocumentRecord {
	id: number;
	projectId: number;
	unitId?: number;
	title: string;
	code?: string;
	category?: string;
	subCategory?: string;
	type?: "online" | "uploaded";
	status: "draft" | "under_review" | "approved" | "rejected";
	version?: number;
	assignedReviewer?: number;
	reviewComment?: string;
	createdAt?: string;
	updatedAt?: string;
}

export interface UploadFileRecord {
	id: number;
	projectId: number;
	unitId?: number;
	fileName: string;
	title?: string;
	fileType?: string;
	mimeType?: string;
	fileSize?: number;
	nodeId?: string;
	nodeLabel?: string;
	carrier?: string;
	compiler?: string;
	compileDate?: string;
	responsible?: string;
	copies?: number;
	pages?: number;
	status: "pending" | "signing" | "signed" | "collected" | "returned";
	uploadedAt?: string;
	cataloguedAt?: string;
	returnReason?: string;
	updatedAt?: string;
}

export interface CompilationInstance {
	id: number;
	projectId: number;
	unitId?: number;
	itemId?: string;
	name?: string;
	status?: "drafting" | "completed" | "signing" | "signed" | "collected";
	version?: string;
	createdAt?: string;
	lastModifiedAt?: string;
}

export interface ReviewRecord {
	id: number;
	documentId: number;
	documentTitle?: string;
	projectId?: number;
	projectName?: string;
	status: "pending" | "approved" | "rejected";
	assignedToName?: string;
	submittedByName?: string;
	comment?: string;
	createdAt?: string;
	updatedAt?: string;
}

export interface SigningTaskRecord {
	id?: number;
	projectId?: number;
	docName?: string;
	documentTitle?: string;
	status?: string;
	flowMode?: string;
	currentNodeIdx?: number;
	nodes?: unknown[];
	createdAt?: string;
	updatedAt?: string;
}

export interface PrecheckRecord {
	id?: number;
	projectId?: number;
	status?: "running" | "passed" | "failed" | "warning";
	totalChecks?: number;
	passedChecks?: number;
	errorCount?: number;
	warningCount?: number;
	infoCount?: number;
	issues?: unknown[];
	checkedFiles?: unknown[];
	checkedAt?: string;
	createdAt?: string;
}

export interface ArchivePackageRecord {
	id?: number;
	projectId?: number;
	name?: string;
	stage?: string;
	fileCount?: number;
	status?: string;
	createdAt?: string;
}

export interface CollectionItemRecord {
	id?: number;
	projectId?: number;
	itemId?: string;
	fileType?: string;
	collectedAt?: string;
}

export interface ArchiveDashboardData {
	projects: Project[];
	selectedProject?: Project;
	stats?: ProjectStats;
	units: Unit[];
	documents: DocumentRecord[];
	uploads: UploadFileRecord[];
	compilations: CompilationInstance[];
	reviews: ReviewRecord[];
	signingTasks: SigningTaskRecord[];
	latestPrecheck?: PrecheckRecord;
	archivePackages: ArchivePackageRecord[];
	collectionItems: CollectionItemRecord[];
	members: ProjectMemberRecord[];
	accessCode?: AccessCodeInfo;
	errors: string[];
}

export function createApiClient(config: AppConfig): ApiClient {
	let authToken: string | undefined;
	let authStatus: AuthStatus = {
		enabled: config.api.auth.enabled,
		attempted: false,
		authenticated: !config.api.auth.enabled,
	};

	return {
		async login() {
			if (!config.api.auth.enabled) {
				authStatus = { enabled: false, attempted: false, authenticated: true, message: "认证已关闭" };
				return;
			}
			if (!config.api.auth.username) {
				authStatus = { enabled: true, attempted: false, authenticated: false, message: "未配置 VITE_AUTH_USERNAME" };
				return;
			}

			authStatus = { enabled: true, attempted: true, authenticated: false, message: "登录中" };
			try {
				const response = await fetch(config.api.auth.endpoint, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						username: config.api.auth.username,
						password: config.api.auth.password,
					}),
				});
				const body = await parseResponseBody(response);
				if (!response.ok) {
					throw new Error(getErrorMessage(body, `登录失败：HTTP ${response.status}`));
				}
				authToken = extractAccessToken(body);
				if (!authToken) {
					throw new Error("登录响应中未找到 accessToken");
				}
				authStatus = { enabled: true, attempted: true, authenticated: true, message: "已登录" };
			} catch (error) {
				authStatus = {
					enabled: true,
					attempted: true,
					authenticated: false,
					message: error instanceof Error ? error.message : "登录失败",
				};
			}
		},

		async call(operationId: string, options: ApiCallOptions = {}) {
			const endpoint = ENDPOINTS[operationId];
			if (!endpoint) throw new Error(`Unknown operationId: ${operationId}`);
			const url = buildUrl(config.api.baseUrl, endpoint, options);
			const headers: Record<string, string> = {};
			if (endpoint.hasBody && !(options.body instanceof FormData)) {
				headers["Content-Type"] = "application/json";
			}
			if (authToken && endpoint.tag !== "auth") {
				headers.Authorization = `Bearer ${authToken}`;
			}
			const response = await fetch(url, {
				method: endpoint.method,
				headers,
				body: endpoint.hasBody && options.body !== undefined ? serializeBody(options.body) : undefined,
				signal: options.signal,
			});
			const body = await parseResponseBody(response);
			if (!response.ok) {
				throw new Error(getErrorMessage(body, `${operationId} failed: HTTP ${response.status}`));
			}
			return unwrapApiResponse(body);
		},

		getAuthStatus() {
			return authStatus;
		},
		getToken() {
			return authToken;
		},
	};
}

export async function loadArchiveDashboardData(
	client: ApiClient,
	projectIdFromUrl?: number,
): Promise<ArchiveDashboardData> {
	const errors: string[] = [];
	const projects = await loadRequired<Project[]>(client, "listProjects", {}, "项目列表");
	const selectedProject = selectProject(projects, projectIdFromUrl);
	if (!selectedProject) {
		return {
			projects,
			units: [],
			documents: [],
			uploads: [],
			compilations: [],
			reviews: [],
			signingTasks: [],
			archivePackages: [],
			collectionItems: [],
			members: [],
			accessCode: undefined,
			errors: projects.length === 0 ? ["后端未返回项目数据"] : [],
		};
	}

	const projectId = selectedProject.id;
	const [stats, units, documents, uploads, compilations, reviews, signingTasks, latestPrecheck, members, accessCode, archivePackages, collectionItems] =
		await Promise.all([
			loadOptional<ProjectStats>(client, "getProjectStats", { pathParams: { projectId } }, "项目统计", errors),
			loadOptional<Unit[]>(client, "listUnits", { pathParams: { projectId } }, "单位工程", errors),
			loadOptional<DocumentRecord[]>(client, "listDocuments", { pathParams: { projectId } }, "资料列表", errors),
			loadOptional<UploadFileRecord[]>(client, "listUploadFiles", { pathParams: { projectId } }, "上传文件", errors),
			loadOptional<CompilationInstance[]>(client, "listCompilationInstances", { pathParams: { projectId } }, "编制实例", errors),
			loadOptional<ReviewRecord[]>(client, "listReviews", { query: { status: "pending" } }, "审核任务", errors),
			loadOptional<SigningTaskRecord[]>(client, "listSigningTasks", { query: { projectId } }, "签章任务", errors),
			loadOptional<PrecheckRecord | undefined>(client, "getLatestPrecheck", { pathParams: { projectId } }, "最新预检", errors),
			loadOptional<ProjectMemberRecord[]>(client, "listProjectMembers", { pathParams: { projectId } }, "项目成员", errors),
			loadOptional<AccessCodeInfo>(client, "getProjectAccessCode", { pathParams: { projectId } }, "接入码", errors),
			loadOptional<ArchivePackageRecord[]>(client, "listArchivePackages", { pathParams: { projectId } }, "归档包", errors),
			loadOptional<CollectionItemRecord[]>(client, "listCollectionItems", { pathParams: { projectId } }, "采集项", errors),
		]);

	return {
		projects,
		selectedProject,
		stats,
		units: units ?? [],
		documents: documents ?? [],
		uploads: uploads ?? [],
		compilations: compilations ?? [],
		reviews: reviews ?? [],
		signingTasks: signingTasks ?? [],
		latestPrecheck,
		archivePackages: archivePackages ?? [],
		collectionItems: collectionItems ?? [],
		members: members ?? [],
		accessCode,
		errors,
	};
}

function buildUrl(baseUrl: string, endpoint: ApiEndpoint, options: ApiCallOptions): string {
	let path = endpoint.path;
	for (const [key, value] of Object.entries(options.pathParams ?? {})) {
		path = path.replace(`{${key}}`, encodeURIComponent(String(value)));
	}
	const unresolved = path.match(/\{[^}]+\}/g);
	if (unresolved) throw new Error(`Missing path parameters: ${unresolved.join(", ")}`);

	const url = new URL(`${baseUrl}${path}`, window.location.origin);
	for (const [key, value] of Object.entries(options.query ?? {})) {
		if (value !== undefined) {
			url.searchParams.set(key, String(value));
		}
	}
	return url.toString();
}

function serializeBody(body: unknown): BodyInit {
	if (body instanceof FormData) return body;
	return JSON.stringify(body);
}

async function parseResponseBody(response: Response): Promise<unknown> {
	if (response.status === 204) return null;
	const text = await response.text();
	if (!text) return null;
	const contentType = response.headers.get("content-type") ?? "";
	if (contentType.includes("application/json")) {
		return JSON.parse(text) as unknown;
	}
	return text;
}

function unwrapApiResponse(body: unknown): unknown {
	if (isRecord(body) && "data" in body) {
		return body.data;
	}
	return body;
}

function extractAccessToken(body: unknown): string | undefined {
	const unwrapped = unwrapApiResponse(body);
	if (isRecord(unwrapped) && typeof unwrapped.accessToken === "string") return unwrapped.accessToken;
	if (isRecord(unwrapped) && typeof unwrapped.token === "string") return unwrapped.token;
	if (isRecord(body) && typeof body.accessToken === "string") return body.accessToken;
	return undefined;
}

function getErrorMessage(body: unknown, fallback: string): string {
	if (isRecord(body)) {
		if (typeof body.message === "string") return body.message;
		if (typeof body.error === "string") return body.error;
	}
	return fallback;
}

async function loadRequired<T>(client: ApiClient, operationId: string, options: ApiCallOptions, label: string): Promise<T> {
	try {
		const value = await client.call(operationId, options);
		return normalizeArrayOrObject<T>(value);
	} catch (error) {
		throw new Error(`${label}加载失败：${error instanceof Error ? error.message : "未知错误"}`);
	}
}

async function loadOptional<T>(
	client: ApiClient,
	operationId: string,
	options: ApiCallOptions,
	label: string,
	errors: string[],
): Promise<T | undefined> {
	try {
		const value = await client.call(operationId, options);
		return normalizeArrayOrObject<T>(value);
	} catch (error) {
		errors.push(`${label}加载失败：${error instanceof Error ? error.message : "未知错误"}`);
		return undefined;
	}
}

function normalizeArrayOrObject<T>(value: unknown): T {
	if (isRecord(value) && Array.isArray(value.data)) return value.data as T;
	if (isRecord(value) && "data" in value && value.data !== undefined) return value.data as T;
	return value as T;
}

function selectProject(projects: Project[], projectIdFromUrl?: number): Project | undefined {
	if (projectIdFromUrl !== undefined) {
		const selected = projects.find((project) => project.id === projectIdFromUrl);
		if (selected) return selected;
	}
	return projects[0];
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
