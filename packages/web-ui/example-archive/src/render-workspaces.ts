import { html, type TemplateResult } from "lit";
import { apiClient, getCurrentAnalysis, refreshData, requireData, setActiveAgentPanelTab } from "./app-state.js";
import { confirmationLabel, flowModeLabel, issueTone, objectLabel, roleLabel, stageState, statusLabel } from "./labels.js";
import type { OntologyActionType } from "./ontology-runtime.js";
import { ontologyManifest, ontologyRuntime } from "./ontology-runtime.js";
import type { ApiCallOptions } from "./archive-api.js";
import { renderArchivePackageTable, renderCollectionTable, renderCompilationTable, renderDocumentTable, renderUploadNodeTree } from "./render-tables.js";
import { formatDate, formatFileSize, icon, renderEmptyState, showModal, showToast } from "./render-utils.js";

export function renderMetrics(): TemplateResult {
	const analysis = getCurrentAnalysis();
	return html`
		<div class="grid cols-3">
			${analysis.metrics.map(
				(metric) => html`
					<div class="card pad metric">
						<div class="metric-top">
							<span>${metric.label}</span>
							${icon(metric.tone === "red" ? "triangle-alert" : metric.tone === "blue" ? "sparkles" : "chart-no-axes-column")}
						</div>
						<div class="metric-value">${metric.value}</div>
						<div class="sub">${metric.description}</div>
					</div>
				`,
			)}
		</div>
	`;
}

export function renderLifecycle(): TemplateResult {
	const analysis = getCurrentAnalysis();
	return html`
		<div class="section">
			<div class="section-head">
				<h2>生命周期阶段</h2>
				<span class="badge blue">当前：${analysis.lifecycleStageLabel}</span>
			</div>
			<div class="timeline">
				${ontologyManifest.lifecycle.stages.map(
					(stage) => html`
						<div class="stage ${stageState(stage.id, analysis.lifecycleStage)}">
							<strong>${stage.label}</strong>
							<span>${stage.description}</span>
						</div>
					`,
				)}
			</div>
		</div>
	`;
}

export function renderIssueTable(): TemplateResult {
	const issues = getCurrentAnalysis().issues;
	return html`
		<div class="card">
			<div class="section-head" style="padding: 14px 14px 0">
				<h2>阻塞与建议</h2>
				<span class="badge ${issues.some((issue) => issue.severity === "blocking") ? "red" : "blue"}">${issues.length} 项</span>
			</div>
			${issues.length === 0
				? renderEmptyState("当前接口数据未发现阻塞项")
				: html`
					<table class="table" style="border: 0; border-radius: 0; margin-top: 8px">
						<tr>
							<th>问题</th>
							<th>影响对象</th>
							<th>建议</th>
						</tr>
						${issues.map(
							(issue) => html`
								<tr>
									<td>
										<strong>${issue.title}</strong>
										<div class="sub">${issue.description}</div>
									</td>
									<td>
										<span class="badge ${issueTone(issue.severity)}">${objectLabel(issue.objectType)}</span>
										<div class="sub">${issue.objectId}</div>
									</td>
									<td>${issue.suggestedAction ? html`<span class="badge blue">${issue.suggestedAction}</span>` : "待分析"}</td>
								</tr>
							`,
						)}
					</table>
				`}
		</div>
	`;
}

function buildActionApiParams(actionType: OntologyActionType): ApiCallOptions | null {
		const data = requireData();
		const projectId = data.selectedProject?.id;
		if (!projectId) return null;

		switch (actionType) {
			case "runPrecheck":
				return { pathParams: { projectId }, body: {} };
			case "packageProject":
				return { pathParams: { projectId } };
			case "archiveProject":
				return { pathParams: { projectId } };
			case "rejectReview": {
				const pendingReview = data.reviews.find((r) => r.status === "pending");
				if (!pendingReview) return null;
				return { pathParams: { reviewId: pendingReview.id }, body: { comment: "审核不通过，请整改后重新提交" } };
			}
			case "bulkSubmitUploadFiles": {
				const pendingFiles = data.uploads.filter((u) => u.status === "pending");
				if (pendingFiles.length === 0) return null;
				return { pathParams: { projectId }, body: { fileIds: pendingFiles.map((f) => f.id) } };
			}
			case "createSigningTask":
			case "updateCompilationFormData":
				return null;
			case "createUnit":
				return { pathParams: { projectId }, body: { name: "新单位工程" } };
			case "createProject":
				return {};
			default:
				return null;
		}
	}

function missingParamsMessage(actionType: OntologyActionType): string {
	switch (actionType) {
		case "createSigningTask":
			return "创建签章任务需要指定签章对象、节点和签章人，请通过签章流程入口操作。";
		case "updateCompilationFormData":
			return "编制表单数据更新需要指定编制实例和字段内容，请通过编制工作台操作。";
		default:
			return "缺少必要的业务参数，请检查当前项目数据。";
	}
}

export async function handleConfirmAction(): Promise<void> {
	const proposal = getCurrentAnalysis().actionProposal;

	// Actions requiring user input redirect to modal forms
	if (proposal.actionType === "createProject") {
		await handleCreateProject();
		return;
	}
	if (proposal.actionType === "createUnit") {
		await handleCreateUnit();
		return;
	}

	if (!proposal.canExecute) {
		showToast("当前条件不满足，暂不能执行此操作", "error");
		return;
	}
	if (!proposal.operationId) {
		showToast("该操作未绑定后端接口", "error");
		return;
	}

	const apiParams = buildActionApiParams(proposal.actionType);
	if (!apiParams) {
		showToast(missingParamsMessage(proposal.actionType), "error");
		return;
	}

	const isHighRisk = proposal.confirmationLevel === "high";

	const confirmed = window.confirm(
		`确认执行「${proposal.label}」？\n\n` +
		`确认要求：${confirmationLabel(proposal.confirmationLevel)}\n` +
		`提交后影响：${proposal.sideEffects.join("、")}\n` +
		`留痕要求：${proposal.auditRequired ? "需要记录操作日志" : "不强制留痕"}\n\n` +
		`此操作不可撤销，是否继续？`,
	);
	if (!confirmed) return;

	if (isHighRisk) {
		const doubleConfirmed = window.confirm(
			`【高风险操作二次确认】\n\n` +
			`您即将执行高风险操作「${proposal.label}」。\n\n` +
			`影响范围：${proposal.sideEffects.join("、")}\n` +
			`审计要求：此操作会在操作日志中留痕，并关联当前用户身份。\n` +
			`责任声明：执行后不可回退，后果由当前登录用户承担。\n\n` +
			`请再次确认是否执行？`,
		);
		if (!doubleConfirmed) {
			showToast("已取消高风险操作", "info");
			return;
		}
	}

	try {
		showToast(`正在执行「${proposal.label}」…`, "info");
		await apiClient.call(proposal.operationId, apiParams);
		showToast(`「${proposal.label}」执行成功`, "success");
		await refreshData();
	} catch (error) {
		showToast(`操作失败：${error instanceof Error ? error.message : "未知错误"}`, "error");
	}
}

export function renderActionProposal(): TemplateResult {
	const proposal = getCurrentAnalysis().actionProposal;
	return html`
		<div class="card pad">
			<div class="section-head">
				<h2>下一步办理建议</h2>
				<span class="badge ${proposal.canExecute ? "green" : "red"}">${proposal.canExecute ? "可生成办理草案" : "暂不能提交"}</span>
			</div>
			<div class="action-proposal">
				<div class="agent-card-title">${icon("workflow")} ${proposal.label}</div>
				<dl class="kv">
					<dt>办理事项</dt>
					<dd>${proposal.label}</dd>
					<dt>确认要求</dt>
					<dd>${confirmationLabel(proposal.confirmationLevel)}</dd>
					<dt>办理人员</dt>
					<dd>${roleLabel(proposal.requiredProjectRole ?? proposal.requiredRole)}</dd>
					<dt>依据要求</dt>
					<dd>${proposal.evidenceRequired ? `需要业务依据，当前 ${proposal.evidenceCount} 条` : "不强制要求依据"}</dd>
				</dl>
				<div class="sub">提交后影响：${proposal.sideEffects.join("、")}</div>
				${proposal.affectedCount !== undefined ? html`<div class="sub">影响对象：${proposal.affectedLabel} × ${proposal.affectedCount}</div>` : ""}
				<div class="sub">留痕要求：${proposal.auditRequired ? "需要记录操作日志" : "不强制记录操作日志"}；高风险事项必须等待人工确认。</div>
				<div style="margin-top: 12px">
					<button class="btn primary" ?disabled=${!proposal.canExecute || !proposal.operationId} @click=${handleConfirmAction}>${icon("check")} 确认办理草案</button>
					<button class="btn" @click=${() => setActiveAgentPanelTab("evidence")}>${icon("eye")} 查看依据</button>
				</div>
			</div>
		</div>
	`;
}

async function handleCreateUnit(): Promise<void> {
	const data = requireData();
	const projectId = data.selectedProject?.id;
	if (!projectId) { showToast("请先选择项目", "error"); return; }

	const result = await showModal("创建单位工程", [
		{ label: "单位工程名称", key: "name", type: "text", required: true, placeholder: "如：1#楼" },
		{ label: "工程类型", key: "engType", type: "text", placeholder: "如：房屋建筑工程" },
		{ label: "结构类型", key: "structureType", type: "text", placeholder: "如：框架结构" },
		{ label: "层数", key: "floors", type: "number", placeholder: "如：18" },
		{ label: "建筑面积（㎡）", key: "buildingArea", type: "number", placeholder: "如：3500" },
	], "创建");

	if (!result) return;
	try {
		showToast("正在创建单位工程…", "info");
		const body: Record<string, unknown> = { name: result.name };
		if (result.engType) body.engType = result.engType;
		if (result.structureType) body.structureType = result.structureType;
		if (result.floors) body.floors = Number(result.floors);
		if (result.buildingArea) body.buildingArea = Number(result.buildingArea);
		await apiClient.call("createUnit", { pathParams: { projectId }, body });
		showToast("单位工程创建成功", "success");
		await refreshData();
	} catch (error) {
		showToast(`创建失败：${error instanceof Error ? error.message : "未知错误"}`, "error");
	}
}

async function handleCreateProject(): Promise<void> {
	const result = await showModal("创建项目", [
		{ label: "项目名称", key: "name", type: "text", required: true, placeholder: "如：XX小区建设工程" },
		{ label: "项目类型", key: "type", type: "text", required: true, placeholder: "如：房屋建筑工程" },
		{ label: "项目编号", key: "code", type: "text", placeholder: "如：GC-2026-001" },
		{ label: "建设单位", key: "buildingUnit", type: "text", required: true, placeholder: "如：XX房地产开发有限公司" },
		{ label: "施工单位", key: "constructionUnit", type: "text", placeholder: "如：XX建设集团有限公司" },
		{ label: "监理单位", key: "supervisionUnit", type: "text", placeholder: "如：XX工程监理有限公司" },
		{ label: "设计单位", key: "designUnit", type: "text", placeholder: "如：XX建筑设计院" },
		{ label: "项目地点", key: "location", type: "text", placeholder: "如：XX省XX市XX区" },
		{ label: "开工日期", key: "startDate", type: "text", placeholder: "如：2026-01-01" },
		{ label: "竣工日期", key: "endDate", type: "text", placeholder: "如：2028-12-31" },
		{ label: "建筑面积（㎡）", key: "totalArea", type: "number", placeholder: "如：50000" },
		{ label: "备注", key: "description", type: "textarea", placeholder: "项目描述" },
	], "创建项目");

	if (!result) return;
	try {
		showToast("正在创建项目…", "info");
		const body: Record<string, unknown> = {
			name: result.name,
			type: result.type,
			buildingUnit: result.buildingUnit,
		};
		if (result.code) body.code = result.code;
		if (result.constructionUnit) body.constructionUnit = result.constructionUnit;
		if (result.supervisionUnit) body.supervisionUnit = result.supervisionUnit;
		if (result.designUnit) body.designUnit = result.designUnit;
		if (result.location) body.location = result.location;
		if (result.startDate) body.startDate = result.startDate;
		if (result.endDate) body.endDate = result.endDate;
		if (result.totalArea) body.totalArea = Number(result.totalArea);
		if (result.description) body.description = result.description;
		await apiClient.call("createProject", { body });
		showToast("项目创建成功", "success");
		await refreshData();
	} catch (error) {
		showToast(`创建失败：${error instanceof Error ? error.message : "未知错误"}`, "error");
	}
}

async function handleCopyAccessCode(): Promise<void> {
	const code = requireData().accessCode;
	if (!code?.accessCode) { showToast("暂无接入码", "error"); return; }
	try {
		await navigator.clipboard.writeText(code.accessCode);
		showToast("接入码已复制", "success");
	} catch {
		showToast("复制失败，请手动复制", "error");
	}
}

async function handleResetAccessCode(): Promise<void> {
	const data = requireData();
	const projectId = data.selectedProject?.id;
	if (!projectId) return;
	if (!window.confirm("重置接入码后，原接入码立即失效。确认重置？")) return;
	try {
		showToast("正在重置接入码…", "info");
		await apiClient.call("resetProjectAccessPassword", { pathParams: { projectId } });
		showToast("接入码已重置", "success");
		await refreshData();
	} catch (error) {
		showToast(`重置失败：${error instanceof Error ? error.message : "未知错误"}`, "error");
	}
}

export function renderCockpitWorkspace(): TemplateResult {
	const data = requireData();
	const project = data.selectedProject;

	if (!project) {
		return html`
			${renderMetrics()}
			${renderEmptyProject()}
		`;
	}

	return html`
		${renderMetrics()}
		<div class="section grid cols-2">
			${renderProjectDetail(project)}
			<div>
				${renderUnitsSection(data.units)}
				${renderMembersSection(data.members)}
			</div>
		</div>
		<div class="section grid cols-2">
			${renderAccessCodeSection(data.accessCode)}
		</div>
		${renderLifecycle()}
		<div class="section grid cols-2">
			${renderIssueTable()}
			${renderActionProposal()}
		</div>
	`;
}

function renderEmptyProject(): TemplateResult {
	return html`
		<div class="section grid cols-2">
			<div class="card pad">
				<div class="agent-card-title">${icon("building-2")} 尚未选择项目</div>
				<div class="sub">当前租户下 ${requireData().projects.length} 个项目。</div>
				<div style="margin-top: 12px">
					<button class="btn primary" @click=${handleCreateProject}>${icon("plus")} 创建项目</button>
					<button class="btn" @click=${() => setActiveAgentPanelTab("actions")}>${icon("sparkles")} 咨询智能体</button>
				</div>
			</div>
			<div>${renderIssueTable()}</div>
		</div>
	`;
}

function renderProjectDetail(project: import("./archive-api.js").Project): TemplateResult {
	return html`
		<div class="card pad">
			<div class="section-head">
				<h2>项目信息</h2>
				<span class="badge ${project.status === "project_archive" ? "green" : "amber"}">${statusLabel(project.status)}</span>
			</div>
			<dl class="kv">
				<dt>项目名称</dt>
				<dd>${project.name}</dd>
				<dt>项目编号</dt>
				<dd>${project.code || "未设置"}</dd>
				<dt>项目类型</dt>
				<dd>${project.type || "未分类"}</dd>
				<dt>建筑面积</dt>
				<dd>${project.totalArea ? `${project.totalArea} ㎡` : "未设置"}</dd>
				<dt>项目地点</dt>
				<dd>${project.location || "未设置"}</dd>
				<dt>建设单位</dt>
				<dd>${project.buildingUnit || "未指定"}</dd>
				<dt>施工单位</dt>
				<dd>${project.constructionUnit || "未指定"}</dd>
				<dt>监理单位</dt>
				<dd>${project.supervisionUnit || "未指定"}</dd>
				<dt>设计单位</dt>
				<dd>${project.designUnit || "未指定"}</dd>
				<dt>开工日期</dt>
				<dd>${formatDate(project.startDate)}</dd>
				<dt>竣工日期</dt>
				<dd>${formatDate(project.endDate)}</dd>
			</dl>
			${project.description ? html`<div class="sub" style="margin-top:4px">备注：${project.description}</div>` : ""}
		</div>
	`;
}

function renderUnitsSection(units: import("./archive-api.js").Unit[]): TemplateResult {
	return html`
		<div class="card" style="margin-bottom:12px">
			<div class="section-head" style="padding:14px 14px 0">
				<h2>单位工程</h2>
				<span class="badge blue">${units.length} 个</span>
			</div>
			${units.length === 0
				? renderEmptyState("暂无单位工程")
				: html`
					<table class="table" style="border:0;border-radius:0;margin-top:4px">
						<tr><th>名称</th><th>类型</th><th>结构</th><th>层数</th><th>面积</th></tr>
						${units.map((u) => html`
							<tr>
								<td><strong>${u.name}</strong></td>
								<td>${u.engType || "-"}</td>
								<td>${u.structureType || "-"}</td>
								<td>${u.floors ?? "-"}</td>
								<td>${u.buildingArea ? `${u.buildingArea}㎡` : "-"}</td>
							</tr>
						`)}
					</table>
				`}
			<div style="padding:10px 14px;border-top:1px solid #d9ded8">
				<button class="btn primary" @click=${handleCreateUnit}>${icon("plus")} 创建单位工程</button>
			</div>
		</div>
	`;
}

function renderMembersSection(members: import("./archive-api.js").ProjectMemberRecord[]): TemplateResult {
	return html`
		<div class="card">
			<div class="section-head" style="padding:14px 14px 0">
				<h2>项目成员</h2>
				<span class="badge blue">${members.length} 人</span>
			</div>
			${members.length === 0
				? renderEmptyState("暂无项目成员")
				: html`
					<table class="table" style="border:0;border-radius:0;margin-top:4px">
						<tr><th>姓名</th><th>角色</th></tr>
						${members.map((m) => html`
							<tr>
								<td><strong>${m.userName ?? `成员 #${m.userId ?? m.id}`}</strong></td>
								<td><span class="badge blue">${roleLabel(m.role)}</span></td>
							</tr>
						`)}
					</table>
				`}
		</div>
	`;
}

function renderAccessCodeSection(accessCode?: import("./archive-api.js").AccessCodeInfo): TemplateResult {
	if (!accessCode) return html``;
	return html`
		<div class="card pad">
			<div class="section-head">
				<h2>项目接入码</h2>
				<span class="badge blue">邀请成员</span>
			</div>
			<dl class="kv">
				<dt>接入码</dt>
				<dd style="font-family:monospace;font-size:16px;letter-spacing:2px;user-select:all">${accessCode.accessCode}</dd>
				<dt>创建时间</dt>
				<dd>${formatDate(accessCode.createdAt)}</dd>
			</dl>
			<div style="margin-top:12px;display:flex;gap:8px">
				<button class="btn primary" @click=${handleCopyAccessCode}>${icon("copy")} 复制接入码</button>
				<button class="btn" @click=${handleResetAccessCode}>${icon("rotate-ccw")} 重置</button>
			</div>
		</div>
	`;
}

export function renderGenericWorkspace(): TemplateResult {
	return html`
		${renderMetrics()}
		${renderLifecycle()}
		<div class="section grid cols-2">
			${renderIssueTable()}
			${renderActionProposal()}
		</div>
	`;
}

export function renderIntakeWorkspace(): TemplateResult {
	const uploads = requireData().uploads;
	return html`
		${renderMetrics()}
		<div class="section split">
			<div class="card tree">
				<h2 style="padding: 4px 8px 10px">后端返回目录节点</h2>
				${renderUploadNodeTree(uploads)}
			</div>
			<div class="card">
				${uploads.length === 0
					? renderEmptyState("当前项目暂无上传文件")
					: html`
						<table class="table">
							<tr>
								<th>文件</th>
								<th>目录节点</th>
								<th>著录字段</th>
								<th>状态</th>
								<th>时间</th>
							</tr>
							${uploads.map(
								(file) => html`
									<tr>
										<td><strong>${file.title || file.fileName}</strong><div class="sub">${file.mimeType ?? file.fileType ?? "未知类型"} · ${formatFileSize(file.fileSize)}</div></td>
										<td>${file.nodeLabel || file.nodeId || "未著录"}</td>
										<td>${[file.compiler, file.compileDate, file.responsible].filter(Boolean).join(" / ") || "未补齐"}</td>
										<td><span class="badge ${file.status === "returned" ? "red" : file.status === "pending" ? "amber" : "green"}">${statusLabel(file.status)}</span></td>
										<td>${formatDate(file.updatedAt ?? file.uploadedAt)}</td>
									</tr>
								`,
							)}
						</table>
					`}
			</div>
		</div>
		<div class="section grid cols-2">
			${renderIssueTable()}
			${renderActionProposal()}
		</div>
	`;
}

export function renderCompileWorkspace(): TemplateResult {
	const data = requireData();
	return html`
		${renderMetrics()}
		<div class="section grid cols-2">
			<div class="card">
				<div class="section-head" style="padding: 14px 14px 0">
					<h2>编制实例</h2>
					<span class="badge blue">${data.compilations.length} 条</span>
				</div>
				${renderCompilationTable(data.compilations)}
			</div>
			<div class="card">
				<div class="section-head" style="padding: 14px 14px 0">
					<h2>在线资料</h2>
					<span class="badge blue">${data.documents.filter((document) => document.type === "online").length} 条</span>
				</div>
				${renderDocumentTable(data.documents.filter((document) => document.type === "online"))}
			</div>
		</div>
		<div class="section">${renderActionProposal()}</div>
	`;
}

export function renderReviewWorkspace(): TemplateResult {
	const reviews = requireData().reviews;
	return html`
		${renderMetrics()}
		<div class="section grid cols-2">
			<div class="card">
				<div class="section-head" style="padding: 14px 14px 0">
					<h2>待审核任务</h2>
					<span class="badge amber">${reviews.length} 条</span>
				</div>
				${reviews.length === 0
					? renderEmptyState("当前没有待审核任务")
					: html`
						<table class="table" style="border: 0; border-radius: 0; margin-top: 8px">
							<tr>
								<th>资料</th>
								<th>审核人</th>
								<th>提交人</th>
								<th>状态</th>
							</tr>
							${reviews.map(
								(review) => html`
									<tr>
										<td><strong>${review.documentTitle ?? `资料 #${review.documentId}`}</strong><div class="sub">${formatDate(review.createdAt)}</div></td>
										<td>${review.assignedToName ?? "-"}</td>
										<td>${review.submittedByName ?? "-"}</td>
										<td><span class="badge ${review.status === "pending" ? "amber" : review.status === "rejected" ? "red" : "green"}">${statusLabel(review.status)}</span></td>
									</tr>
								`,
							)}
						</table>
					`}
			</div>
			${renderIssueTable()}
		</div>
		<div class="section">${renderActionProposal()}</div>
	`;
}

export function renderSigningWorkspace(): TemplateResult {
	const tasks = requireData().signingTasks;
	return html`
		${renderMetrics()}
		<div class="section grid cols-2">
			<div class="card">
				<div class="section-head" style="padding: 14px 14px 0">
					<h2>签章任务</h2>
					<span class="badge amber">${tasks.length} 条</span>
				</div>
				${tasks.length === 0
					? renderEmptyState("当前项目暂无签章任务")
					: html`
						<table class="table" style="border: 0; border-radius: 0; margin-top: 8px">
							<tr>
								<th>任务</th>
								<th>流程</th>
								<th>状态</th>
								<th>更新时间</th>
							</tr>
							${tasks.map(
								(task) => html`
									<tr>
										<td><strong>${task.docName ?? task.documentTitle ?? `签章任务 #${task.id ?? "-"}`}</strong></td>
										<td>${flowModeLabel(task.flowMode)}</td>
										<td><span class="badge ${task.status === "completed" ? "green" : task.status === "rejected" ? "red" : "amber"}">${statusLabel(task.status)}</span></td>
										<td>${formatDate(task.updatedAt ?? task.createdAt)}</td>
									</tr>
								`,
							)}
						</table>
					`}
			</div>
			${renderActionProposal()}
		</div>
	`;
}

export function renderArchiveWorkspace(): TemplateResult {
	const data = requireData();
	const precheck = data.latestPrecheck;
	const totalChecks = precheck?.totalChecks ?? 0;
	const passedChecks = precheck?.passedChecks ?? 0;
	const ratio = totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 0;
	return html`
		${renderMetrics()}
		<div class="section precheck-grid">
			<div class="card pad">
				<div class="section-head">
					<h2>最新预检结果</h2>
					<span class="badge ${precheck?.status === "passed" ? "green" : precheck ? "red" : "blue"}">${precheck?.status ? statusLabel(precheck.status) : "无预检"}</span>
				</div>
				<div class="ring" style=${`--precheck-ratio: ${ratio}%`}><div class="ring-inner">${ratio}%</div></div>
				<div class="grid cols-3">
					<div class="metric"><div class="metric-value">${passedChecks}</div><div class="sub">通过项</div></div>
					<div class="metric"><div class="metric-value">${precheck?.warningCount ?? 0}</div><div class="sub">警告项</div></div>
					<div class="metric"><div class="metric-value">${precheck?.errorCount ?? 0}</div><div class="sub">阻断项</div></div>
				</div>
			</div>
			${renderIssueTable()}
		</div>
		<div class="section grid cols-2">
			${renderArchivePackageTable(data.archivePackages)}
			${renderCollectionTable(data.collectionItems)}
		</div>
		<div class="section">${renderActionProposal()}</div>
	`;
}

export function renderGovernanceWorkspace(): TemplateResult {
	const data = requireData();
	return html`
		${renderMetrics()}
		<div class="section grid cols-2">
			<div class="card pad">
				<div class="section-head">
					<h2>接口加载状态</h2>
					<span class="badge ${data.errors.length === 0 ? "green" : "amber"}">${data.errors.length === 0 ? "全部可用" : `${data.errors.length} 个接口异常`}</span>
				</div>
				${data.errors.length === 0
					? html`<div class="sub">当前工作台数据全部来自后端接口，没有使用模拟业务数据。</div>`
					: html`<ul class="agent-list">${data.errors.map((error) => html`<li>${error}</li>`)}</ul>`}
			</div>
			<div class="card pad">
				<div class="section-head">
					<h2>业务规则接入情况</h2>
					<span class="badge blue">已接入</span>
				</div>
				<dl class="kv">
					<dt>业务对象</dt>
					<dd>${Object.keys(ontologyManifest.objectTypes).length}</dd>
					<dt>可建议操作</dt>
					<dd>${Object.keys(ontologyManifest.actionTypes).length}</dd>
					<dt>操作规则</dt>
					<dd>${Object.keys(ontologyManifest.policies).length}</dd>
					<dt>上传文件关联规则</dt>
					<dd>${ontologyRuntime.getLinksForObject("UploadFile").length}</dd>
				</dl>
			</div>
		</div>
	`;
}
