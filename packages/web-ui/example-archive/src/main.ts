import { html, render } from "lit";
import { createIcons, icons } from "lucide";
import { refreshData, setRenderCallback } from "./app-state.js";
import { setAgentRenderCallback, setupArchiveAgent } from "./archive-agent.js";
import { renderAgentPanel } from "./render-agent-panel.js";
import { renderMain, renderMobileBottomNav, renderMobileHeader, renderSidebar, renderTopbar } from "./render-layout.js";
import "./app.css";

function renderApp(): void {
	const app = document.getElementById("app");
	if (!app) throw new Error("App container not found");

	render(
		html`
			<div class="mobile-header">${renderMobileHeader()}</div>
			<div class="archive-app">
				${renderTopbar()}
				${renderSidebar()}
				${renderMain()}
				${renderAgentPanel()}
			</div>
			<div class="mobile-bottom-nav">${renderMobileBottomNav()}</div>
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
