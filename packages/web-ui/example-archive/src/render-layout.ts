import { html, type TemplateResult } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import {
	activeWorkspaceId,
	appState,
	refreshData,
	setActiveWorkspace,
	setEntityForm,
	setReportHtml,
	setVisualization,
	updateEntityForm,
	updateEntityFormSubmitting,
	type FormField,
} from "./app-state.js";
import { apiClient } from "./app-state.js";
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

function validateFormField(field: FormField): string | undefined {
	if (field.required && !field.value?.trim()) {
		return `${field.label}不能为空`;
	}
	if (field.type === "number" && field.value && Number.isNaN(Number(field.value))) {
		return `${field.label}必须是数字`;
	}
	return undefined;
}

function handleFormInputChange(index: number, value: string): void {
	const form = appState.entityForm;
	if (!form) return;
	const fields = [...form.fields];
	fields[index] = { ...fields[index], value, error: undefined };
	updateEntityForm(fields);
}

async function handleFormSubmit(): Promise<void> {
	const form = appState.entityForm;
	if (!form) return;

	const validatedFields = form.fields.map((f) => ({ ...f, error: validateFormField(f) }));
	const hasErrors = validatedFields.some((f) => f.error);
	if (hasErrors) {
		updateEntityForm(validatedFields);
		return;
	}

	updateEntityFormSubmitting(true, false);
	try {
		const body: Record<string, unknown> = {};
		for (const field of form.fields) {
			if (field.value === undefined || field.value === "") continue;
			body[field.name] = field.type === "number" ? Number(field.value) : field.value;
		}
		await apiClient.call(form.operationId, { body });
		updateEntityFormSubmitting(false, true);
	} catch (error) {
		updateEntityFormSubmitting(false, false, error instanceof Error ? error.message : "提交失败");
	}
}

export function renderVisualizationModal(): TemplateResult {
	const viz = appState.visualization;
	if (!viz) return html``;
	const doc = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Inter,system-ui,-apple-system,sans-serif;background:#fff;color:#18201d;padding:24px}
.viz-title{font-size:20px;font-weight:800;text-align:center;margin-bottom:16px;color:#18201d}
#chart{width:100%;height:420px}
.chart-desc{margin-top:14px;padding:12px 16px;background:#f0f4f1;border-radius:8px;color:#66716b;font-size:13px;line-height:1.6}
</style></head><body>${viz.chartHtml}</body></html>`;
	return html`
		<div class="modal-overlay" @click=${(e: Event) => { if (e.target === e.currentTarget) setVisualization(undefined); }}>
			<div class="modal viz-modal">
				<div class="modal-head">
					<h2>${viz.title}</h2>
					<button class="icon-btn" @click=${() => setVisualization(undefined)}>${icon("x")}</button>
				</div>
				<div class="modal-body viz-body">
					<iframe
						class="viz-iframe"
						sandbox="allow-scripts"
						.srcdoc=${doc}
						title=${viz.title}
					></iframe>
				</div>
			</div>
		</div>
	`;
}

export function renderEntityFormModal(): TemplateResult {
	const form = appState.entityForm;
	if (!form) return html``;

	return html`
		<div class="modal-overlay" @click=${(e: Event) => { if (e.target === e.currentTarget) setEntityForm(undefined); }}>
			<div class="modal">
				<div class="modal-head">
					<h2>创建${form.entityLabel}</h2>
					<button class="icon-btn" @click=${() => setEntityForm(undefined)}>${icon("x")}</button>
				</div>
				${form.submitted
					? html`
						<div class="modal-body">
							<div class="form-success">
								${icon("check-circle")}
								<h3>${form.entityLabel}创建成功</h3>
								<button class="btn primary" @click=${() => { setEntityForm(undefined); void refreshData(); }}>完成</button>
							</div>
						</div>
					`
					: html`
						<div class="modal-body">
							${form.fields.map(
								(field, i) => html`
									<div class="form-group ${field.error ? "has-error" : ""}">
										<label>
											${field.label}
											${field.required ? html`<span class="form-required">*</span>` : ""}
										</label>
										${field.type === "select"
											? html`
												<select
													class="form-control"
													.value=${field.value ?? ""}
													@change=${(e: Event) => handleFormInputChange(i, (e.target as HTMLSelectElement).value)}
												>
													<option value="" disabled selected>${field.placeholder ?? "请选择"}</option>
													${field.options?.map((opt) => html`<option value=${opt} ?selected=${field.value === opt}>${opt}</option>`)}
												</select>
											`
											: field.type === "textarea"
												? html`
													<textarea
														class="form-control"
														placeholder=${field.placeholder ?? ""}
														.value=${field.value ?? ""}
														@input=${(e: Event) => handleFormInputChange(i, (e.target as HTMLTextAreaElement).value)}
													></textarea>
												`
												: html`
													<input
														class="form-control"
														type=${field.type === "date" ? "date" : field.type === "number" ? "number" : "text"}
														placeholder=${field.placeholder ?? ""}
														.value=${field.value ?? ""}
														@input=${(e: Event) => handleFormInputChange(i, (e.target as HTMLInputElement).value)}
													/>
												`}
										${field.error ? html`<div class="form-error">${field.error}</div>` : ""}
									</div>
								`,
							)}
							${form.submitError ? html`<div class="form-error form-global-error">${form.submitError}</div>` : ""}
						</div>
						<div class="modal-foot">
							<button class="btn" @click=${() => setEntityForm(undefined)} ?disabled=${form.submitting}>取消</button>
							<button class="btn primary" @click=${() => void handleFormSubmit()} ?disabled=${form.submitting}>
								${form.submitting ? html`${icon("loader-circle")} 提交中...` : "确认创建"}
							</button>
						</div>
					`
				}
			</div>
		</div>
	`;
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
