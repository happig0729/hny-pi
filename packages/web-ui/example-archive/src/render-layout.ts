import { html, type TemplateResult } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import {
	activeWorkspaceId,
	appState,
	refreshData,
	setActiveWorkspace,
	setEntityForm,
	setPinDialog,
	setPinnedPanelOpen,
	setPinnedReports,
	setReportHtml,
	setVisualization,
	updateEntityForm,
	updateEntityFormSubmitting,
	type FormField,
	type PinDialogState,
} from "./app-state.js";
import { apiClient } from "./app-state.js";
import { deletePinnedReport, generateId, listPinnedReports, savePinnedReport, type PinnedReport } from "./pinned-store.js";
import { rerunPinnedReport } from "./archive-agent.js";
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
			<div class="nav-label">工具</div>
			<button class="nav-btn" @click=${async () => { setPinnedReports(await listPinnedReports()); setPinnedPanelOpen(true); }}>
				${icon("bookmark")}
				<span>固化功能</span>
			</button>
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

async function handlePinSave(): Promise<void> {
	const dialog = appState.pinDialog;
	if (!dialog) return;
	if (!dialog.name.trim()) {
		setPinDialog({ ...dialog, error: "功能名称不能为空" });
		return;
	}
	setPinDialog({ ...dialog, saving: true, error: undefined });
	try {
		const now = Date.now();
		const report: PinnedReport = {
			id: generateId(),
			name: dialog.name.trim(),
			description: dialog.description.trim(),
			category: dialog.category.trim() || "未分类",
			visibility: dialog.visibility,
			reportHtml: appState.reportHtml ?? "",
			agentPrompt: appState.reportAgentPrompt ?? "",
			toolName: appState.reportToolName ?? "",
			toolParams: appState.reportToolParams ?? "",
			version: 1,
			versions: [{ version: 1, reportHtml: appState.reportHtml ?? "", agentPrompt: appState.reportAgentPrompt ?? "", toolParams: appState.reportToolParams ?? "", savedAt: now }],
			createdAt: now,
			updatedAt: now,
		};
		await savePinnedReport(report);
		setPinDialog(undefined);
		setPinnedReports(await listPinnedReports());
	} catch (e) {
		setPinDialog({ ...dialog, saving: false, error: e instanceof Error ? e.message : "保存失败" });
	}
}

async function handlePinDelete(id: string): Promise<void> {
	await deletePinnedReport(id);
	setPinnedReports(await listPinnedReports());
}

async function handlePinRun(report: PinnedReport): Promise<void> {
	setPinnedPanelOpen(false);
	if (report.agentPrompt) {
		await rerunPinnedReport(report.agentPrompt);
	} else {
		setReportHtml(report.reportHtml);
	}
}

export function renderPinDialogModal(): TemplateResult {
	const dialog = appState.pinDialog;
	if (!dialog) return html``;
	const updateDialog = (patch: Partial<PinDialogState>) => setPinDialog({ ...dialog, ...patch });
	return html`
		<div class="modal-overlay" @click=${(e: Event) => { if (e.target === e.currentTarget) setPinDialog(undefined); }}>
			<div class="modal" style="width:480px">
				<div class="modal-head">
					<h2>固化为功能</h2>
					<button class="icon-btn" @click=${() => setPinDialog(undefined)}>${icon("x")}</button>
				</div>
				<div class="modal-body">
					<div class="form-group">
						<label>功能名称 <span class="form-required">*</span></label>
						<input class="form-control" type="text" placeholder="例如：项目进度周报" .value=${dialog.name} @input=${(e: Event) => updateDialog({ name: (e.target as HTMLInputElement).value, error: undefined })} />
					</div>
					<div class="form-group">
						<label>功能描述</label>
						<textarea class="form-control" placeholder="描述这个固化功能的用途" .value=${dialog.description} @input=${(e: Event) => updateDialog({ description: (e.target as HTMLTextAreaElement).value })}></textarea>
					</div>
					<div class="form-group">
						<label>分类</label>
						<input class="form-control" type="text" placeholder="例如：周报、月报、专题报告" .value=${dialog.category} @input=${(e: Event) => updateDialog({ category: (e.target as HTMLInputElement).value })} />
					</div>
					<div class="form-group">
						<label>可见范围</label>
						<div style="display:flex;gap:12px;margin-top:4px">
							<label style="display:flex;align-items:center;gap:6px;font-weight:400;cursor:pointer">
								<input type="radio" name="visibility" value="personal" ?checked=${dialog.visibility === "personal"} @change=${() => updateDialog({ visibility: "personal" })} /> 仅自己可见
							</label>
							<label style="display:flex;align-items:center;gap:6px;font-weight:400;cursor:pointer">
								<input type="radio" name="visibility" value="public" ?checked=${dialog.visibility === "public"} @change=${() => updateDialog({ visibility: "public" })} /> 团队可见
							</label>
						</div>
					</div>
					${dialog.error ? html`<div class="form-error form-global-error">${dialog.error}</div>` : ""}
				</div>
				<div class="modal-foot">
					<button class="btn" @click=${() => setPinDialog(undefined)} ?disabled=${dialog.saving}>取消</button>
					<button class="btn primary" @click=${() => void handlePinSave()} ?disabled=${dialog.saving}>
						${dialog.saving ? "保存中..." : "确认固化"}
					</button>
				</div>
			</div>
		</div>
	`;
}

export function renderPinnedPanel(): TemplateResult {
	const open = appState.pinnedPanelOpen;
	const reports = appState.pinnedReports ?? [];
	if (!open) return html``;
	const grouped = new Map<string, PinnedReport[]>();
	for (const r of reports) {
		const cat = r.category || "未分类";
		if (!grouped.has(cat)) grouped.set(cat, []);
		grouped.get(cat)!.push(r);
	}
	return html`
		<div class="pinned-overlay" @click=${(e: Event) => { if (e.target === e.currentTarget) setPinnedPanelOpen(false); }}>
			<div class="pinned-panel">
				<div class="pinned-head">
					<h2>固化功能</h2>
					<button class="icon-btn" @click=${() => setPinnedPanelOpen(false)}>${icon("x")}</button>
				</div>
				<div class="pinned-body">
					${reports.length === 0
						? html`<div class="pinned-empty">${icon("inbox")}<p>暂无固化功能</p><div class="sub">在报表页面点击"固化为功能"按钮可将报表保存为可复用的功能模块</div></div>`
						: [...grouped.entries()].map(([cat, items]) => html`
							<div class="pinned-group">
								<div class="pinned-group-title">${icon("folder")} ${cat}</div>
								${items.map((r) => html`
									<div class="pinned-item">
										<div class="pinned-item-info">
											<div class="pinned-item-name">${r.name}</div>
											<div class="pinned-item-meta">
												${r.visibility === "public" ? html`<span class="badge blue">团队</span>` : html`<span class="badge">个人</span>`}
												<span>v${r.version}</span>
												<span>${new Date(r.updatedAt).toLocaleDateString()}</span>
											</div>
											${r.description ? html`<div class="sub">${r.description}</div>` : ""}
										</div>
										<div class="pinned-item-actions">
											<button class="btn primary btn-sm" @click=${() => void handlePinRun(r)}>运行</button>
											<button class="btn btn-sm" @click=${() => void handlePinDelete(r.id)}>${icon("trash-2")}</button>
										</div>
									</div>
								`)}
							</div>
						`)
					}
				</div>
			</div>
		</div>
	`;
}

export function renderVisualizationModal(): TemplateResult {
	const viz = appState.visualization;
	if (!viz) return html``;
	const doc = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Inter,system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;background:#fff;color:#18201d;padding:20px}
.viz-loading{display:flex;align-items:center;justify-content:center;height:420px;color:#66716b;font-size:14px;gap:8px}
.viz-loading .spinner{width:24px;height:24px;border:3px solid #d9ded8;border-top-color:#1f7a55;border-radius:50%;animation:spin 1s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.viz-title{font-size:20px;font-weight:800;text-align:center;margin-bottom:16px;color:#18201d}
#chart{width:100%;height:420px}
.chart-desc{margin-top:14px;padding:12px 16px;background:#f0f4f1;border-radius:8px;color:#66716b;font-size:13px;line-height:1.6}
@media(max-width:520px){#chart{height:300px}.viz-loading{height:300px}body{padding:12px}}
</style></head><body>
<div class="viz-loading" id="viz-loading"><div class="spinner"></div>图表加载中...</div>
${viz.chartHtml}
<script>document.getElementById('viz-loading').style.display='none';<\/script>
</body></html>`;
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
				<div style="margin-left:auto;display:flex;gap:8px">
					<button class="btn primary" @click=${() => setPinDialog({ name: "", description: "", category: "", visibility: "personal", saving: false })}>
						${icon("pin")} 固化为功能
					</button>
				</div>
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
