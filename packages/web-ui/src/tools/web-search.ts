import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { ToolResultMessage } from "@earendil-works/pi-ai";
import { html } from "lit";
import { createRef, ref } from "lit/directives/ref.js";
import { Search } from "lucide";
import { type Static, Type } from "typebox";
import { registerToolRenderer, renderCollapsibleHeader, renderHeader } from "./renderer-registry.js";
import type { ToolRenderer, ToolRenderResult } from "./types.js";

// ============================================================================
// TYPES
// ============================================================================

const webSearchSchema = Type.Object({
	query: Type.String({
		description: "Search query to look up on the web",
	}),
	maxResults: Type.Optional(
		Type.Integer({
			description: "Maximum number of search results to return (default 5, max 10)",
			minimum: 1,
			maximum: 10,
		}),
	),
});

export type WebSearchParams = Static<typeof webSearchSchema>;

export interface WebSearchResult {
	title: string;
	url: string;
	content: string;
	score?: number;
	rawContent?: string;
}

export interface WebSearchResponse {
	results: WebSearchResult[];
	answer?: string;
	query: string;
}

// ============================================================================
// TOOL
// ============================================================================

export function createWebSearchTool(): AgentTool<typeof webSearchSchema, WebSearchResponse> & {
	tavilyApiKey?: string;
} {
	const tool = {
		label: "Web Search",
		name: "web_search",
		tavilyApiKey: undefined as string | undefined,
		description:
			"Search the web for current information using Tavily. Returns relevant search results with titles, URLs, and snippets. Use this when you need up-to-date information, recent events, or facts you're not confident about.",
		parameters: webSearchSchema,
		execute: async (_toolCallId: string, args: WebSearchParams, signal?: AbortSignal) => {
			if (signal?.aborted) {
				throw new Error("Web search aborted");
			}

			const query = args.query.trim();
			if (!query) {
				throw new Error("Search query is required");
			}

			const apiKey = tool.tavilyApiKey;
			if (!apiKey) {
				throw new Error(
					"Tavily API key is not configured. Please set the TAVILY_API_KEY environment variable or provide an apiKey to createWebSearchTool().",
				);
			}

			const maxResults = Math.min(args.maxResults ?? 5, 10);

			const response = await fetch("https://api.tavily.com/search", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					api_key: apiKey,
					query,
					max_results: maxResults,
					search_depth: "basic",
					include_answer: true,
				}),
				signal,
			});

			if (!response.ok) {
				const errorText = await response.text().catch(() => "");
				throw new Error(`Tavily search failed (${response.status}): ${errorText}`);
			}

			const data = (await response.json()) as WebSearchResponse & { answer?: string };

			// Format results as text for the LLM
			const formattedResults = data.results
				.map((r, i) => `[${i + 1}] ${r.title}\n   URL: ${r.url}\n   ${r.content}`)
				.join("\n\n");

			const text = data.answer
				? `Search results for "${query}":\n\nAnswer: ${data.answer}\n\n${formattedResults}`
				: `Search results for "${query}":\n\n${formattedResults}`;

			return {
				content: [{ type: "text" as const, text }],
				details: {
					results: data.results,
					answer: data.answer,
					query,
				},
			};
		},
	};
	return tool;
}

// Export a default instance
export const webSearchTool = createWebSearchTool();

// ============================================================================
// RENDERER
// ============================================================================

export const webSearchRenderer: ToolRenderer<WebSearchParams, WebSearchResponse> = {
	render(
		params: WebSearchParams | undefined,
		result: ToolResultMessage<WebSearchResponse> | undefined,
		isStreaming?: boolean,
	): ToolRenderResult {
		// Determine status
		const state = result ? (result.isError ? "error" : "complete") : isStreaming ? "inprogress" : "complete";
		const contentRef = createRef<HTMLDivElement>();
		const chevronRef = createRef<HTMLSpanElement>();

		// With result
		if (result && params) {
			const details = result.details;
			const count = details?.results?.length ?? 0;
			const title = result.isError ? "Web search failed" : `Searched for "${params.query}" (${count} results)`;

			// Format output text
			const resultText = details?.results
				?.map((r: WebSearchResult, i: number) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.content}`)
				.join("\n\n");

			return {
				content: html`
					<div>
						${renderCollapsibleHeader(state, Search, title, contentRef, chevronRef, false)}
						<div ${ref(contentRef)} class="max-h-0 overflow-hidden transition-all duration-300 space-y-3">
							${
								details?.answer
									? html`<div class="text-sm text-gray-700 dark:text-gray-300">
										<strong>Summary:</strong> ${details.answer}
									</div>`
									: ""
							}
							${
								resultText && !result.isError
									? html`<code-block .code=${resultText} language="plaintext"></code-block>`
									: ""
							}
							${
								result.isError && result.content?.[0]?.type === "text"
									? html`<console-block .content=${(result.content[0] as any).text} .variant=${"error"}></console-block>`
									: ""
							}
						</div>
					</div>
				`,
				isCustom: false,
			};
		}

		// Just params (streaming)
		if (params) {
			return {
				content: html`
					<div>
						${renderCollapsibleHeader(state, Search, `Searching for "${params.query}"...`, contentRef, chevronRef, false)}
					</div>
				`,
				isCustom: false,
			};
		}

		// No params yet
		return {
			content: renderHeader(state, Search, "Preparing web search..."),
			isCustom: false,
		};
	},
};

// Auto-register the renderer
registerToolRenderer("web_search", webSearchRenderer);
