import { html, type TemplateResult } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { activeWorkspaceId, appState, refreshData, setActiveWorkspace, setReportHtml } from "./app-state.js";
import { statusLabel } from "./labels.js";
import { icon } from "./render-utils.js";
import {
	renderArchiveWorkspace,
	renderCompileWorkspace,
	renderGenericWorkspace,
	renderGovernanceWorkspace,
	renderIntakeWorkspace,
	renderReviewWorkspace,
	renderSigningWorkspace,
} from "./render-workspaces.js";
import { getWorkspace, workspaces } from "./workspace-definitions.js";

export function renderTopbar(): TemplateResult {
	const project = appState.data?.selectedProject;
	return html`
		<header class="topbar">
			<div class="brand">
				<div class="brand-mark">${icon("archive")}</div>
				<span>工程档案智能体</span>
			</div>
			<div class="project-switcher">
				${icon("building-2")}
				<strong>${project?.name ?? "未选择项目"}</strong>
				<span class="badge ${project?.status === "project_archive" ? "green" : "amber"}">${project?.status ? statusLabel(project.status) : "无项目"}</span>
			</div>
			<div class="search">
				${icon("search")}
				<span>搜索项目、文件、目录节点、审核意见、签章任务</span>
			</div>
			<div class="top-actions">
				<button class="icon-btn" title="刷新" @click=${() => void refreshData()}>${icon("refresh-cw")}</button>
				<button class="icon-btn" title="审计">${icon("shield-check")}</button>
				<button class="icon-btn" title="设置">${icon("settings")}</button>
			</div>
		</header>
	`;
}

export function renderSidebar(): TemplateResult {
	return html`
		<nav class="sidebar">
			<div class="nav-label">生命周期工作台</div>
			${workspaces
				.filter((workspace) => workspace.id !== "governance")
				.map(
					(workspace) => html`
						<button
							class="nav-btn ${workspace.id === activeWorkspaceId ? "active" : ""}"
							@click=${() => setActiveWorkspace(workspace.id)}
						>
							${icon(workspace.icon)}
							<span>${workspace.label}</span>
						</button>
					`,
				)}
			<div class="nav-label">治理</div>
			${workspaces
				.filter((workspace) => workspace.id === "governance")
				.map(
					(workspace) => html`
						<button
							class="nav-btn ${workspace.id === activeWorkspaceId ? "active" : ""}"
							@click=${() => setActiveWorkspace(workspace.id)}
						>
							${icon(workspace.icon)}
							<span>${workspace.label}</span>
						</button>
					`,
				)}
		</nav>
	`;
}

export function renderLoading(): TemplateResult {
	return html`
		<main class="main">
			<div class="card pad">
				<div class="agent-card-title">${icon("loader-circle")} 正在加载真实后端数据</div>
				<div class="sub">正在登录并调用项目、文件、审核、签章、预检、归档接口。</div>
			</div>
		</main>
	`;
}

export function renderError(): TemplateResult {
	return html`
		<main class="main">
			<div class="card pad">
				<div class="agent-card-title">${icon("triangle-alert")} 数据加载失败</div>
				<div class="sub">${appState.error ?? "未知错误"}</div>
				${appState.authMessage ? html`<div class="sub">认证状态：${appState.authMessage}</div>` : ""}
				<div style="margin-top: 12px">
					<button class="btn primary" @click=${() => void refreshData()}>${icon("refresh-cw")} 重试</button>
				</div>
			</div>
		</main>
	`;
}

function renderWorkspaceBody(): TemplateResult {
	if (activeWorkspaceId === "intake") return renderIntakeWorkspace();
	if (activeWorkspaceId === "compile") return renderCompileWorkspace();
	if (activeWorkspaceId === "review") return renderReviewWorkspace();
	if (activeWorkspaceId === "signing") return renderSigningWorkspace();
	if (activeWorkspaceId === "archive") return renderArchiveWorkspace();
	if (activeWorkspaceId === "governance") return renderGovernanceWorkspace();
	return renderGenericWorkspace();
}

function renderReportLoading(): TemplateResult {
	return html`
		<main class="main">
			<div class="report-generating">
				<div class="report-generating-icon">${icon("loader-circle")}</div>
				<h2>正在生成报表</h2>
				<div class="sub">智能体正在分析数据并生成报表，请稍候...</div>
			</div>
		</main>
	`;
}

function renderReportView(): TemplateResult {
	return html`
		<main class="main">
			<div class="report-header">
				<button class="btn" @click=${() => setReportHtml(undefined)}>
					${icon("arrow-left")} 返回工作台
				</button>
				<h2>智能报表</h2>
			</div>
			<div class="report-container">${unsafeHTML(appState.reportHtml ?? "")}</div>
		</main>
	`;
}

export function renderMain(): TemplateResult {
	if (appState.loadState === "loading") return renderLoading();
	if (appState.loadState === "error") return renderError();

	if (appState.reportLoading) return renderReportLoading();
	if (appState.reportHtml) return renderReportView();

	const workspace = getWorkspace(activeWorkspaceId);
	return html`
		<main class="main">
			<section>
				<div class="page-head">
					<div>
						<div class="eyebrow">${workspace.eyebrow}</div>
						<h1>${workspace.title}</h1>
						<div class="sub">${workspace.subtitle}</div>
					</div>
					<div>
						<button class="btn" @click=${() => void refreshData()}>${icon("refresh-cw")} 刷新</button>
						<button class="btn primary">${icon("play-circle")} 生成办理建议</button>
					</div>
				</div>
				${renderWorkspaceBody()}
			</section>
		</main>
	`;
}
