import "@mariozechner/mini-lit/dist/ThemeToggle.js";
import { Agent, type AgentEvent, type AgentMessage } from "@earendil-works/pi-agent-core";
import { getModel, type TextContent } from "@earendil-works/pi-ai";
import {
	type AgentState,
	ApiKeyPromptDialog,
	AppStorage,
	ChatPanel,
	CustomProvidersStore,
	createJavaScriptReplTool,
	createStreamFn,
	createWebSearchTool,
	IndexedDBStorageBackend,
	// PersistentStorageDialog, // TODO: Fix - currently broken
	ProviderKeysStore,
	ProvidersModelsTab,
	ProxyTab,
	type SessionData,
	SessionListDialog,
	SessionsStore,
	SettingsDialog,
	SettingsStore,
	setAppStorage,
} from "@earendil-works/pi-web-ui";
import { html, render } from "lit";
import { Bell, History, MessageSquare, Plus, Settings, Sparkles } from "lucide";
import { loadConfig } from "./config.js";
import "./app.css";
import { basicCatalog, Context, type LitComponentApi } from "@a2ui/lit/v0_9";
import { renderMarkdown } from "@a2ui/markdown-it";
// A2UI Imports
import { type A2uiMessage, MessageProcessor } from "@a2ui/web_core/v0_9";
import { ContextProvider } from "@lit/context";
import { icon } from "@mariozechner/mini-lit";
import { Button } from "@mariozechner/mini-lit/dist/Button.js";
import { Input } from "@mariozechner/mini-lit/dist/Input.js";
import {
	ARCHIVE_MANAGER_SYSTEM_PROMPT,
	ARCHIVE_QUICK_PROMPTS,
	createArchiveActionCancelledMessages,
} from "./archive-a2ui.js";
import { evaluateAiNativeTask, type AiNativeEvalStatus } from "./ai-native-evals.js";
import {
	type ArchiveApiParams,
	type ArchiveApiResult,
	buildArchiveOperationFingerprint,
	createArchiveApiTool,
	readArchiveOperationRequest,
} from "./archive-agent-tool.js";
import { createSystemNotification, customConvertToLlm, registerCustomMessageRenderers } from "./custom-messages.js";
import "@a2ui/lit/v0_9";

// Register custom message renderers
registerCustomMessageRenderers();

// Config
const config = loadConfig();

// Create stores
const settings = new SettingsStore();
const providerKeys = new ProviderKeysStore();
const sessions = new SessionsStore();
const customProviders = new CustomProvidersStore();

// Gather configs
const configs = [
	settings.getConfig(),
	SessionsStore.getMetadataConfig(),
	providerKeys.getConfig(),
	customProviders.getConfig(),
	sessions.getConfig(),
];

// Create backend
const backend = new IndexedDBStorageBackend({
	dbName: "pi-web-ui-example",
	version: 2, // Incremented for custom-providers store
	stores: configs,
});

// Wire backend to stores
settings.setBackend(backend);
providerKeys.setBackend(backend);
customProviders.setBackend(backend);
sessions.setBackend(backend);

// Create and set app storage
const storage = new AppStorage(settings, providerKeys, sessions, customProviders, backend);
setAppStorage(storage);

// API auth token (auto-refreshed on login)
let apiAuthToken: string | undefined;
const approvedArchiveOperations = new Map<string, string>();

const refreshApiToken = async () => {
	if (!config.api.auth.enabled || !config.api.auth.username) return;
	try {
		const res = await fetch(config.api.auth.endpoint, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				username: config.api.auth.username,
				password: config.api.auth.password,
			}),
		});
		if (res.ok) {
			const data = await res.json();
			apiAuthToken = data.accessToken;
		}
	} catch (_e) {
		// Will retry next time
	}
};

const archiveApiTool = createArchiveApiTool({
	baseUrl: config.api.baseUrl,
	getAuthToken: () => apiAuthToken,
	consumeConfirmedOperation: (confirmationKey, request) => {
		const approvedFingerprint = approvedArchiveOperations.get(confirmationKey);
		if (!approvedFingerprint) return false;

		const requestFingerprint = buildArchiveOperationFingerprint(request);
		if (approvedFingerprint !== requestFingerprint) return false;

		approvedArchiveOperations.delete(confirmationKey);
		return true;
	},
});

let currentSessionId: string | undefined;
let currentTitle = "";
let isEditingTitle = false;
let agent: Agent;
let chatPanel: ChatPanel;
let agentUnsubscribe: (() => void) | undefined;
type AppAgentEvent = AgentEvent | { type: "state-update"; state: AgentState };

// ============================================================================
// A2UI State & Integration Setup
// ============================================================================

function getMessageText(message: any): string {
	if (!message || !message.content) return "";
	if (typeof message.content === "string") return message.content;
	if (Array.isArray(message.content)) {
		return message.content.map((c: any) => (c && c.type === "text" ? c.text || "" : "")).join("");
	}
	return "";
}

type JsonRecord = Record<string, unknown>;
type A2uiOutputDiagnosticSeverity = "info" | "warning" | "error";

interface A2uiOutputDiagnostic {
	code: string;
	label: string;
	severity: A2uiOutputDiagnosticSeverity;
	detail: string;
	count: number;
}

interface ParsedA2uiResult {
	messages: A2uiMessage[];
	diagnostics: A2uiOutputDiagnostic[];
}

function isJsonRecord(value: unknown): value is JsonRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function addA2uiDiagnostic(
	diagnostics: A2uiOutputDiagnostic[],
	diagnostic: Omit<A2uiOutputDiagnostic, "count">,
) {
	const existing = diagnostics.find((item) => item.code === diagnostic.code && item.detail === diagnostic.detail);
	if (existing) {
		existing.count += 1;
		return;
	}
	diagnostics.push({ ...diagnostic, count: 1 });
}

function getA2uiDiagnosticStatus(diagnostics: A2uiOutputDiagnostic[]): AiNativeGovernanceStatus {
	if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) return "fail";
	if (diagnostics.some((diagnostic) => diagnostic.severity === "warning")) return "warning";
	return "pass";
}

function formatA2uiDiagnosticSummary(diagnostics: A2uiOutputDiagnostic[]): string {
	if (diagnostics.length === 0) return "A2UI 输出结构通过基础质量校验。";
	const errorCount = diagnostics.filter((diagnostic) => diagnostic.severity === "error").length;
	const warningCount = diagnostics.filter((diagnostic) => diagnostic.severity === "warning").length;
	const topDetails = diagnostics
		.slice(0, 3)
		.map((diagnostic) => `${diagnostic.label}${diagnostic.count > 1 ? ` x${diagnostic.count}` : ""}`)
		.join("；");
	return `${errorCount} 个错误，${warningCount} 个警告。${topDetails}`;
}

function normalizeA2uiMessages(messages: A2uiMessage[], diagnostics: A2uiOutputDiagnostic[]): A2uiMessage[] {
	type MutableRecord = Record<string, unknown>;

	let autoIdCounter = 1;
	const getAutoId = (compName: string) => {
		return `auto-${compName.toLowerCase()}-${autoIdCounter++}`;
	};

	const isRecord = (value: unknown): value is MutableRecord => {
		return typeof value === "object" && value !== null && !Array.isArray(value);
	};

	const getString = (value: unknown): string | undefined => {
		return typeof value === "string" ? value : undefined;
	};

	const getComponentName = (comp: MutableRecord): string | undefined => {
		return getString(comp.component);
	};

	const isComponentRecord = (value: unknown): value is MutableRecord => {
		if (!isRecord(value)) return false;
		return typeof value.component === "string" || typeof value.type === "string";
	};

	const normalizeBindingPath = (path: string, templatePath?: string): string => {
		const trimmedPath = path.trim();
		if (!templatePath) return trimmedPath;

		const normalizedTemplatePath = templatePath.endsWith("/") ? templatePath.slice(0, -1) : templatePath;
		const indexedPrefix = `${normalizedTemplatePath}/{index}/`;
		if (trimmedPath.startsWith(indexedPrefix)) {
			return trimmedPath.slice(indexedPrefix.length);
		}

		const indexMarker = "/{index}/";
		const indexMarkerPosition = trimmedPath.indexOf(indexMarker);
		if (indexMarkerPosition !== -1) {
			return trimmedPath.slice(indexMarkerPosition + indexMarker.length);
		}
		if (trimmedPath.startsWith("/item/")) {
			return trimmedPath.slice("/item/".length);
		}
		if (trimmedPath.startsWith("/")) {
			return trimmedPath.slice(1);
		}

		return trimmedPath;
	};

	const normalizeDynamicString = (value: unknown, templatePath?: string): unknown => {
		if (typeof value !== "string") return value;

		const templateMatch =
			value.match(/\$\{([^}]+)\}/) ?? value.match(/\{\{([^}]+)\}\}/) ?? value.match(/\{([a-zA-Z0-9_.]+)\}/);
		if (!templateMatch) {
			return value.startsWith("/") ? { path: normalizeBindingPath(value, templatePath) } : value;
		}

		const varName = templateMatch[1].trim();
		let path = varName;
		if (!varName.startsWith("/")) {
			path = templatePath ? varName : `/${varName}`;
		}

		return { path: normalizeBindingPath(path, templatePath) };
	};

	const normalizePathRecords = (obj: unknown, templatePath?: string) => {
		if (!isRecord(obj)) return;

		if (typeof obj.path === "string") {
			obj.path = normalizeBindingPath(obj.path, templatePath);
		}

		for (const value of Object.values(obj)) {
			if (Array.isArray(value)) {
				for (const item of value) {
					normalizePathRecords(item, templatePath);
				}
			} else {
				normalizePathRecords(value, templatePath);
			}
		}
	};

	const normalizeAction = (comp: MutableRecord, templatePath?: string) => {
		if (!isRecord(comp.action)) return;

		const action = comp.action;
		if (typeof action.name === "string" && action.event === undefined) {
			addA2uiDiagnostic(diagnostics, {
				code: "a2ui.action-name-alias",
				label: "修正 action.name",
				severity: "warning",
				detail: "action 使用 name 字段，已规范化为 event.name。",
			});
			action.event = { name: action.name };
			delete action.name;
		}
		if (typeof action.event === "string") {
			addA2uiDiagnostic(diagnostics, {
				code: "a2ui.action-event-string",
				label: "修正 action.event",
				severity: "warning",
				detail: "action.event 使用字符串，已规范化为对象。",
			});
			action.event = { name: action.event };
		}

		if (isRecord(action.event) && isRecord(action.event.context)) {
			for (const [key, value] of Object.entries(action.event.context)) {
				action.event.context[key] = normalizeDynamicString(value, templatePath);
			}
		}

		if (isRecord(action.contextBindings) && isRecord(action.event)) {
			addA2uiDiagnostic(diagnostics, {
				code: "a2ui.context-bindings-alias",
				label: "修正 contextBindings",
				severity: "warning",
				detail: "action 使用 contextBindings，已规范化为 event.context。",
			});
			const context: MutableRecord = {};
			for (const [key, value] of Object.entries(action.contextBindings)) {
				context[key] = typeof value === "string" ? { path: normalizeBindingPath(value, templatePath) } : value;
			}
			action.event.context = context;
			delete action.contextBindings;
		}
	};

	const SPLIT_KEYS = ["createSurface", "updateComponents", "updateDataModel", "deleteSurface"];

	// Step 0: Split combined messages (multiple update types in one object)
	const splitMessages: A2uiMessage[] = [];
	for (const msg of messages) {
		const keys = SPLIT_KEYS.filter((k) => k in msg);
		if (keys.length <= 1) {
			splitMessages.push(msg);
		} else {
			addA2uiDiagnostic(diagnostics, {
				code: "a2ui.combined-message-split",
				label: "拆分复合消息",
				severity: "warning",
				detail: "单条 A2UI message 包含多个操作类型，已拆分为多条消息。",
			});
			for (const key of keys) {
				splitMessages.push({ version: msg.version, [key]: (msg as any)[key] } as A2uiMessage);
			}
		}
	}
	messages = splitMessages;

	// Step 0.1: Fill missing surfaceId (default to "default")
	for (const msg of messages) {
		if (isRecord(msg)) {
			if ("updateComponents" in msg && isRecord(msg.updateComponents) && !msg.updateComponents.surfaceId) {
				addA2uiDiagnostic(diagnostics, {
					code: "a2ui.missing-surface-id",
					label: "补全 surfaceId",
					severity: "warning",
					detail: "updateComponents 缺少 surfaceId，已默认补为 default。",
				});
				msg.updateComponents.surfaceId = "default";
			}
			if ("updateDataModel" in msg && isRecord(msg.updateDataModel) && !msg.updateDataModel.surfaceId) {
				addA2uiDiagnostic(diagnostics, {
					code: "a2ui.missing-surface-id",
					label: "补全 surfaceId",
					severity: "warning",
					detail: "updateDataModel 缺少 surfaceId，已默认补为 default。",
				});
				msg.updateDataModel.surfaceId = "default";
			}
		}
	}

	// Step 0.2: Auto-generate createSurface if missing (LLM often skips this)
	const hasCreateSurface = messages.some((m) => "createSurface" in m);
	const hasUpdateOrData = messages.some((m) => "updateComponents" in m || "updateDataModel" in m);
	if (!hasCreateSurface && hasUpdateOrData) {
		addA2uiDiagnostic(diagnostics, {
			code: "a2ui.generated-surface",
			label: "补建 surface",
			severity: "warning",
			detail: "输出缺少 createSurface，已自动创建 default surface。",
		});
		const catalogId = (messages[0] as any)?.catalogId ?? (messages[0] as any)?.createSurface?.catalogId;
		const version = (messages[0] as any)?.version ?? "v0.9";
		messages = [
			{
				version,
				createSurface: {
					surfaceId: "default",
					catalogId:
						typeof catalogId === "string"
							? catalogId
							: "https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json",
				},
			} as A2uiMessage,
			...messages,
		];
	}

	const normalizeComponentFields = (comp: MutableRecord, templatePath?: string) => {
		// Normalize componentId -> id
		if (comp.componentId !== undefined && comp.id === undefined) {
			addA2uiDiagnostic(diagnostics, {
				code: "a2ui.component-id-alias",
				label: "修正 componentId",
				severity: "warning",
				detail: "组件使用 componentId 字段，已规范化为 id。",
			});
			comp.id = comp.componentId;
			delete comp.componentId;
		}

		if (comp.type && !comp.component) {
			const type = getString(comp.type);
			if (type && /^[A-Z][a-zA-Z0-9_]*$/.test(type)) {
				addA2uiDiagnostic(diagnostics, {
					code: "a2ui.type-alias",
					label: "修正 type 别名",
					severity: "warning",
					detail: "组件使用 type 字段，已规范化为 component。",
				});
				comp.component = type;
			}
		}

		if (isRecord(comp.properties)) {
			addA2uiDiagnostic(diagnostics, {
				code: "a2ui.properties-flattened",
				label: "展开 properties",
				severity: "warning",
				detail: "组件属性嵌套在 properties 中，已展开到组件对象。",
			});
			for (const [key, value] of Object.entries(comp.properties)) {
				if (comp[key] === undefined) {
					comp[key] = value;
				}
			}
			delete comp.properties;
		}

		if (Array.isArray(comp.components) && comp.children === undefined) {
			addA2uiDiagnostic(diagnostics, {
				code: "a2ui.components-alias",
				label: "修正 children 别名",
				severity: "warning",
				detail: "组件使用 components 作为子组件字段，已规范化为 children。",
			});
			comp.children = comp.components;
			delete comp.components;
		}

		const componentName = getComponentName(comp);
		if (isRecord(comp.bind)) {
			const bind = comp.bind;
			const bindValue = getString(bind.value);
			const bindText = getString(bind.text);
			const bindSrc = getString(bind.src);
			const bindUrl = getString(bind.url);

			if (componentName === "Text" && bindValue) {
				comp.text = { path: normalizeBindingPath(bindValue, templatePath) };
			} else if (bindValue) {
				comp.value = { path: normalizeBindingPath(bindValue, templatePath) };
			}
			if (bindText) {
				comp.text = { path: normalizeBindingPath(bindText, templatePath) };
			}
			if (bindSrc || bindUrl) {
				comp.url = { path: normalizeBindingPath(bindSrc ?? bindUrl ?? "", templatePath) };
			}
		}
		if (componentName === "Text" && comp.text === undefined && typeof comp.textPath === "string") {
			addA2uiDiagnostic(diagnostics, {
				code: "a2ui.text-path-alias",
				label: "修正 Text 绑定",
				severity: "warning",
				detail: "Text 使用 textPath，已规范化为 text.path。",
			});
			comp.text = { path: normalizeBindingPath(comp.textPath, templatePath) };
			delete comp.textPath;
		}

		if (componentName === "Text" && comp.text === undefined && comp.value !== undefined) {
			addA2uiDiagnostic(diagnostics, {
				code: "a2ui.text-value-alias",
				label: "修正 Text value",
				severity: "warning",
				detail: "Text 使用 value，已规范化为 text。",
			});
			comp.text = normalizeDynamicString(comp.value, templatePath);
			delete comp.value;
		}
		if (componentName === "Image" && comp.url === undefined && typeof comp.sourcePath === "string") {
			addA2uiDiagnostic(diagnostics, {
				code: "a2ui.image-source-alias",
				label: "修正 Image URL",
				severity: "warning",
				detail: "Image 使用 sourcePath/source/src/imageUrl/value，已规范化为 url。",
			});
			comp.url = { path: normalizeBindingPath(comp.sourcePath, templatePath) };
			delete comp.sourcePath;
		}
		if (componentName === "Image" && comp.url === undefined && typeof comp.source === "string") {
			addA2uiDiagnostic(diagnostics, {
				code: "a2ui.image-source-alias",
				label: "修正 Image URL",
				severity: "warning",
				detail: "Image 使用 sourcePath/source/src/imageUrl/value，已规范化为 url。",
			});
			comp.url = normalizeDynamicString(comp.source, templatePath);
			delete comp.source;
		}
		if (componentName === "Image" && comp.url === undefined && typeof comp.src === "string") {
			addA2uiDiagnostic(diagnostics, {
				code: "a2ui.image-source-alias",
				label: "修正 Image URL",
				severity: "warning",
				detail: "Image 使用 sourcePath/source/src/imageUrl/value，已规范化为 url。",
			});
			comp.url = normalizeDynamicString(comp.src, templatePath);
			delete comp.src;
		}
		if (componentName === "Image" && comp.url === undefined && typeof comp.imageUrl === "string") {
			addA2uiDiagnostic(diagnostics, {
				code: "a2ui.image-source-alias",
				label: "修正 Image URL",
				severity: "warning",
				detail: "Image 使用 sourcePath/source/src/imageUrl/value，已规范化为 url。",
			});
			comp.url = normalizeDynamicString(comp.imageUrl, templatePath);
			delete comp.imageUrl;
		}
		if (componentName === "Image" && comp.url === undefined && typeof comp.value === "string") {
			addA2uiDiagnostic(diagnostics, {
				code: "a2ui.image-source-alias",
				label: "修正 Image URL",
				severity: "warning",
				detail: "Image 使用 sourcePath/source/src/imageUrl/value，已规范化为 url。",
			});
			comp.url = normalizeDynamicString(comp.value, templatePath);
			delete comp.value;
		}
		if (componentName === "Image" && comp.description === undefined && typeof comp.altText === "string") {
			comp.description = comp.altText;
			delete comp.altText;
		}

		if (componentName === "Image" && comp.url !== undefined) {
			comp.url = normalizeDynamicString(comp.url, templatePath);
		}
		if (componentName === "Text" && comp.text !== undefined) {
			comp.text = normalizeDynamicString(comp.text, templatePath);
		}
		if (comp.value !== undefined) {
			comp.value = normalizeDynamicString(comp.value, templatePath);
		}

		normalizeAction(comp, templatePath);
		normalizePathRecords(comp, templatePath);

		// Automatically inject premium visual styles for basic A2UI components
		if (comp.styles === undefined || typeof comp.styles === "object") {
			const defaultStyles: Record<string, string> = {};
			if (componentName === "Card") {
				Object.assign(defaultStyles, {
					borderRadius: "16px",
					boxShadow: "0 10px 30px -10px rgba(0, 0, 0, 0.05)",
					border: "1px solid light-dark(var(--n-90), var(--n-20))",
					padding: "20px",
					backgroundColor: "light-dark(var(--n-100), var(--n-15))",
					transition: "transform 0.2s ease, box-shadow 0.2s ease",
				});
			} else if (componentName === "Button") {
				Object.assign(defaultStyles, {
					borderRadius: "10px",
					padding: "10px 20px",
					fontWeight: "600",
					cursor: "pointer",
					border: "none",
					transition: "all 0.2s ease",
				});
			} else if (componentName === "TextField" || componentName === "DateTimeInput") {
				Object.assign(defaultStyles, {
					borderRadius: "10px",
					border: "1px solid light-dark(var(--n-80), var(--n-25))",
					padding: "10px 14px",
					backgroundColor: "light-dark(var(--n-100), var(--n-10))",
					color: "light-dark(var(--n-0), var(--n-100))",
					transition: "border-color 0.2s ease, box-shadow 0.2s ease",
				});
			} else if (componentName === "List") {
				Object.assign(defaultStyles, {
					display: "flex",
					flexDirection: "column",
					gap: "16px",
				});
			} else if (componentName === "Column" || componentName === "Row") {
				Object.assign(defaultStyles, {
					gap: "12px",
				});
			}

			if (Object.keys(defaultStyles).length > 0) {
				comp.styles = {
					...defaultStyles,
					...((comp.styles as object) || {}),
				};
			}
		}
	};

	const normalizeComponentKeys = (obj: unknown) => {
		if (!obj || typeof obj !== "object") return;
		if (!isRecord(obj)) return;

		if (isComponentRecord(obj)) {
			normalizeComponentFields(obj);
			const text = getString(obj.text);
			if (text) {
				if (text.startsWith("# ")) {
					obj.variant = "h1";
					obj.text = text.substring(2);
				} else if (text.startsWith("## ")) {
					obj.variant = "h2";
					obj.text = text.substring(3);
				} else if (text.startsWith("### ")) {
					obj.variant = "h3";
					obj.text = text.substring(4);
				}
			}
		}

		for (const key of Object.keys(obj)) {
			const val = obj[key];
			if (Array.isArray(val)) {
				for (const item of val) {
					normalizeComponentKeys(item);
				}
			} else if (typeof val === "object" && val !== null) {
				normalizeComponentKeys(val);
			}
		}
	};

	// Step 1: Normalize all keys (rename type -> component)
	for (const msg of messages) {
		normalizeComponentKeys(msg);
	}

	// Step 2: Flatten nested layouts and populate missing IDs
	for (const msg of messages) {
		if (msg && typeof msg === "object" && "updateComponents" in msg) {
			const payload = (msg as any).updateComponents;
			if (payload && Array.isArray(payload.components)) {
				const flatList: MutableRecord[] = [];

				const processAndFlatten = (comp: MutableRecord, templatePath?: string): string => {
					normalizeComponentFields(comp, templatePath);

					// Assign missing ID
					if (!comp.id) {
						addA2uiDiagnostic(diagnostics, {
							code: "a2ui.generated-component-id",
							label: "补全组件 id",
							severity: "warning",
							detail: "组件缺少 id，已自动生成。",
						});
						comp.id = getAutoId(getString(comp.component) ?? "component");
					}
					const compId = String(comp.id);
					const componentName = getComponentName(comp);

					if (
						componentName === "Button" &&
						comp.child === undefined &&
						(typeof comp.label === "string" || typeof comp.text === "string" || typeof comp.value === "string")
					) {
						addA2uiDiagnostic(diagnostics, {
							code: "a2ui.button-label-normalized",
							label: "修正按钮文本",
							severity: "warning",
							detail: "Button 使用 label/text/value，已生成 Text child。",
						});
						comp.child = {
							id: `${compId}-label`,
							component: "Text",
							text:
								typeof comp.label === "string"
									? comp.label
									: typeof comp.text === "string"
										? comp.text
										: comp.value,
						};
						delete comp.label;
						delete comp.text;
						delete comp.value;
					}

					if (componentName === "List" && isRecord(comp.itemTemplate)) {
						addA2uiDiagnostic(diagnostics, {
							code: "a2ui.list-template-normalized",
							label: "修正 List 模板",
							severity: "warning",
							detail: "List 使用 itemTemplate，已规范化为 children.componentId/path。",
						});
						let listPath = "/items";
						if (isRecord(comp.children) && typeof comp.children.path === "string") {
							listPath = comp.children.path;
						}
						if (isRecord(comp.bind) && typeof comp.bind.items === "string") {
							listPath = comp.bind.items;
						}
						if (typeof comp.data === "string") {
							listPath = comp.data;
						}
						if (typeof comp.dataPath === "string") {
							listPath = comp.dataPath;
						}
						const templateId = processAndFlatten(comp.itemTemplate, listPath);
						comp.children = { componentId: templateId, path: listPath };
						delete comp.itemTemplate;
						delete comp.data;
						delete comp.dataPath;
					}
					if (componentName === "List" && isRecord(comp.value) && isRecord(comp.value.template)) {
						addA2uiDiagnostic(diagnostics, {
							code: "a2ui.list-value-template-normalized",
							label: "修正 List value 模板",
							severity: "warning",
							detail: "List 使用 value.template，已规范化为 children.componentId/path。",
						});
						let listPath = "/items";
						if (typeof comp.value.items === "string") {
							listPath = comp.value.items;
						}
						const templateId = processAndFlatten(comp.value.template, listPath);
						comp.children = { componentId: templateId, path: listPath };
						delete comp.value;
					}

					if (componentName === "Card" && Array.isArray(comp.children)) {
						addA2uiDiagnostic(diagnostics, {
							code: "a2ui.card-children-flattened",
							label: "展开 Card 子组件",
							severity: "warning",
							detail: "Card 嵌套 children，已展平成 child 引用。",
						});
						if (comp.children.length === 1) {
							const child = comp.children[0];
							comp.child = isComponentRecord(child) ? processAndFlatten(child, templatePath) : child;
						} else if (comp.children.length > 1) {
							comp.child = processAndFlatten(
								{
									id: `${compId}-content`,
									component: "Column",
									children: comp.children,
								},
								templatePath,
							);
						}
						delete comp.children;
					}

					// Recursively process nested child components
					if (isComponentRecord(comp.child)) {
						comp.child = processAndFlatten(comp.child, templatePath);
					}

					// Recursively process nested children array
					if (comp.children && Array.isArray(comp.children)) {
						comp.children = comp.children.map((child: unknown) => {
							if (isComponentRecord(child)) {
								return processAndFlatten(child, templatePath);
							}
							return child;
						});
					}

					flatList.push(comp);
					return compId;
				};

				for (const comp of payload.components) {
					if (isComponentRecord(comp)) {
						processAndFlatten(comp);
					}
				}

				// Deduplicate flatList by ID
				const seen = new Set<string>();
				const dedupedList: MutableRecord[] = [];
				for (const comp of flatList) {
					const compId = String(comp.id);
					if (!seen.has(compId)) {
						seen.add(compId);
						dedupedList.push(comp);
					}
				}

				// Ensure there is always a root component (id === "root")
				const hasRootId = dedupedList.some((comp) => comp.id === "root");
				if (!hasRootId && dedupedList.length > 0) {
					addA2uiDiagnostic(diagnostics, {
						code: "a2ui.generated-root",
						label: "补全 root",
						severity: "warning",
						detail: "组件列表缺少 root，已自动选择顶层组件并改名为 root。",
					});
					const childIds = new Set<string>();
					for (const comp of dedupedList) {
						if (comp.child && typeof comp.child === "string") {
							childIds.add(comp.child);
						}
						if (comp.children && Array.isArray(comp.children)) {
							for (const child of comp.children) {
								if (typeof child === "string") {
									childIds.add(child);
								} else if (isRecord(child) && typeof child.id === "string") {
									childIds.add(child.id);
								}
							}
						}
						if (isRecord(comp.children) && typeof comp.children.componentId === "string") {
							childIds.add(comp.children.componentId);
						}
					}

					// Find topological roots (components not referenced as a child by any other component)
					const topologicalRoots = dedupedList.filter(
						(comp) => typeof comp.id === "string" && !childIds.has(comp.id),
					);
					let rootComp = topologicalRoots[0];
					if (!rootComp) {
						rootComp = dedupedList[0];
					}

					if (rootComp) {
						const oldId = rootComp.id;
						rootComp.id = "root";

						// Update any references to the old ID
						for (const comp of dedupedList) {
							if (comp.child === oldId) {
								comp.child = "root";
							}
							if (comp.children && Array.isArray(comp.children)) {
								comp.children = comp.children.map((c: unknown) => {
									if (c === oldId) return "root";
									if (isRecord(c) && c.id === oldId) return { ...c, id: "root" };
									return c;
								});
							}
						}
					}
				}

				// Fill dangling child references (LLM references components it never defined)
				const definedIds = new Set(dedupedList.map((c) => String(c.id)));
				const referencedIds = new Set<string>();
				for (const comp of dedupedList) {
					if (typeof comp.child === "string") referencedIds.add(comp.child);
					if (Array.isArray(comp.children)) {
						for (const c of comp.children) {
							if (typeof c === "string") referencedIds.add(c);
						}
					}
					if (isRecord(comp.children) && typeof comp.children.componentId === "string") {
						referencedIds.add(comp.children.componentId);
					}
				}
				for (const refId of referencedIds) {
					if (!definedIds.has(refId)) {
						addA2uiDiagnostic(diagnostics, {
							code: "a2ui.dangling-child-reference",
							label: "补全悬空引用",
							severity: "warning",
							detail: "组件引用了未定义的 child，已补空 Text 占位。",
						});
						dedupedList.push({ id: refId, component: "Text", text: "" });
					}
				}

				// Fix List children: LLM often outputs "children":["template-id"] instead of {componentId,path}
				for (const comp of dedupedList) {
					const compName = getComponentName(comp);
					if (
						compName === "List" &&
						Array.isArray(comp.children) &&
						comp.children.length === 1 &&
						typeof comp.children[0] === "string"
					) {
						addA2uiDiagnostic(diagnostics, {
							code: "a2ui.list-children-fixed",
							label: "修正 List children",
							severity: "warning",
							detail: "List children 使用字符串数组，已规范化为 { componentId, path }。",
						});
						const templateId = comp.children[0] as string;
						const template = dedupedList.find((c) => c.id === templateId);
						if (template && typeof template.path === "string") {
							comp.children = { componentId: templateId, path: template.path as string };
							delete template.path;
						} else {
							comp.children = { componentId: templateId, path: "/items" };
						}
					}
				}

				payload.components = dedupedList;
			}
		}
	}

	return messages;
}

function validateA2uiMessages(messages: A2uiMessage[], diagnostics: A2uiOutputDiagnostic[]) {
	const dataModelsBySurface = new Map<string, unknown>();

	for (const msg of messages) {
		if (!isJsonRecord(msg) || !isJsonRecord(msg.updateDataModel)) continue;
		const surfaceId = typeof msg.updateDataModel.surfaceId === "string" ? msg.updateDataModel.surfaceId : "default";
		if (msg.updateDataModel.path === "/") {
			dataModelsBySurface.set(surfaceId, msg.updateDataModel.value);
		}
	}

	for (const msg of messages) {
		if (!isJsonRecord(msg) || !isJsonRecord(msg.updateComponents)) continue;
		const surfaceId = typeof msg.updateComponents.surfaceId === "string" ? msg.updateComponents.surfaceId : "default";
		const components = Array.isArray(msg.updateComponents.components) ? msg.updateComponents.components : [];
		const componentRecords = components.filter(isJsonRecord);
		const componentIds = new Set(
			componentRecords
				.map((component) => component.id)
				.filter((id): id is string => typeof id === "string" && id.length > 0),
		);

		if (!componentIds.has("root")) {
			addA2uiDiagnostic(diagnostics, {
				code: "a2ui.root-missing",
				label: "缺少 root 组件",
				severity: "error",
				detail: `surface ${surfaceId} 的 updateComponents 缺少 id 为 root 的组件。`,
			});
		}

		for (const component of componentRecords) {
			validateA2uiListComponent(component, surfaceId, componentIds, dataModelsBySurface.get(surfaceId), diagnostics);
			validateA2uiActionComponent(component, diagnostics);
		}
	}
}

function validateA2uiListComponent(
	component: JsonRecord,
	surfaceId: string,
	componentIds: Set<string>,
	rootDataModel: unknown,
	diagnostics: A2uiOutputDiagnostic[],
) {
	if (component.component !== "List") return;

	if (!isJsonRecord(component.children)) {
		addA2uiDiagnostic(diagnostics, {
			code: "a2ui.list-children-invalid",
			label: "List children 无效",
			severity: "error",
			detail: "List.children 必须是 { componentId, path } 对象。",
		});
		return;
	}

	const templateId = component.children.componentId;
	const listPath = component.children.path;
	if (typeof templateId !== "string" || !componentIds.has(templateId)) {
		addA2uiDiagnostic(diagnostics, {
			code: "a2ui.list-template-missing",
			label: "List 模板缺失",
			severity: "error",
			detail: "List.children.componentId 未指向有效模板组件。",
		});
	}
	if (typeof listPath !== "string" || !listPath.startsWith("/")) {
		addA2uiDiagnostic(diagnostics, {
			code: "a2ui.list-path-invalid",
			label: "List path 无效",
			severity: "error",
			detail: "List.children.path 必须是绝对数据路径，例如 /records。",
		});
		return;
	}

	const rootKey = listPath.split("/").filter(Boolean)[0];
	if (rootKey && isJsonRecord(rootDataModel) && !(rootKey in rootDataModel)) {
		addA2uiDiagnostic(diagnostics, {
			code: "a2ui.list-data-path-missing",
			label: "List 数据缺失",
			severity: "warning",
			detail: `surface ${surfaceId} 的根数据模型缺少 ${listPath} 对应字段。`,
		});
	}
}

function validateA2uiActionComponent(component: JsonRecord, diagnostics: A2uiOutputDiagnostic[]) {
	if (!isJsonRecord(component.action)) return;

	const action = component.action;
	if (!isJsonRecord(action.event) || typeof action.event.name !== "string") {
		addA2uiDiagnostic(diagnostics, {
			code: "a2ui.action-event-missing",
			label: "Action event 缺失",
			severity: "error",
			detail: "带 action 的组件必须包含 event.name。",
		});
		return;
	}

	if (!isJsonRecord(action.event.context)) {
		addA2uiDiagnostic(diagnostics, {
			code: "a2ui.action-context-missing",
			label: "Action context 缺失",
			severity: "warning",
			detail: `${action.event.name} 缺少 event.context，后续动作可能无法携带业务参数。`,
		});
		return;
	}

	if (action.event.name !== "archive.confirmOperation") return;
	const context = action.event.context;
	const missingKeys = ["operationId", "body", "confirmationKey"].filter((key) => !(key in context));
	if (missingKeys.length > 0) {
		addA2uiDiagnostic(diagnostics, {
			code: "a2ui.confirm-context-incomplete",
			label: "确认参数不完整",
			severity: "error",
			detail: `archive.confirmOperation 缺少 ${missingKeys.join(", ")}。`,
		});
	}
}

function parseIncrementalA2uiJson(text: string): ParsedA2uiResult {
	const diagnostics: A2uiOutputDiagnostic[] = [];
	const startTag = "<a2ui-json>";
	const endTag = "</a2ui-json>";
	const startIndex = text.indexOf(startTag);

	let jsonContent: string | undefined;

	if (startIndex !== -1) {
		jsonContent = text.slice(startIndex + startTag.length);
		const endIndex = jsonContent.indexOf(endTag);
		if (endIndex !== -1) {
			jsonContent = jsonContent.slice(0, endIndex);
		} else {
			addA2uiDiagnostic(diagnostics, {
				code: "a2ui.missing-end-tag",
				label: "缺少结束标签",
				severity: "warning",
				detail: "输出包含 <a2ui-json>，但尚未包含 </a2ui-json>。",
			});
		}
	} else {
		// Fallback 1: markdown code block ```json ... ```
		const mdMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
		if (mdMatch) {
			addA2uiDiagnostic(diagnostics, {
				code: "a2ui.markdown-json-fallback",
				label: "使用 Markdown JSON 回退",
				severity: "warning",
				detail: "输出未使用 <a2ui-json> 包裹，解析器回退到 Markdown JSON 代码块。",
			});
			jsonContent = mdMatch[1].trim();
		}
	}

	if (!jsonContent) {
		// Fallback 2: try the raw text itself (pure JSON)
		if (text.trim()) {
			addA2uiDiagnostic(diagnostics, {
				code: "a2ui.raw-json-fallback",
				label: "使用原文 JSON 回退",
				severity: "warning",
				detail: "输出未使用 A2UI 标签或 Markdown 代码块，解析器尝试按原文 JSON 处理。",
			});
		}
		jsonContent = text.trim();
	}

	if (!jsonContent) return { messages: [], diagnostics };

	// Repair common LLM JSON errors
	const repaired = jsonContent
		// Missing opening brace before key: },"version":" -> },{"version":"
		.replace(
			/(?<!})},(\s*"(version|createSurface|updateComponents|updateDataModel|deleteSurface)")/g,
			(_, cap) => `},{${cap}`,
		)
		// Strip backticks and trim whitespace from catalogId values
		// LLM wraps: " `https://...` " -> "https://..."
		.replace(/"catalogId"\s*:\s*"\s*`\s*([^"]*?)\s*`\s*"/g, '"catalogId":"$1"')
		// Also strip backticks from catalogId without leading/trailing spaces
		.replace(/"catalogId"\s*:\s*"`([^"]*)`"/g, '"catalogId":"$1"');
	if (repaired !== jsonContent) {
		addA2uiDiagnostic(diagnostics, {
			code: "a2ui.json-repaired",
			label: "修复 JSON",
			severity: "warning",
			detail: "解析器修复了常见 JSON 格式问题。",
		});
	}

	let parsed: any;
	try {
		parsed = JSON.parse(repaired);
		if (!Array.isArray(parsed)) {
			addA2uiDiagnostic(diagnostics, {
				code: "a2ui.wrapped-single-message",
				label: "包装单条消息",
				severity: "warning",
				detail: "输出不是 A2UI message 数组，已包装为数组。",
			});
			parsed = [parsed];
		}
	} catch (_) {
		// Partial JSON: try to close truncated arrays (try repaired first, then raw)
		const attempts = [repaired, jsonContent];
		for (const attempt of attempts) {
			if (attempt.startsWith("[")) {
				for (let i = attempt.length; i > 0; i--) {
					const candidate = attempt.slice(0, i).trim();
					if (candidate.endsWith("}")) {
						try {
							parsed = JSON.parse(`${candidate}]`);
							addA2uiDiagnostic(diagnostics, {
								code: "a2ui.partial-json-recovered",
								label: "恢复截断 JSON",
								severity: "warning",
								detail: "流式输出中的 JSON 数组尚未完整闭合，解析器尝试恢复可用片段。",
							});
							break;
						} catch (_) {}
					}
				}
			}
			if (parsed) break;
		}
	}

	if (!parsed) {
		addA2uiDiagnostic(diagnostics, {
			code: "a2ui.json-parse-failed",
			label: "JSON 解析失败",
			severity: "error",
			detail: "模型输出无法解析为 A2UI JSON。",
		});
		return { messages: [], diagnostics };
	}
	const messages = normalizeA2uiMessages(parsed, diagnostics);
	validateA2uiMessages(messages, diagnostics);
	return { messages, diagnostics };
}

let isA2uiMode = true;
let a2uiRequesting = false;
let a2uiError: string | null = null;
let a2uiProcessor: MessageProcessor<LitComponentApi>;
let a2uiSurfaces: any[] = [];
let a2uiUnsubscribes: (() => void)[] = [];
let a2uiMessages: A2uiMessage[] = [];
let a2uiRawText = "";
let a2uiLastQuery = "";
let a2uiOutputDiagnostics: A2uiOutputDiagnostic[] = [];

type AiNativeTaskStage = "idle" | "understanding" | "planning" | "executing" | "rendering" | "ready" | "blocked";
type AiNativeStepStatus = "pending" | "active" | "done" | "blocked";
type AiNativeTraceStatus = "running" | "success" | "error" | "waiting";
type AiNativeGovernanceStatus = "pass" | "warning" | "fail";

interface AiNativeTaskProfile {
	id: string;
	query: string;
	intent: string;
	risk: string;
	context: string[];
	tools: string[];
	stage: AiNativeTaskStage;
	startedAt: string;
	updatedAt: string;
}

interface AiNativeToolTrace {
	id: string;
	mode?: ArchiveApiParams["mode"];
	operationId?: string;
	method?: string;
	path?: string;
	risk?: string;
	status: AiNativeTraceStatus;
	startedAt: number;
	durationMs?: number;
	statusCode?: number;
	summary?: string;
	error?: string;
}

interface AiNativeTaskRecord {
	profile: AiNativeTaskProfile;
	trace: AiNativeToolTrace[];
	rawText: string;
	messages: A2uiMessage[];
	outputDiagnostics: A2uiOutputDiagnostic[];
	surfaceCount: number;
	error: string | null;
}

interface AiNativeGovernanceCheck {
	id: string;
	label: string;
	status: AiNativeGovernanceStatus;
	detail: string;
}

type ArchiveManagerSessionData = SessionData & {
	aiNativeTask?: AiNativeTaskRecord;
};

let aiNativeTaskProfile: AiNativeTaskProfile | undefined;
let aiNativeToolTrace: AiNativeToolTrace[] = [];
let aiNativeWorkbenchExpanded = false;

const createAiNativeTaskProfile = (query: string): AiNativeTaskProfile => {
	const now = new Date().toISOString();
	const normalizedQuery = query.toLowerCase();
	const hasWriteIntent = ["创建", "新增", "提交", "修改", "更新", "删除", "审核", "签章", "归档", "邀请", "上传"].some(
		(keyword) => query.includes(keyword),
	);
	const hasDestructiveIntent = ["删除", "作废", "撤销", "归档", "签章", "审核通过", "驳回"].some((keyword) =>
		query.includes(keyword),
	);

	let intent = "档案任务编排";
	if (query.includes("仪表盘") || query.includes("统计") || query.includes("概览")) {
		intent = "运营态势查询";
	} else if (query.includes("预检") || query.includes("失败") || query.includes("警告")) {
		intent = "归档预检分析";
	} else if (query.includes("审核")) {
		intent = "审核任务处理";
	} else if (query.includes("签章")) {
		intent = "签章流转处理";
	} else if (query.includes("项目") || normalizedQuery.includes("project")) {
		intent = "项目档案查询";
	}

	const risk = hasDestructiveIntent ? "高风险动作需确认" : hasWriteIntent ? "写操作需确认" : "只读查询";
	const context = ["租户权限", "工程档案本体", "当前会话"];
	if (query.includes("项目")) context.push("项目状态");
	if (query.includes("审核")) context.push("审核流转");
	if (query.includes("签章")) context.push("签章任务");
	if (query.includes("归档") || query.includes("预检")) context.push("归档规则");

	return {
		id: crypto.randomUUID(),
		query,
		intent,
		risk,
		context,
		tools: ["archive_api", hasWriteIntent ? "confirm_operation" : "read_operation"],
		stage: "understanding",
		startedAt: now,
		updatedAt: now,
	};
};

const updateAiNativeStage = (stage: AiNativeTaskStage) => {
	if (!aiNativeTaskProfile) return;
	aiNativeTaskProfile = { ...aiNativeTaskProfile, stage, updatedAt: new Date().toISOString() };
};

const getAiNativeStepStatus = (
	currentStage: AiNativeTaskStage,
	stepStage: AiNativeTaskStage,
): AiNativeStepStatus => {
	const stageOrder: AiNativeTaskStage[] = ["understanding", "planning", "executing", "rendering", "ready"];
	const currentIndex = stageOrder.indexOf(currentStage);
	const stepIndex = stageOrder.indexOf(stepStage);

	if (currentStage === "blocked") return stepStage === "ready" ? "blocked" : "done";
	if (currentIndex === -1 || stepIndex === -1) return "pending";
	if (currentIndex === stepIndex) return "active";
	return currentIndex > stepIndex ? "done" : "pending";
};

const getAiNativeStageLabel = (stage: AiNativeTaskStage): string => {
	const labels: Record<AiNativeTaskStage, string> = {
		idle: "待处理",
		understanding: "理解意图",
		planning: "组装上下文",
		executing: "调用工具",
		rendering: "生成界面",
		ready: "已完成",
		blocked: "需处理",
	};
	return labels[stage];
};

const getAiNativeStageIcon = (stage: AiNativeTaskStage): string => {
	const icons: Record<AiNativeTaskStage, string> = {
		idle: "radio_button_unchecked",
		understanding: "psychology",
		planning: "hub",
		executing: "progress_activity",
		rendering: "dashboard",
		ready: "verified",
		blocked: "warning",
	};
	return icons[stage];
};

const getArchiveToolArgs = (args: unknown): ArchiveApiParams | undefined => {
	if (!args || typeof args !== "object" || Array.isArray(args)) return undefined;
	const record = args as Partial<ArchiveApiParams>;
	return record.mode ? (record as ArchiveApiParams) : undefined;
};

const getArchiveToolResultDetails = (result: unknown): ArchiveApiResult | undefined => {
	if (!result || typeof result !== "object" || Array.isArray(result)) return undefined;
	const details = (result as { details?: unknown }).details;
	if (!details || typeof details !== "object" || Array.isArray(details)) return undefined;
	return details as ArchiveApiResult;
};

const handleArchiveToolEvent = (event: AgentEvent) => {
	if (!aiNativeTaskProfile || !("toolName" in event) || event.toolName !== "archive_api") return;

	if (event.type === "tool_execution_start") {
		const args = getArchiveToolArgs(event.args);
		aiNativeToolTrace = [
			...aiNativeToolTrace,
			{
				id: event.toolCallId,
				mode: args?.mode,
				operationId: args?.operationId,
				status: "running",
				startedAt: Date.now(),
			},
		];
		updateAiNativeStage("executing");
		return;
	}

	if (event.type !== "tool_execution_end") return;

	const details = getArchiveToolResultDetails(event.result);
	aiNativeToolTrace = aiNativeToolTrace.map((trace) => {
		if (trace.id !== event.toolCallId) return trace;
		const operation = details?.operation;
		const status: AiNativeTraceStatus = details?.requiresConfirmation ? "waiting" : event.isError ? "error" : "success";
		return {
			...trace,
			mode: details?.mode ?? trace.mode,
			operationId: operation?.operationId ?? trace.operationId,
			method: operation?.method ?? trace.method,
			path: details?.request?.path ?? operation?.path ?? trace.path,
			risk: operation?.risk ?? trace.risk,
			status,
			durationMs: Date.now() - trace.startedAt,
			statusCode: details?.status,
			summary: operation?.summary ?? trace.summary,
			error: details?.error,
		};
	});
	updateAiNativeStage(details?.requiresConfirmation ? "blocked" : event.isError ? "blocked" : "executing");
};

const createAiNativeTaskRecord = (): AiNativeTaskRecord | undefined => {
	if (!aiNativeTaskProfile) return undefined;
	return {
		profile: aiNativeTaskProfile,
		trace: aiNativeToolTrace,
		rawText: a2uiRawText,
		messages: a2uiMessages,
		outputDiagnostics: a2uiOutputDiagnostics,
		surfaceCount: a2uiSurfaces.length,
		error: a2uiError,
	};
};

const restoreAiNativeTask = (sessionData: ArchiveManagerSessionData) => {
	const task = sessionData.aiNativeTask;
	if (!task) return;

	aiNativeTaskProfile = task.profile;
	aiNativeToolTrace = task.trace;
	a2uiRawText = task.rawText;
	a2uiMessages = task.messages;
	a2uiOutputDiagnostics = task.outputDiagnostics ?? [];
	a2uiError = task.error;
	a2uiLastQuery = task.profile.query;
	aiNativeWorkbenchExpanded = false;

	if (a2uiMessages.length > 0) {
		a2uiProcessor.processMessages(a2uiMessages);
	}
};

const getAiNativeGovernanceChecks = (taskProfile: AiNativeTaskProfile): AiNativeGovernanceCheck[] => {
	const writeTraces = aiNativeToolTrace.filter((trace) => trace.risk === "write" || trace.risk === "destructive");
	const failedTraces = aiNativeToolTrace.filter((trace) => trace.status === "error");
	const waitingTraces = aiNativeToolTrace.filter((trace) => trace.status === "waiting");
	const completedTraces = aiNativeToolTrace.filter((trace) => trace.status === "success");
	const hasRenderableUi = a2uiMessages.length > 0 && (a2uiSurfaces.length > 0 || taskProfile.stage === "ready");
	const outputDiagnosticStatus = getA2uiDiagnosticStatus(a2uiOutputDiagnostics);

	return [
		{
			id: "intent",
			label: "意图识别",
			status: taskProfile.intent ? "pass" : "fail",
			detail: taskProfile.intent || "未识别到业务意图。",
		},
		{
			id: "tool-selection",
			label: "工具选择",
			status: aiNativeToolTrace.length > 0 ? "pass" : a2uiRequesting ? "warning" : "fail",
			detail:
				aiNativeToolTrace.length > 0
					? `已调用 ${aiNativeToolTrace.length} 次 archive_api。`
					: a2uiRequesting
						? "等待模型选择工具。"
						: "未观察到 archive_api 调用。",
		},
		{
			id: "confirmation",
			label: "确认门禁",
			status: waitingTraces.length > 0 ? "warning" : "pass",
			detail:
				writeTraces.length === 0
					? "当前任务未检测到写入或破坏性调用。"
					: waitingTraces.length > 0
						? "写操作正在等待用户确认。"
						: "写操作已通过确认流程或后端校验。",
		},
		{
			id: "tool-result",
			label: "工具结果",
			status: failedTraces.length > 0 ? "fail" : completedTraces.length > 0 ? "pass" : a2uiRequesting ? "warning" : "fail",
			detail:
				failedTraces.length > 0
					? failedTraces.map((trace) => trace.error ?? `${trace.operationId ?? "archive_api"} 执行失败`).join("；")
					: completedTraces.length > 0
						? `已完成 ${completedTraces.length} 次工具调用。`
						: a2uiRequesting
							? "工具执行尚未完成。"
							: "没有可评估的工具结果。",
		},
		{
			id: "rendering",
			label: "界面渲染",
			status: hasRenderableUi ? "pass" : a2uiRawText ? "fail" : a2uiRequesting ? "warning" : "fail",
			detail: hasRenderableUi
				? `已生成 ${a2uiMessages.length} 条 A2UI 消息。`
				: a2uiRawText
					? "模型输出未形成有效 A2UI surface。"
					: a2uiRequesting
						? "等待 A2UI 输出。"
						: "尚未生成 A2UI 输出。",
		},
		{
			id: "a2ui-quality",
			label: "A2UI 质量",
			status: outputDiagnosticStatus,
			detail: formatA2uiDiagnosticSummary(a2uiOutputDiagnostics),
		},
		{
			id: "replay",
			label: "回放能力",
			status: currentSessionId ? "pass" : "warning",
			detail: currentSessionId ? `已绑定 session ${currentSessionId}。` : "尚未创建 session，刷新后不可回放。",
		},
	];
};

const getAiNativeGovernanceStatus = (
	checks: AiNativeGovernanceCheck[],
): { status: AiNativeGovernanceStatus; label: string } => {
	if (checks.some((check) => check.status === "fail")) return { status: "fail", label: "失败" };
	if (checks.some((check) => check.status === "warning")) return { status: "warning", label: "警告" };
	return { status: "pass", label: "通过" };
};

function approveArchiveOperationFromAction(action: unknown): boolean {
	if (!action || typeof action !== "object") return false;
	const context = "context" in action ? action.context : undefined;
	const approval = readArchiveOperationRequest(context);
	if (!approval) return false;

	approvedArchiveOperations.set(approval.confirmationKey, buildArchiveOperationFingerprint(approval.request));
	return true;
}

const initA2ui = () => {
	for (const unsub of a2uiUnsubscribes) {
		unsub();
	}
	a2uiUnsubscribes = [];
	a2uiSurfaces = [];
	a2uiMessages = [];
	a2uiError = null;
	a2uiLastQuery = "";
	a2uiOutputDiagnostics = [];
	aiNativeTaskProfile = undefined;
	aiNativeToolTrace = [];
	aiNativeWorkbenchExpanded = false;

	a2uiProcessor = new MessageProcessor([basicCatalog], (action: any) => {
		console.log("User action received from A2UI:", action);
		if (action?.name === "archive.cancelOperation") {
			const response = createArchiveActionCancelledMessages();
			a2uiProcessor.processMessages(response);
			a2uiMessages = response;
			updateAiNativeStage("ready");
			if (currentSessionId) {
				saveSession();
			}
			renderApp();
			return;
		}
		if (action?.name === "archive.confirmOperation") {
			approveArchiveOperationFromAction(action);
		}
		sendAndProcessA2ui({ version: "v0.9", action });
	});

	const sub1 = a2uiProcessor.onSurfaceCreated((surface: any) => {
		a2uiSurfaces = [...a2uiSurfaces, surface];
		renderApp();
	});
	const sub2 = a2uiProcessor.onSurfaceDeleted((id: string) => {
		a2uiSurfaces = a2uiSurfaces.filter((s) => s.id !== id);
		renderApp();
	});

	a2uiUnsubscribes.push(() => sub1.unsubscribe());
	a2uiUnsubscribes.push(() => sub2.unsubscribe());
};

const sendAndProcessA2ui = async (message: any) => {
	a2uiRequesting = true;
	a2uiError = null;
	renderApp();

	try {
		const provider = agent.state.model?.provider;
		if (provider && !(await providerKeys.get(provider))) {
			const ok = await ApiKeyPromptDialog.prompt(provider);
			if (!ok) {
				a2uiRequesting = false;
				renderApp();
				return;
			}
		}

		if (typeof message === "string") {
			a2uiLastQuery = message;
			aiNativeTaskProfile = createAiNativeTaskProfile(message);
			aiNativeToolTrace = [];
			aiNativeWorkbenchExpanded = false;
			if (!currentSessionId) {
				currentSessionId = crypto.randomUUID();
				updateUrl(currentSessionId);
			}
			if (!currentTitle) {
				currentTitle = message.length <= 50 ? message : `${message.substring(0, 47)}...`;
			}
			Array.from(a2uiProcessor.model.surfacesMap.keys()).forEach((id) => {
				a2uiProcessor.model.deleteSurface(id);
			});
			a2uiSurfaces = [];
			a2uiMessages = [];
			a2uiRawText = "";
			a2uiOutputDiagnostics = [];
			renderApp();

			agent.reset();
			agent.state.systemPrompt = ARCHIVE_MANAGER_SYSTEM_PROMPT;
			agent.state.tools = [archiveApiTool];
			await agent.prompt(message);
		} else {
			updateAiNativeStage("executing");
			await agent.prompt(JSON.stringify(message));
		}
	} catch (err: any) {
		console.error("Error running A2UI flow:", err);
		a2uiError = err instanceof Error ? err.message : String(err);
		updateAiNativeStage("blocked");
		a2uiRequesting = false;
		renderApp();
	}
};

const handleA2uiSubmit = (e: Event) => {
	e.preventDefault();
	const form = e.target as HTMLFormElement;
	const input = form.querySelector("#a2ui-query") as HTMLInputElement;
	if (input?.value.trim()) {
		sendAndProcessA2ui(input.value.trim());
	}
};

const generateTitle = (messages: AgentMessage[]): string => {
	const firstUserMsg = messages.find((m) => m.role === "user");
	if (!firstUserMsg) return "";

	let text = "";
	const content = firstUserMsg.content;

	if (typeof content === "string") {
		text = content;
	} else {
		const textBlocks = content.filter((c): c is TextContent => c.type === "text");
		text = textBlocks.map((c) => c.text || "").join(" ");
	}

	text = text.trim();
	if (!text) return "";

	const sentenceEnd = text.search(/[.!?]/);
	if (sentenceEnd > 0 && sentenceEnd <= 50) {
		return text.substring(0, sentenceEnd + 1);
	}
	return text.length <= 50 ? text : `${text.substring(0, 47)}...`;
};

const shouldSaveSession = (messages: AgentMessage[]): boolean => {
	const hasUserMsg = messages.some((m) => m.role === "user");
	const hasAssistantMsg = messages.some((m) => m.role === "assistant");
	return hasUserMsg && hasAssistantMsg;
};

const saveSession = async () => {
	if (!storage.sessions || !currentSessionId || !agent || !currentTitle) return;

	const state = agent.state;
	if (!shouldSaveSession(state.messages)) return;

	try {
		// Create session data
		const sessionData: ArchiveManagerSessionData = {
			id: currentSessionId,
			title: currentTitle,
			model: state.model!,
			thinkingLevel: state.thinkingLevel,
			messages: state.messages,
			createdAt: new Date().toISOString(),
			lastModified: new Date().toISOString(),
			aiNativeTask: createAiNativeTaskRecord(),
		};

		// Create session metadata
		const metadata = {
			id: currentSessionId,
			title: currentTitle,
			createdAt: sessionData.createdAt,
			lastModified: sessionData.lastModified,
			messageCount: state.messages.length,
			usage: {
				input: 0,
				output: 0,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens: 0,
				cost: {
					input: 0,
					output: 0,
					cacheRead: 0,
					cacheWrite: 0,
					total: 0,
				},
			},
			modelId: state.model?.id || null,
			thinkingLevel: state.thinkingLevel,
			preview: generateTitle(state.messages),
		};

		await storage.sessions.save(sessionData, metadata);
	} catch (err) {
		console.error("Failed to save session:", err);
	}
};

const updateUrl = (sessionId: string) => {
	const url = new URL(window.location.href);
	url.searchParams.set("session", sessionId);
	window.history.replaceState({}, "", url);
};

const createAgent = async (initialState?: Partial<AgentState>) => {
	if (agentUnsubscribe) {
		agentUnsubscribe();
	}

	agent = new Agent({
		initialState: initialState || {
			systemPrompt: `You are a helpful AI assistant with access to various tools.

Available tools:
- JavaScript REPL: Execute JavaScript code in a sandboxed browser environment (can do calculations, get time, process data, create visualizations, etc.)
- Artifacts: Create interactive HTML, SVG, Markdown, and text artifacts

Feel free to use these tools when needed to provide accurate and helpful responses.`,
			model: getModel("deepseek", "deepseek-v4-flash"),
			thinkingLevel: "off",
			messages: [],
			tools: [],
		},
		// Custom transformer: convert custom messages to LLM-compatible format
		convertToLlm: customConvertToLlm,
		getApiKey: async (provider: string) => {
			const key = await providerKeys.get(provider);
			return key ?? undefined;
		},
		streamFn: createStreamFn(async () => {
			const enabled = await settings.get<boolean>("proxy.enabled");
			return enabled ? (await settings.get<string>("proxy.url")) || undefined : undefined;
		}),
	});

	agentUnsubscribe = agent.subscribe((event: AppAgentEvent) => {
		if (isA2uiMode) {
			try {
				if (event.type !== "state-update") {
					handleArchiveToolEvent(event);
				}
				if (event.type === "message_start") {
					a2uiRequesting = true;
					a2uiError = null;
					if (event.message?.role === "assistant") {
						updateAiNativeStage("planning");
						Array.from(a2uiProcessor.model.surfacesMap.keys()).forEach((id) => {
							a2uiProcessor.model.deleteSurface(id);
						});
						a2uiSurfaces = [];
						a2uiMessages = [];
					}
					renderApp();
				} else if (event.type === "message_update" || event.type === "message_end") {
					if (event.message?.role === "assistant") {
						a2uiRawText = getMessageText(event.message);
						const parsed = parseIncrementalA2uiJson(a2uiRawText);
						a2uiOutputDiagnostics = parsed.diagnostics;
						if (parsed.messages.length > a2uiMessages.length) {
							updateAiNativeStage("rendering");
							const newMessages = parsed.messages.slice(a2uiMessages.length);
							a2uiProcessor.processMessages(newMessages);
							a2uiMessages = parsed.messages;
						} else if (a2uiRawText.length > 0) {
							updateAiNativeStage("executing");
						}
						renderApp();
					}
				} else if (
					event.type === "tool_execution_start" ||
					event.type === "tool_execution_update" ||
					event.type === "tool_execution_end"
				) {
					renderApp();
				} else if (event.type === "agent_end") {
					a2uiRequesting = false;
					if (agent.state.errorMessage) {
						a2uiError = agent.state.errorMessage;
						updateAiNativeStage("blocked");
					} else if (!a2uiError && a2uiMessages.length === 0 && a2uiRawText.length > 0) {
						a2uiError =
							"LLM 返回了内容但未包含有效的 A2UI JSON。请展开下方「Raw LLM Output Stream」查看原始输出。";
						updateAiNativeStage("blocked");
					} else {
						updateAiNativeStage("ready");
					}
					if (currentSessionId) {
						saveSession();
					}
					renderApp();
				}
			} catch (err: unknown) {
				console.error("Error processing A2UI stream event:", err);
				a2uiError = err instanceof Error ? err.message : String(err);
				updateAiNativeStage("blocked");
				a2uiRequesting = false;
				renderApp();
			}
		}

		if (event.type === "state-update") {
			const messages = event.state.messages;

			// Generate title after first successful response
			if (!currentTitle && shouldSaveSession(messages)) {
				currentTitle = generateTitle(messages);
			}

			// Create session ID on first successful save
			if (!currentSessionId && shouldSaveSession(messages)) {
				currentSessionId = crypto.randomUUID();
				updateUrl(currentSessionId);
			}

			// Auto-save
			if (currentSessionId) {
				saveSession();
			}

			renderApp();
		}
	});

	await chatPanel.setAgent(agent, {
		onApiKeyRequired: async (provider: string) => {
			return await ApiKeyPromptDialog.prompt(provider);
		},
		toolsFactory: (_agent, _agentInterface, _artifactsPanel, runtimeProvidersFactory) => {
			// Create javascript_repl tool with access to attachments + artifacts
			const replTool = createJavaScriptReplTool();
			replTool.runtimeProvidersFactory = runtimeProvidersFactory;

			// Create web search tool using Tavily
			const searchTool = createWebSearchTool();
			if (config.apiKeys.tavily) {
				searchTool.tavilyApiKey = config.apiKeys.tavily;
			}

			return [replTool, searchTool, archiveApiTool];
		},
	});
};

const loadSession = async (sessionId: string): Promise<boolean> => {
	if (!storage.sessions) return false;

	const sessionData = (await storage.sessions.get(sessionId)) as ArchiveManagerSessionData | null;
	if (!sessionData) {
		console.error("Session not found:", sessionId);
		return false;
	}

	currentSessionId = sessionId;
	const metadata = await storage.sessions.getMetadata(sessionId);
	currentTitle = metadata?.title || "";

	await createAgent({
		model: sessionData.model,
		thinkingLevel: sessionData.thinkingLevel,
		messages: sessionData.messages,
		tools: [],
	});

	if (isA2uiMode) {
		initA2ui();
		restoreAiNativeTask(sessionData);
	}

	updateUrl(sessionId);
	renderApp();
	return true;
};

const newSession = () => {
	const url = new URL(window.location.href);
	url.search = "";
	window.location.href = url.toString();
};

// ============================================================================
// RENDER
// ============================================================================
const renderAiNativeWorkbench = (showForm: boolean) => {
	if (showForm || !aiNativeTaskProfile) return "";
	const taskProfile = aiNativeTaskProfile;

	const taskSteps: { icon: string; label: string; stage: AiNativeTaskStage }[] = [
		{ icon: "psychology", label: "理解意图", stage: "understanding" },
		{ icon: "hub", label: "组装上下文", stage: "planning" },
		{ icon: "build", label: "调用工具", stage: "executing" },
		{ icon: "dashboard", label: "生成界面", stage: "rendering" },
		{ icon: "verified", label: "治理校验", stage: "ready" },
	];
	const traceStatusLabels: Record<AiNativeTraceStatus, string> = {
		running: "执行中",
		success: "已完成",
		error: "失败",
		waiting: "等待确认",
	};
	const governanceChecks = getAiNativeGovernanceChecks(taskProfile);
	const governanceStatus = getAiNativeGovernanceStatus(governanceChecks);
	const governanceIcon =
		governanceStatus.status === "pass" ? "verified" : governanceStatus.status === "warning" ? "warning" : "error";
	const evalResult = evaluateAiNativeTask({
		query: taskProfile.query,
		intent: taskProfile.intent,
		trace: aiNativeToolTrace,
		hasA2uiMessages: a2uiMessages.length > 0,
		hasSurface: a2uiSurfaces.length > 0,
		isRequesting: a2uiRequesting,
		hasError: Boolean(a2uiError),
	});
	const evalStatusLabels: Record<AiNativeEvalStatus, string> = {
		pass: "通过",
		warning: "观察中",
		fail: "失败",
	};
	const compactStageIcon = getAiNativeStageIcon(taskProfile.stage);
	const compactStageLabel = getAiNativeStageLabel(taskProfile.stage);
	const diagnosticCount = a2uiOutputDiagnostics.length;

	return html`
		<section class="ai-native-workbench" aria-label="任务中枢">
			<div class="ai-native-compact">
				<div class="ai-native-compact-icon">
					<span class="material-symbols-outlined">${compactStageIcon}</span>
				</div>
				<div class="ai-native-compact-main">
					<div class="ai-native-compact-title">
						<span>任务中枢</span>
						<span>${compactStageLabel}</span>
						<span>${taskProfile.intent}</span>
					</div>
					<div class="ai-native-compact-query">${taskProfile.query}</div>
				</div>
				<div class="ai-native-compact-badges">
					<span class="ai-native-compact-badge">${taskProfile.risk}</span>
					<span class="ai-native-compact-badge">${aiNativeToolTrace.length} 次工具</span>
					<span class="ai-native-compact-badge ${governanceStatus.status}">${governanceStatus.label}</span>
					${diagnosticCount > 0 ? html`<span class="ai-native-compact-badge warning">${diagnosticCount} 项诊断</span>` : ""}
				</div>
				<button
					type="button"
					class="ai-native-compact-toggle"
					aria-expanded=${aiNativeWorkbenchExpanded ? "true" : "false"}
					@click=${() => {
						aiNativeWorkbenchExpanded = !aiNativeWorkbenchExpanded;
						renderApp();
					}}
				>
					<span>${aiNativeWorkbenchExpanded ? "收起" : "诊断"}</span>
					<span class="material-symbols-outlined">
						${aiNativeWorkbenchExpanded ? "expand_less" : "expand_more"}
					</span>
				</button>
			</div>

			${
				aiNativeWorkbenchExpanded
					? html`
						<div class="ai-native-details">
							<div class="ai-native-grid">
								<div class="ai-native-cell">
									<div class="ai-native-label">意图</div>
									<div class="ai-native-value">${taskProfile.intent}</div>
								</div>
								<div class="ai-native-cell">
									<div class="ai-native-label">上下文</div>
									<div class="ai-native-tags">
										${taskProfile.context.map((item) => html`<span>${item}</span>`)}
									</div>
								</div>
								<div class="ai-native-cell">
									<div class="ai-native-label">工具</div>
									<div class="ai-native-tags">
										${taskProfile.tools.map((item) => html`<span>${item}</span>`)}
									</div>
								</div>
							</div>

							<ol class="ai-native-steps">
								${taskSteps.map((step) => {
									const status = getAiNativeStepStatus(taskProfile.stage, step.stage);
									return html`
										<li class="ai-native-step ${status}">
											<span class="material-symbols-outlined">${step.icon}</span>
											<span>${step.label}</span>
										</li>
									`;
								})}
							</ol>

							${
								aiNativeToolTrace.length > 0
									? html`
										<div class="ai-native-trace">
											<div class="ai-native-trace-title">执行时间线</div>
											${aiNativeToolTrace.map(
												(trace) => html`
													<div class="ai-native-trace-item ${trace.status}">
														<div class="ai-native-trace-status">
															<span class="material-symbols-outlined">
																${trace.status === "running"
																	? "progress_activity"
																	: trace.status === "success"
																		? "check"
																		: trace.status === "waiting"
																			? "pending_actions"
																			: "error"}
															</span>
															<span>${traceStatusLabels[trace.status]}</span>
														</div>
														<div class="ai-native-trace-main">
															<div class="ai-native-trace-operation">
																${trace.operationId ?? trace.mode ?? "archive_api"}
															</div>
															<div class="ai-native-trace-meta">
																${trace.method ? html`<span>${trace.method}</span>` : ""}
																${trace.path ? html`<span>${trace.path}</span>` : ""}
																${trace.risk ? html`<span>${trace.risk}</span>` : ""}
																${trace.statusCode ? html`<span>HTTP ${trace.statusCode}</span>` : ""}
																${trace.durationMs !== undefined ? html`<span>${trace.durationMs}ms</span>` : ""}
															</div>
															${trace.summary
																? html`<div class="ai-native-trace-summary">${trace.summary}</div>`
																: ""}
															${trace.error ? html`<div class="ai-native-trace-error">${trace.error}</div>` : ""}
														</div>
													</div>
												`,
											)}
										</div>
									`
									: ""
							}

							<div class="ai-native-governance ${governanceStatus.status}">
								<div class="ai-native-governance-header">
									<div class="ai-native-governance-title">
										<span class="material-symbols-outlined">${governanceIcon}</span>
										<span>治理校验</span>
									</div>
									<div class="ai-native-governance-badge">${governanceStatus.label}</div>
								</div>
								<div class="ai-native-governance-list">
									${governanceChecks.map(
										(check) => html`
											<div class="ai-native-governance-check ${check.status}">
												<span class="material-symbols-outlined">
													${check.status === "pass" ? "check" : check.status === "warning" ? "warning" : "error"}
												</span>
												<div class="ai-native-governance-copy">
													<div class="ai-native-governance-label">${check.label}</div>
													<div class="ai-native-governance-detail">${check.detail}</div>
												</div>
											</div>
										`,
									)}
								</div>
								${
									a2uiOutputDiagnostics.length > 0
										? html`
											<div class="ai-native-quality">
												<div class="ai-native-quality-title">A2UI 质量诊断</div>
												<div class="ai-native-quality-list">
													${a2uiOutputDiagnostics.map(
														(diagnostic) => html`
															<div class="ai-native-quality-item ${diagnostic.severity}">
																<span class="ai-native-quality-severity">
																	${diagnostic.severity === "error"
																		? "错误"
																		: diagnostic.severity === "warning"
																			? "警告"
																			: "信息"}
																</span>
																<div class="ai-native-quality-copy">
																	<div class="ai-native-quality-label">
																		${diagnostic.label}${diagnostic.count > 1 ? ` x${diagnostic.count}` : ""}
																	</div>
																	<div class="ai-native-quality-detail">${diagnostic.detail}</div>
																</div>
															</div>
														`,
													)}
												</div>
											</div>
										`
										: ""
								}
								<div class="ai-native-eval">
									<div class="ai-native-eval-header">
										<div class="ai-native-eval-title">回归评估</div>
										<div class="ai-native-eval-case">${evalResult.matchedCase.title}</div>
									</div>
									<div class="ai-native-eval-coverage">
										<div>
											<span>${evalResult.coverage.totalCases}</span>
											<label>场景</label>
										</div>
										<div>
											<span>${evalResult.coverage.totalAssertions}</span>
											<label>断言</label>
										</div>
										<div>
											<span>${evalResult.coverage.passedAssertions}</span>
											<label>通过</label>
										</div>
										<div>
											<span>${evalResult.coverage.warningAssertions}</span>
											<label>观察</label>
										</div>
										<div>
											<span>${evalResult.coverage.failedAssertions}</span>
											<label>失败</label>
										</div>
									</div>
									<div class="ai-native-eval-list">
										${evalResult.assertions.map(
											(assertion) => html`
												<div class="ai-native-eval-assertion ${assertion.status}">
													<span class="ai-native-eval-status">${evalStatusLabels[assertion.status]}</span>
													<div class="ai-native-eval-copy">
														<div class="ai-native-eval-label">${assertion.label}</div>
														<div class="ai-native-eval-detail">${assertion.detail}</div>
													</div>
												</div>
											`,
										)}
									</div>
								</div>
							</div>
						</div>
					`
					: ""
			}
		</section>
	`;
};

const renderA2uiContent = () => {
	const hasSurfaces = a2uiSurfaces.length > 0;
	const showForm = !a2uiRequesting && a2uiMessages.length === 0;

	return html`
		<div class="flex-1 flex flex-col overflow-hidden relative">
			<!-- Compact search bar when there are results/loading -->
			${
				!showForm
					? html`
					<div class="compact-search-bar">
						<div class="compact-logo">
							<span class="material-symbols-outlined">folder_shared</span>
							<span>Archive Manager</span>
						</div>
						<form class="compact-form" @submit=${handleA2uiSubmit}>
							<input
								required
								placeholder="输入新查询，例如：查看仪表盘..."
								autoComplete="off"
								id="a2ui-query"
								name="query"
								type="text"
								.value=${a2uiLastQuery}
								?disabled=${a2uiRequesting}
							/>
							<button type="submit" ?disabled=${a2uiRequesting}>
								<span class="material-symbols-outlined">send</span>
							</button>
						</form>
					</div>
				`
					: ""
			}
			<div class="flex-1 overflow-y-auto">
				<div class="shell">
					<!-- Initial search form -->
					${
						showForm
							? html`
							<form class="search-form" @submit=${handleA2uiSubmit}>
								<div class="archive-kicker">AI-native Archive Manager</div>
								<h1 class="app-title">Archive Manager</h1>
								<p class="app-subtitle">用自然语言查询、编制、审核、签章、预检和归档工程档案。</p>
								<div class="input-row">
									<input
										required
										placeholder="例如：查看仪表盘统计和最近项目"
										autoComplete="off"
										id="a2ui-query"
										name="query"
										type="text"
										?disabled=${a2uiRequesting}
									/>
									<button type="submit" ?disabled=${a2uiRequesting}>
										<span class="material-symbols-outlined">send</span>
									</button>
								</div>

								<div class="quick-prompts">
									${ARCHIVE_QUICK_PROMPTS.map(
										(prompt) => html`
											<button
												type="button"
												class="quick-prompt"
												@click=${() => {
													sendAndProcessA2ui(prompt);
												}}
											>
												${prompt}
											</button>
										`,
									)}
								</div>
							</form>
						`
							: ""
					}

					${renderAiNativeWorkbench(showForm)}

					<!-- Loading State -->
					${
						a2uiRequesting
							? html`
							<div class="pending">
								<div class="spinner"></div>
								<div class="loading-text">Archive Manager agent is working...</div>
							</div>
						`
							: ""
					}

					<!-- Error State -->
					${a2uiError ? html`<div class="error">${a2uiError}</div>` : ""}

					<!-- Raw Output Panel -->
					${
						a2uiRawText
							? html`
						<div class="raw-output-panel">
							<details ?open=${!hasSurfaces}>
								<summary>Raw LLM Output Stream</summary>
								<pre class="raw-code"><code>${a2uiRawText}</code></pre>
							</details>
						</div>
					`
							: ""
					}

					<!-- Surfaces rendering -->
					${
						hasSurfaces
							? html`
							<section class="surfaces">
								${a2uiSurfaces.map((surface) => html`<a2ui-surface .surface=${surface}></a2ui-surface>`)}
							</section>
						`
							: ""
					}
				</div>
			</div>
		</div>
	`;
};

// ============================================================================
// RENDER
// ============================================================================
const renderApp = () => {
	const app = document.getElementById("app");
	if (!app) return;

	const appHtml = html`
		<div class="w-full h-screen flex flex-col bg-background text-foreground overflow-hidden">
			<!-- Header -->
			<div class="flex items-center justify-between border-b border-border shrink-0">
				<div class="flex items-center gap-2 px-4 py-">
					${Button({
						variant: "ghost",
						size: "sm",
						children: icon(History, "sm"),
						onClick: () => {
							SessionListDialog.open(
								async (sessionId) => {
									await loadSession(sessionId);
								},
								(deletedSessionId) => {
									// Only reload if the current session was deleted
									if (deletedSessionId === currentSessionId) {
										newSession();
									}
								},
							);
						},
						title: "Sessions",
					})}
					${Button({
						variant: "ghost",
						size: "sm",
						children: icon(Plus, "sm"),
						onClick: newSession,
						title: "New Session",
					})}

					${
						currentTitle
							? isEditingTitle
								? html`<div class="flex items-center gap-2">
									${Input({
										type: "text",
										value: currentTitle,
										className: "text-sm w-64",
										onChange: async (e: Event) => {
											const newTitle = (e.target as HTMLInputElement).value.trim();
											if (newTitle && newTitle !== currentTitle && storage.sessions && currentSessionId) {
												await storage.sessions.updateTitle(currentSessionId, newTitle);
												currentTitle = newTitle;
											}
											isEditingTitle = false;
											renderApp();
										},
										onKeyDown: async (e: KeyboardEvent) => {
											if (e.key === "Enter") {
												const newTitle = (e.target as HTMLInputElement).value.trim();
												if (newTitle && newTitle !== currentTitle && storage.sessions && currentSessionId) {
													await storage.sessions.updateTitle(currentSessionId, newTitle);
													currentTitle = newTitle;
												}
												isEditingTitle = false;
												renderApp();
											} else if (e.key === "Escape") {
												isEditingTitle = false;
												renderApp();
											}
										},
									})}
								</div>`
								: html`<button
									class="px-2 py-1 text-sm text-foreground hover:bg-secondary rounded transition-colors"
									@click=${() => {
										isEditingTitle = true;
										renderApp();
										requestAnimationFrame(() => {
											const input = app?.querySelector('input[type="text"]') as HTMLInputElement;
											if (input) {
												input.focus();
												input.select();
											}
										});
									}}
									title="Click to edit title"
								>
									${currentTitle}
								</button>`
							: html`<span class="text-base font-semibold text-foreground">Archive Manager</span>`
					}
				</div>
				<div class="flex items-center gap-1 px-2">
					${Button({
						variant: "ghost",
						size: "sm",
						children: isA2uiMode ? icon(MessageSquare, "sm") : icon(Sparkles, "sm"),
						onClick: () => {
							isA2uiMode = !isA2uiMode;
							if (isA2uiMode) {
								initA2ui();
							}
							renderApp();
						},
						title: isA2uiMode ? "Switch to standard Chat" : "Switch to Archive Manager A2UI",
					})}
					${Button({
						variant: "ghost",
						size: "sm",
						children: icon(Bell, "sm"),
						onClick: () => {
							// Demo: Inject custom message (will appear on next agent run)
							if (agent) {
								agent.steer(
									createSystemNotification(
										"This is a custom message! It appears in the UI but is never sent to the LLM.",
									),
								);
							}
						},
						title: "Demo: Add Custom Notification",
					})}
					<theme-toggle></theme-toggle>
					${Button({
						variant: "ghost",
						size: "sm",
						children: icon(Settings, "sm"),
						onClick: () => SettingsDialog.open([new ProvidersModelsTab(), new ProxyTab()]),
						title: "Settings",
					})}
				</div>
			</div>

			<!-- Main View -->
			${isA2uiMode ? renderA2uiContent() : chatPanel}
		</div>
	`;

	render(appHtml, app);
};

// ============================================================================
// INIT
// ============================================================================
async function initApp() {
	const app = document.getElementById("app");
	if (!app) throw new Error("App container not found");

	// Register global markdown context provider
	new ContextProvider(document.body, {
		context: Context.markdown,
		initialValue: renderMarkdown,
	});

	// Show loading
	render(
		html`
			<div class="w-full h-screen flex items-center justify-center bg-background text-foreground">
				<div class="text-muted-foreground">Loading...</div>
			</div>
		`,
		app,
	);

	// TODO: Fix PersistentStorageDialog - currently broken
	// Request persistent storage
	// if (storage.sessions) {
	// 	await PersistentStorageDialog.request();
	// }

	// Pre-set DeepSeek API key from config
	if (config.apiKeys.deepseek) {
		await providerKeys.set("deepseek", config.apiKeys.deepseek);
	}

	// Auto-login for API query tool
	await refreshApiToken();
	// Refresh token every 10 minutes
	setInterval(refreshApiToken, 10 * 60 * 1000);

	// Create ChatPanel
	chatPanel = new ChatPanel();

	// Check for session in URL
	const urlParams = new URLSearchParams(window.location.search);
	const sessionIdFromUrl = urlParams.get("session");

	let loadedFromUrl = false;
	if (sessionIdFromUrl) {
		const loaded = await loadSession(sessionIdFromUrl);
		if (!loaded) {
			// Session doesn't exist, redirect to new session
			newSession();
			return;
		}
		loadedFromUrl = true;
	} else {
		await createAgent();
	}

	if (isA2uiMode && !loadedFromUrl) {
		initA2ui();
	}

	renderApp();
}

initApp();
