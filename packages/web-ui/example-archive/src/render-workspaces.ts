import { html, type TemplateResult } from "lit";
import { getCurrentAnalysis, requireData } from "./app-state.js";
import { confirmationLabel, flowModeLabel, issueTone, objectLabel, roleLabel, stageState, statusLabel } from "./labels.js";
import { ontologyManifest, ontologyRuntime } from "./ontology-runtime.js";
import { renderArchivePackageTable, renderCollectionTable, renderCompilationTable, renderDocumentTable, renderUploadNodeTree } from "./render-tables.js";
import { formatDate, formatFileSize, icon, renderEmptyState } from "./render-utils.js";

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
				<div class="sub">留痕要求：${proposal.auditRequired ? "需要记录操作日志" : "不强制记录操作日志"}；高风险事项必须等待人工确认。</div>
				<div style="margin-top: 12px">
					<button class="btn primary">${icon("check")} 确认办理草案</button>
					<button class="btn">${icon("eye")} 查看依据</button>
				</div>
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
