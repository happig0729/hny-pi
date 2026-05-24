import { Agent, type AgentEvent } from "@earendil-works/pi-agent-core";
import { getModel } from "@earendil-works/pi-ai";
import { ApiKeyPromptDialog, ChatPanel } from "@earendil-works/pi-web-ui";
import { createArchiveApiReadTool, createArchiveContextTool, createCreateEntityTool, createGenerateReportTool, createVisualizeDataTool } from "./archive-agent-tools.js";
import {
	apiClient,
	buildArchiveAgentSystemPrompt,
	config,
	getArchiveAgentSnapshot,
	providerKeys,
	setAgentUnsubscribe,
	setArchiveAgent,
	setChatPanel,
	setEntityForm,
	setReportHtml,
	setReportLoading,
	setVisualization,
} from "./app-state.js";

function handleAgentEvent(event: AgentEvent): void {
	if (event.type === "tool_execution_start" && event.toolName === "generate_report") {
		setReportLoading(true);
	}
	if (event.type === "agent_start") {
		setReportHtml(undefined);
	}
}

let renderAppCallback: (() => void) | undefined;

export function setAgentRenderCallback(cb: () => void): void {
	renderAppCallback = cb;
}

export async function setupArchiveAgent(): Promise<void> {
	// Unsubscribe previous agent if any
	const prev = agentUnsubscribeLocal;
	if (prev) prev();

	if (config.apiKeys.deepseek) {
		await providerKeys.set("deepseek", config.apiKeys.deepseek);
	}

	const agent = new Agent({
		initialState: {
			systemPrompt: buildArchiveAgentSystemPrompt(),
			model: getModel("deepseek", "deepseek-v4-flash"),
			thinkingLevel: "off",
			messages: [],
			tools: [],
		},
	});

	const chatPanel = new ChatPanel();
	agentUnsubscribeLocal = agent.subscribe((event) => {
		handleAgentEvent(event);
		renderAppCallback?.();
	});
	await chatPanel.setAgent(agent, {
		onApiKeyRequired: async (provider: string) => ApiKeyPromptDialog.prompt(provider),
		onBeforeSend: () => {
			agent.state.systemPrompt = buildArchiveAgentSystemPrompt();
		},
		toolsFactory: () => [
			createArchiveContextTool(getArchiveAgentSnapshot),
			createArchiveApiReadTool(apiClient),
			createGenerateReportTool(setReportHtml),
			createCreateEntityTool(apiClient, setEntityForm),
			createVisualizeDataTool(setVisualization),
		],
	});

	setArchiveAgent(agent);
	setChatPanel(chatPanel);
	setAgentUnsubscribe(agentUnsubscribeLocal);
}

let agentUnsubscribeLocal: (() => void) | undefined;
