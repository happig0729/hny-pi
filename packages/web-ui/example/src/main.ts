import "@mariozechner/mini-lit/dist/ThemeToggle.js";
import { Agent, type AgentMessage } from "@earendil-works/pi-agent-core";
import { getModel, type TextContent } from "@earendil-works/pi-ai";
import {
	type AgentState,
	ApiKeyPromptDialog,
	AppStorage,
	ChatPanel,
	CustomProvidersStore,
	createApiQueryTool,
	createJavaScriptReplTool,
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

let currentSessionId: string | undefined;
let currentTitle = "";
let isEditingTitle = false;
let agent: Agent;
let chatPanel: ChatPanel;
let agentUnsubscribe: (() => void) | undefined;

// ============================================================================
// A2UI State & Integration Setup
// ============================================================================

const A2UI_SYSTEM_PROMPT = `You are a helpful restaurant finding assistant. Your final output MUST be a valid A2UI UI JSON response using protocol version v0.9.

Return exactly one A2UI JSON array wrapped in <a2ui-json> and </a2ui-json>. Do not use markdown code fences. Do not put explanatory prose inside the tags.

Use the A2UI basic catalog exactly as shown in the samples:
- catalogId MUST be "https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json".
- Every message MUST include "version": "v0.9".
- Every surface MUST have a root component with id "root".
- updateComponents.components MUST be a flat array. Do not nest component objects inside other component objects.
- Refer to children by component id strings. For a Card, use "child": "some-id", not "children".
- For a dynamic list, use List.children as { "componentId": "item-card-template", "path": "/items" }.
- Inside a List item template, data bindings MUST be relative paths such as { "path": "name" }, { "path": "rating" }, { "path": "detail" }, { "path": "imageUrl" }, and { "path": "address" }.
- Outside a List template, data bindings MUST be absolute paths such as { "path": "/title" }.
- Text components MUST use "text". Image components MUST use "url". Button labels MUST be Text child components. Button actions MUST use { "event": { "name": "...", "context": { ... } } }.
- updateDataModel MUST always specify "path". For restaurant lists, set "/title" to a string and "/items" to an array of restaurant objects.

Do not use these non-A2UI aliases: type, properties, components as children, value for Text, src, source, imageUrl as an Image property, label on Button, data, dataPath, textPath, sourcePath, itemTemplate, contextBindings, or strings like "{name}".

For restaurant lists with 5 or fewer items, use this template shape:
<a2ui-json>
[
  {
    "version": "v0.9",
    "createSurface": {
      "surfaceId": "default",
      "catalogId": "https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json",
      "theme": { "primaryColor": "#FF0000", "font": "Roboto" }
    }
  },
  {
    "version": "v0.9",
    "updateComponents": {
      "surfaceId": "default",
      "components": [
        { "id": "root", "component": "Column", "children": ["title-heading", "item-list"] },
        { "id": "title-heading", "component": "Text", "variant": "h1", "text": { "path": "/title" } },
        {
          "id": "item-list",
          "component": "List",
          "direction": "vertical",
          "children": { "componentId": "item-card-template", "path": "/items" }
        },
        { "id": "item-card-template", "component": "Card", "child": "card-layout" },
        { "id": "card-layout", "component": "Row", "children": ["card-image", "card-details"] },
        { "id": "card-image", "component": "Image", "variant": "mediumFeature", "weight": 1, "url": { "path": "imageUrl" } },
        { "id": "card-details", "component": "Column", "weight": 2, "children": ["template-name", "template-rating", "template-detail", "template-link", "template-book-button"] },
        { "id": "template-name", "component": "Text", "variant": "h3", "text": { "path": "name" } },
        { "id": "template-rating", "component": "Text", "text": { "path": "rating" } },
        { "id": "template-detail", "component": "Text", "text": { "path": "detail" } },
        { "id": "template-link", "component": "Text", "text": { "path": "infoLink" } },
        {
          "id": "template-book-button",
          "component": "Button",
          "child": "book-now-text",
          "variant": "primary",
          "action": {
            "event": {
              "name": "book_restaurant",
              "context": {
                "restaurantName": { "path": "name" },
                "imageUrl": { "path": "imageUrl" },
                "address": { "path": "address" }
              }
            }
          }
        },
        { "id": "book-now-text", "component": "Text", "text": "Book Now" }
      ]
    }
  },
  { "version": "v0.9", "updateDataModel": { "surfaceId": "default", "path": "/title", "value": "Top Chinese Restaurants in New York" } },
  { "version": "v0.9", "updateDataModel": { "surfaceId": "default", "path": "/items", "value": [] } }
]
</a2ui-json>

When finding restaurants:
- Fill the "/items" value with restaurant objects containing name, rating, detail, infoLink, imageUrl, and address.
- Preserve markdown links in infoLink when useful.

When booking a table after a "book_restaurant" action:
- Create a "booking-form" surface.
- Use Column root, Text title, Image, address Text, TextField for partySize, DateTimeInput for reservationTime, TextField for dietary, and a submit Button.
- Use action event name "submit_booking" with context paths for restaurantName, partySize, reservationTime, dietary, and imageUrl.

When confirming a booking after a "submit_booking" action:
- Create a "confirmation" surface.
- Use Card root, Column content, Text title, Image, booking details Text, dietary Text, and a final Text message.
`;

const restaurantData = [
	{
		name: "Xi'an Famous Foods",
		detail: "Spicy and savory hand-pulled noodles.",
		imageUrl: "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=400",
		rating: "★★★★☆",
		infoLink: "[More Info](https://www.xianfoods.com/)",
		address: "81 St Marks Pl, New York, NY 10003",
	},
	{
		name: "Han Dynasty",
		detail: "Authentic Szechuan cuisine.",
		imageUrl: "https://images.unsplash.com/photo-1525755662778-989d0524087e?w=400",
		rating: "★★★★☆",
		infoLink: "[More Info](https://www.handynasty.net/)",
		address: "90 3rd Ave, New York, NY 10003",
	},
	{
		name: "RedFarm",
		detail: "Modern Chinese with a farm-to-table approach.",
		imageUrl: "https://images.unsplash.com/photo-1563245372-f21724e3856d?w=400",
		rating: "★★★★☆",
		infoLink: "[More Info](https://www.redfarmnyc.com/)",
		address: "529 Hudson St, New York, NY 10014",
	},
	{
		name: "Mott 32",
		detail: "Upscale Cantonese dining.",
		imageUrl: "https://images.unsplash.com/photo-1552566626-52f8b828add9?w=400",
		rating: "★★★★★",
		infoLink: "[More Info](https://mott32.com/newyork/)",
		address: "111 W 57th St, New York, NY 10019",
	},
	{
		name: "Hwa Yuan Szechuan",
		detail: "Famous for its cold noodles with sesame sauce.",
		imageUrl: "https://images.unsplash.com/photo-1555126634-323283e090fa?w=400",
		rating: "★★★★☆",
		infoLink: "[More Info](https://hwayuannyc.com/)",
		address: "40 E Broadway, New York, NY 10002",
	},
];

function createRestaurantListMessages(): A2uiMessage[] {
	return [
		{
			version: "v0.9",
			createSurface: {
				surfaceId: "default",
				catalogId: "https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json",
				theme: { primaryColor: "#FF0000", font: "Roboto" },
			},
		},
		{
			version: "v0.9",
			updateComponents: {
				surfaceId: "default",
				components: [
					{
						id: "root",
						component: "Column",
						children: ["title-heading", "item-list"],
					},
					{
						id: "title-heading",
						component: "Text",
						variant: "h1",
						text: { path: "/title" },
					},
					{
						id: "item-list",
						component: "List",
						direction: "vertical",
						children: {
							componentId: "item-card-template",
							path: "/items",
						},
					},
					{
						id: "item-card-template",
						component: "Card",
						child: "card-layout",
					},
					{
						id: "card-layout",
						component: "Row",
						children: ["template-image", "card-details"],
					},
					{
						id: "template-image",
						component: "Image",
						url: { path: "imageUrl" },
						weight: 1,
					},
					{
						id: "card-details",
						component: "Column",
						children: [
							"template-name",
							"template-rating",
							"template-detail",
							"template-link",
							"template-book-button",
						],
						weight: 2,
					},
					{
						id: "template-name",
						component: "Text",
						variant: "h3",
						text: { path: "name" },
					},
					{
						id: "template-rating",
						component: "Text",
						text: { path: "rating" },
					},
					{
						id: "template-detail",
						component: "Text",
						text: { path: "detail" },
					},
					{
						id: "template-link",
						component: "Text",
						text: { path: "infoLink" },
					},
					{
						id: "template-book-button",
						component: "Button",
						child: "book-now-text",
						variant: "primary",
						action: {
							event: {
								name: "book_restaurant",
								context: {
									restaurantName: { path: "name" },
									imageUrl: { path: "imageUrl" },
									address: { path: "address" },
								},
							},
						},
					},
					{
						id: "book-now-text",
						component: "Text",
						text: "Book Now",
					},
				],
			},
		},
		{
			version: "v0.9",
			updateDataModel: {
				surfaceId: "default",
				path: "/",
				value: {
					title: "Top 5 Chinese Restaurants in New York",
					items: restaurantData.map((restaurant) => ({
						name: restaurant.name,
						rating: restaurant.rating,
						detail: restaurant.detail,
						infoLink: restaurant.infoLink,
						imageUrl: restaurant.imageUrl,
						address: restaurant.address,
					})),
				},
			},
		},
	];
}

function createBookingFormMessages(restaurantName: string, imageUrl: string, address: string): A2uiMessage[] {
	return [
		{
			version: "v0.9",
			createSurface: {
				surfaceId: "booking-form",
				catalogId: "https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json",
				theme: { primaryColor: "#FF0000", font: "Roboto" },
			},
		},
		{
			version: "v0.9",
			updateComponents: {
				surfaceId: "booking-form",
				components: [
					{
						id: "root",
						component: "Column",
						children: [
							"booking-title",
							"restaurant-image",
							"restaurant-address",
							"party-size-field",
							"datetime-field",
							"dietary-field",
							"submit-button",
						],
					},
					{
						id: "booking-title",
						component: "Text",
						variant: "h2",
						text: { path: "/title" },
					},
					{
						id: "restaurant-image",
						component: "Image",
						url: { path: "/imageUrl" },
					},
					{
						id: "restaurant-address",
						component: "Text",
						text: { path: "/address" },
					},
					{
						id: "party-size-field",
						component: "TextField",
						label: "Party Size",
						value: { path: "/partySize" },
						variant: "number",
					},
					{
						id: "datetime-field",
						component: "DateTimeInput",
						label: "Date & Time",
						value: { path: "/reservationTime" },
						enableDate: true,
						enableTime: true,
					},
					{
						id: "dietary-field",
						component: "TextField",
						label: "Dietary Requirements",
						value: { path: "/dietary" },
					},
					{
						id: "submit-button",
						component: "Button",
						child: "submit-reservation-text",
						variant: "primary",
						action: {
							event: {
								name: "submit_booking",
								context: {
									restaurantName: { path: "/restaurantName" },
									partySize: { path: "/partySize" },
									reservationTime: { path: "/reservationTime" },
									dietary: { path: "/dietary" },
									imageUrl: { path: "/imageUrl" },
								},
							},
						},
					},
					{
						id: "submit-reservation-text",
						component: "Text",
						text: "Submit Reservation",
					},
				],
			},
		},
		{
			version: "v0.9",
			updateDataModel: {
				surfaceId: "booking-form",
				path: "/",
				value: {
					title: `Book a Table at ${restaurantName}`,
					address: address,
					restaurantName: restaurantName,
					partySize: "2",
					reservationTime: "",
					dietary: "",
					imageUrl: imageUrl,
				},
			},
		},
	];
}

function createConfirmationMessages(
	restaurantName: string,
	partySize: string,
	reservationTime: string,
	dietary: string,
	imageUrl: string,
): A2uiMessage[] {
	return [
		{
			version: "v0.9",
			createSurface: {
				surfaceId: "confirmation",
				catalogId: "https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json",
				theme: { primaryColor: "#FF0000", font: "Roboto" },
			},
		},
		{
			version: "v0.9",
			updateComponents: {
				surfaceId: "confirmation",
				components: [
					{
						id: "root",
						component: "Card",
						child: "confirmation-column",
					},
					{
						id: "confirmation-column",
						component: "Column",
						children: [
							"confirm-title",
							"confirm-image",
							"divider1",
							"confirm-details",
							"divider2",
							"confirm-dietary",
							"divider3",
							"confirm-text",
						],
					},
					{
						id: "confirm-title",
						component: "Text",
						variant: "h2",
						text: { path: "/title" },
					},
					{
						id: "confirm-image",
						component: "Image",
						url: { path: "/imageUrl" },
					},
					{
						id: "confirm-details",
						component: "Text",
						text: { path: "/bookingDetails" },
					},
					{
						id: "confirm-dietary",
						component: "Text",
						text: { path: "/dietaryRequirements" },
					},
					{
						id: "confirm-text",
						component: "Text",
						variant: "h5",
						text: "We look forward to seeing you!",
					},
					{ id: "divider1", component: "Divider" },
					{ id: "divider2", component: "Divider" },
					{ id: "divider3", component: "Divider" },
				],
			},
		},
		{
			version: "v0.9",
			updateDataModel: {
				surfaceId: "confirmation",
				path: "/",
				value: {
					title: `Booking Confirmed at ${restaurantName}`,
					bookingDetails: `${partySize} people at ${reservationTime || "TBD"}`,
					dietaryRequirements: dietary ? `Dietary Requirements: ${dietary}` : "No dietary requirements specified",
					imageUrl: imageUrl,
				},
			},
		},
	];
}

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
		if (
			varName === "title" ||
			varName === "partySize" ||
			varName === "reservationTime" ||
			varName === "dietary" ||
			varName === "restaurantName"
		) {
			path = `/${varName}`;
		} else if (varName === "imageUrl" || varName === "address") {
			path = templatePath ? varName : `/${varName}`;
		} else if (varName === "name" || varName === "rating" || varName === "detail" || varName === "infoLink") {
			path = varName;
		} else if (!varName.startsWith("/")) {
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

	const normalizeComponentFields = (comp: MutableRecord, templatePath?: string) => {
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
	if (startIndex === -1) return [];

	let jsonContent = text.slice(startIndex + startTag.length);
	const endIndex = jsonContent.indexOf(endTag);
	if (endIndex !== -1) {
		jsonContent = jsonContent.slice(0, endIndex);
	}

	jsonContent = jsonContent.trim();
	if (!jsonContent) return [];

	try {
		return normalizeA2uiMessages(JSON.parse(jsonContent));
	} catch (_) {
		if (jsonContent.startsWith("[")) {
			for (let i = jsonContent.length; i > 0; i--) {
				const candidate = jsonContent.slice(0, i).trim();
				if (candidate.endsWith("}")) {
					try {
						return normalizeA2uiMessages(JSON.parse(`${candidate}]`));
					} catch (_) {}
				}
			}
		}
	}
	return [];
}

let isA2uiMode = false;
let a2uiRequesting = false;
let a2uiError: string | null = null;
let a2uiMockMode = false;
let a2uiProcessor: MessageProcessor<LitComponentApi>;
let a2uiSurfaces: any[] = [];
let a2uiUnsubscribes: (() => void)[] = [];
let a2uiMessages: A2uiMessage[] = [];
let a2uiRawText = "";

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
		if (a2uiMockMode) {
			await new Promise((resolve) => setTimeout(resolve, 800));
			let response: A2uiMessage[] = [];

			if (typeof message === "object" && message.action) {
				const action = message.action;
				const context = action.context || {};
				if (action.name === "book_restaurant") {
					response = createBookingFormMessages(
						String(context.restaurantName || "Restaurant"),
						String(context.imageUrl || ""),
						String(context.address || ""),
					);
				} else if (action.name === "submit_booking") {
					response = createConfirmationMessages(
						String(context.restaurantName || "Restaurant"),
						String(context.partySize || "2"),
						String(context.reservationTime || ""),
						String(context.dietary || ""),
						String(context.imageUrl || ""),
					);
				} else {
					response = createRestaurantListMessages();
				}
			} else {
				response = createRestaurantListMessages();
			}

			a2uiProcessor.processMessages(response);
			a2uiMessages = response;
			a2uiRequesting = false;
			renderApp();
		} else {
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
				agent.state.systemPrompt = A2UI_SYSTEM_PROMPT;
				agent.state.tools = [];
				await agent.prompt(message);
			} else {
				await agent.prompt(JSON.stringify(message));
			}
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
	});

	agentUnsubscribe = agent.subscribe((event: any) => {
		if (isA2uiMode && !a2uiMockMode) {
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

			// Create API query tool for backend data access
			const apiTool = createApiQueryTool();
			apiTool.baseUrl = config.api.baseUrl;
			apiTool.authToken = apiAuthToken;

			return [replTool, searchTool, apiTool];
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
				<!-- Mock Mode badge -->
				${a2uiMockMode ? html`<div class="mock-badge">Mock Mode</div>` : ""}

				<!-- Initial search form -->
				${
					showForm
						? html`
						<form class="search-form" @submit=${handleA2uiSubmit}>
							<div class="hero-img" style="--background-image-light: url(https://images.unsplash.com/photo-1525755662778-989d0524087e?w=800); --background-image-dark: url(https://images.unsplash.com/photo-1525755662778-989d0524087e?w=800)"></div>
							<h1 class="app-title">Restaurant Finder</h1>
							<div class="input-row">
								<input
									required
									placeholder="Find me the top Chinese restaurants in NY"
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

							<!-- Mode option switcher -->
							<div class="mode-selector-row">
								<label class="mode-checkbox">
									<input
										type="checkbox"
										.checked=${a2uiMockMode}
										@change=${(e: Event) => {
											a2uiMockMode = (e.target as HTMLInputElement).checked;
											renderApp();
										}}
									/>
									Run in Mock Mode (No LLM required)
								</label>
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
							<div class="loading-text">Finding restaurants...</div>
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
							: html`<span class="text-base font-semibold text-foreground">Pi Web UI Example</span>`
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
						title: isA2uiMode ? "Switch to standard Chat" : "Switch to A2UI Demo Mode",
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

	renderApp();
}

initApp();
