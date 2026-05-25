import "@mariozechner/mini-lit/dist/ThemeToggle.js";
import { Agent, type AgentMessage } from "@earendil-works/pi-agent-core";
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
import {
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

function normalizeA2uiMessages(messages: A2uiMessage[]): A2uiMessage[] {
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
			action.event = { name: action.name };
			delete action.name;
		}
		if (typeof action.event === "string") {
			action.event = { name: action.event };
		}

		if (isRecord(action.event) && isRecord(action.event.context)) {
			for (const [key, value] of Object.entries(action.event.context)) {
				action.event.context[key] = normalizeDynamicString(value, templatePath);
			}
		}

		if (isRecord(action.contextBindings) && isRecord(action.event)) {
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
				msg.updateComponents.surfaceId = "default";
			}
			if ("updateDataModel" in msg && isRecord(msg.updateDataModel) && !msg.updateDataModel.surfaceId) {
				msg.updateDataModel.surfaceId = "default";
			}
		}
	}

	// Step 0.2: Auto-generate createSurface if missing (LLM often skips this)
	const hasCreateSurface = messages.some((m) => "createSurface" in m);
	const hasUpdateOrData = messages.some((m) => "updateComponents" in m || "updateDataModel" in m);
	if (!hasCreateSurface && hasUpdateOrData) {
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
			comp.id = comp.componentId;
			delete comp.componentId;
		}

		if (comp.type && !comp.component) {
			const type = getString(comp.type);
			if (type && /^[A-Z][a-zA-Z0-9_]*$/.test(type)) {
				comp.component = type;
			}
		}

		if (isRecord(comp.properties)) {
			for (const [key, value] of Object.entries(comp.properties)) {
				if (comp[key] === undefined) {
					comp[key] = value;
				}
			}
			delete comp.properties;
		}

		if (Array.isArray(comp.components) && comp.children === undefined) {
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
			comp.text = { path: normalizeBindingPath(comp.textPath, templatePath) };
			delete comp.textPath;
		}

		if (componentName === "Text" && comp.text === undefined && comp.value !== undefined) {
			comp.text = normalizeDynamicString(comp.value, templatePath);
			delete comp.value;
		}
		if (componentName === "Image" && comp.url === undefined && typeof comp.sourcePath === "string") {
			comp.url = { path: normalizeBindingPath(comp.sourcePath, templatePath) };
			delete comp.sourcePath;
		}
		if (componentName === "Image" && comp.url === undefined && typeof comp.source === "string") {
			comp.url = normalizeDynamicString(comp.source, templatePath);
			delete comp.source;
		}
		if (componentName === "Image" && comp.url === undefined && typeof comp.src === "string") {
			comp.url = normalizeDynamicString(comp.src, templatePath);
			delete comp.src;
		}
		if (componentName === "Image" && comp.url === undefined && typeof comp.imageUrl === "string") {
			comp.url = normalizeDynamicString(comp.imageUrl, templatePath);
			delete comp.imageUrl;
		}
		if (componentName === "Image" && comp.url === undefined && typeof comp.value === "string") {
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
						comp.id = getAutoId(getString(comp.component) ?? "component");
					}
					const compId = String(comp.id);
					const componentName = getComponentName(comp);

					if (
						componentName === "Button" &&
						comp.child === undefined &&
						(typeof comp.label === "string" || typeof comp.text === "string" || typeof comp.value === "string")
					) {
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
						let listPath = "/items";
						if (typeof comp.value.items === "string") {
							listPath = comp.value.items;
						}
						const templateId = processAndFlatten(comp.value.template, listPath);
						comp.children = { componentId: templateId, path: listPath };
						delete comp.value;
					}

					if (componentName === "Card" && Array.isArray(comp.children)) {
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

function parseIncrementalA2uiJson(text: string): A2uiMessage[] {
	const startTag = "<a2ui-json>";
	const endTag = "</a2ui-json>";
	const startIndex = text.indexOf(startTag);

	let jsonContent: string | undefined;

	if (startIndex !== -1) {
		jsonContent = text.slice(startIndex + startTag.length);
		const endIndex = jsonContent.indexOf(endTag);
		if (endIndex !== -1) {
			jsonContent = jsonContent.slice(0, endIndex);
		}
	} else {
		// Fallback 1: markdown code block ```json ... ```
		const mdMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
		if (mdMatch) {
			jsonContent = mdMatch[1].trim();
		}
	}

	if (!jsonContent) {
		// Fallback 2: try the raw text itself (pure JSON)
		jsonContent = text.trim();
	}

	if (!jsonContent) return [];

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

	let parsed: any;
	try {
		parsed = JSON.parse(repaired);
		if (!Array.isArray(parsed)) {
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
							break;
						} catch (_) {}
					}
				}
			}
			if (parsed) break;
		}
	}

	if (!parsed) return [];
	return normalizeA2uiMessages(parsed);
}

let isA2uiMode = true;
let a2uiRequesting = false;
let a2uiError: string | null = null;
let a2uiProcessor: MessageProcessor<LitComponentApi>;
let a2uiSurfaces: any[] = [];
let a2uiUnsubscribes: (() => void)[] = [];
let a2uiMessages: A2uiMessage[] = [];
let a2uiRawText = "";

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

	a2uiProcessor = new MessageProcessor([basicCatalog], (action: any) => {
		console.log("User action received from A2UI:", action);
		if (action?.name === "archive.cancelOperation") {
			const response = createArchiveActionCancelledMessages();
			a2uiProcessor.processMessages(response);
			a2uiMessages = response;
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
			Array.from(a2uiProcessor.model.surfacesMap.keys()).forEach((id) => {
				a2uiProcessor.model.deleteSurface(id);
			});
			a2uiSurfaces = [];
			a2uiMessages = [];
			a2uiRawText = "";
			renderApp();

			agent.reset();
			agent.state.systemPrompt = ARCHIVE_MANAGER_SYSTEM_PROMPT;
			agent.state.tools = [archiveApiTool];
			await agent.prompt(message);
		} else {
			await agent.prompt(JSON.stringify(message));
		}
	} catch (err: any) {
		console.error("Error running A2UI flow:", err);
		a2uiError = err instanceof Error ? err.message : String(err);
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
		const sessionData = {
			id: currentSessionId,
			title: currentTitle,
			model: state.model!,
			thinkingLevel: state.thinkingLevel,
			messages: state.messages,
			createdAt: new Date().toISOString(),
			lastModified: new Date().toISOString(),
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

	agentUnsubscribe = agent.subscribe((event: any) => {
		if (isA2uiMode) {
			try {
				if (event.type === "message_start") {
					a2uiRequesting = true;
					a2uiError = null;
					if (event.message?.role === "assistant") {
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
						if (parsed.length > a2uiMessages.length) {
							const newMessages = parsed.slice(a2uiMessages.length);
							a2uiProcessor.processMessages(newMessages);
							a2uiMessages = parsed;
						}
						renderApp();
					}
				} else if (event.type === "agent_end") {
					a2uiRequesting = false;
					if (agent.state.errorMessage) {
						a2uiError = agent.state.errorMessage;
					} else if (!a2uiError && a2uiMessages.length === 0 && a2uiRawText.length > 0) {
						a2uiError =
							"LLM 返回了内容但未包含有效的 A2UI JSON。请展开下方「Raw LLM Output Stream」查看原始输出。";
					}
					renderApp();
				}
			} catch (err: any) {
				console.error("Error processing A2UI stream event:", err);
				a2uiError = err instanceof Error ? err.message : String(err);
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

	const sessionData = await storage.sessions.get(sessionId);
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
const renderA2uiContent = () => {
	const hasSurfaces = a2uiSurfaces.length > 0;
	const showForm = !a2uiRequesting && a2uiMessages.length === 0;

	return html`
		<div class="flex-1 overflow-y-auto relative">
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

	if (sessionIdFromUrl) {
		const loaded = await loadSession(sessionIdFromUrl);
		if (!loaded) {
			// Session doesn't exist, redirect to new session
			newSession();
			return;
		}
	} else {
		await createAgent();
	}

	if (isA2uiMode) {
		initA2ui();
	}

	renderApp();
}

initApp();
