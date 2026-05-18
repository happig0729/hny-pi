import { html, render } from "lit";
import { createIcons, icons } from "lucide";
import { refreshData, setRenderCallback } from "./app-state.js";
import { setAgentRenderCallback, setupArchiveAgent } from "./archive-agent.js";
import { renderAgentPanel } from "./render-agent-panel.js";
import { renderMain, renderSidebar, renderTopbar } from "./render-layout.js";
import "./app.css";

function renderApp(): void {
	const app = document.getElementById("app");
	if (!app) throw new Error("App container not found");

	render(
		html`
			<div class="mobile-note">移动端以核心内容栈式展示；桌面端可查看完整三栏工作台。</div>
			<div class="archive-app">
				${renderTopbar()}
				${renderSidebar()}
				${renderMain()}
				${renderAgentPanel()}
			</div>
		`,
		app,
	);

	createIcons({ icons });
}

async function initApp(): Promise<void> {
	setRenderCallback(renderApp);
	renderApp();
	await setupArchiveAgent();
	setAgentRenderCallback(renderApp);
	await refreshData();
}

void initApp();
