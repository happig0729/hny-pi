import { html, type TemplateResult } from "lit";
import { apiClient, compilationFormData, getCurrentAnalysis, refreshData, requireData, selectedCompilationId, setActiveAgentPanelTab, setCompilationFormData, setSelectedCompilationId } from "./app-state.js";
import { confirmationLabel, flowModeLabel, issueTone, objectLabel, roleLabel, stageState, statusLabel } from "./labels.js";
import { ontologyManifest, ontologyRuntime, type OntologyActionType } from "./ontology-runtime.js";
import type { ApiCallOptions } from "./archive-api.js";
import { renderArchivePackageTable, renderCatalogTemplateTree, renderCityArchiveMappingTable, renderClassificationResult, renderCollectionTable, renderCompilationTable, renderDocumentTable, renderUploadFileVersionTable, renderUploadNodeTree } from "./render-tables.js";
import { formatDate, formatFileSize, icon, renderEmptyState, selectLocalFile, showClassificationModal, showModal, showToast } from "./render-utils.js";

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
				${isProjectArchived() ? html`<span class="badge green">${icon("lock")} 已归档锁定</span>` : ""}
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

	// Block writes when project is archived
	if (isProjectArchived() && proposal.actionType !== "runPrecheck") {
		showToast("项目已归档锁定，仅允许预检操作", "error");
		return;
	}

	// Actions requiring user input redirect to modal forms
	if (proposal.actionType === "createProject") {
		await handleCreateProject();
		return;
	}
	if (proposal.actionType === "createUnit") {
		await handleCreateUnit();
		return;
	}
	if (proposal.actionType === "createCompilationInstance") {
		await handleCreateCompilationInstance();
		return;
	}
	if (proposal.actionType === "completeCompilationInstance") {
		await handleCompleteCompilationInstance();
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
				<div class="sub">留痕要求：${proposal.auditRequired ? "需要记录操作日志" : "不强制记录操作日志"}；高风险事项必须等待人工确认。</div>
				<div style="margin-top: 12px">
					${isProjectArchived() ? html`
						<div class="sub" style="color:var(--archive-red);margin-bottom:8px">${icon("lock")} 项目已归档锁定，仅允许预检操作</div>
					` : ""}
					<button class="btn primary" ?disabled=${isProjectArchived() || !proposal.canExecute || !proposal.operationId} @click=${handleConfirmAction}>${icon("check")} 确认办理草案</button>
					<button class="btn" @click=${() => setActiveAgentPanelTab("evidence")}>${icon("eye")} 查看依据</button>
				</div>
			</div>
		</div>
	`;
}

function isProjectArchived(): boolean {
	const project = requireData().selectedProject;
	return project?.status === "project_archive";
}

async function handleCreateUnit(): Promise<void> {
	if (isProjectArchived()) { showToast("项目已归档锁定，不能创建单位工程", "error"); return; }
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
	if (isProjectArchived()) { showToast("项目已归档锁定，不能创建项目", "error"); return; }
	const data = requireData();
	const enterpriseOptions = data.enterprises.map((e) => ({ value: e.name, label: `${e.name}（${e.type}）` }));
	const unitField = (label: string, key: string, required: boolean) => {
		if (enterpriseOptions.length > 0) {
			return { label, key, type: "select" as const, required, options: [...enterpriseOptions, { value: "__custom__", label: "其他（手动输入）" }] };
		}
		return { label, key, type: "text" as const, required, placeholder: "如：XX房地产开发有限公司" };
	};
	const result = await showModal("创建项目", [
		{ label: "项目名称", key: "name", type: "text", required: true, placeholder: "如：XX小区建设工程" },
		{ label: "项目类型", key: "type", type: "text", required: true, placeholder: "如：房屋建筑工程" },
		{ label: "项目编号", key: "code", type: "text", placeholder: "如：GC-2026-001" },
		unitField("建设单位", "buildingUnit", true),
		unitField("施工单位", "constructionUnit", false),
		unitField("监理单位", "supervisionUnit", false),
		unitField("设计单位", "designUnit", false),
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
			buildingUnit: result.buildingUnit === "__custom__" ? "" : result.buildingUnit,
		};
		if (result.code) body.code = result.code;
		if (result.constructionUnit && result.constructionUnit !== "__custom__") body.constructionUnit = result.constructionUnit;
		if (result.supervisionUnit && result.supervisionUnit !== "__custom__") body.supervisionUnit = result.supervisionUnit;
		if (result.designUnit && result.designUnit !== "__custom__") body.designUnit = result.designUnit;
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

async function handleCreateInviteLink(): Promise<void> {
	if (isProjectArchived()) { showToast("项目已归档锁定，不能创建邀请链接", "error"); return; }
	const projectId = requireData().selectedProject?.id;
	if (!projectId) { showToast("请先选择项目", "error"); return; }

	const result = await showModal("创建邀请链接", [
		{ label: "邀请角色", key: "role", type: "select", required: true, options: [
			{ value: "data_clerk", label: "资料员 (data_clerk)" },
			{ value: "data_admin", label: "数据管理员 (data_admin)" },
		] },
		{ label: "有效期", key: "expiry", type: "select", required: true, options: [
			{ value: "30d", label: "30 天" },
			{ value: "90d", label: "90 天" },
			{ value: "permanent", label: "永久有效" },
		] },
		{ label: "备注", key: "inviteRemark", type: "text", placeholder: "邀请备注（可选）" },
	], "创建");

	if (!result) return;
	try {
		showToast("正在创建邀请链接…", "info");
		await apiClient.call("createInviteLink", {
			pathParams: { projectId },
			body: { role: result.role, expiry: result.expiry, inviteRemark: result.inviteRemark || undefined },
		});
		showToast("邀请链接创建成功", "success");
		await refreshData();
	} catch (error) {
		showToast(`创建失败：${error instanceof Error ? error.message : "未知错误"}`, "error");
	}
}

async function handleRevokeInviteLink(linkId: number): Promise<void> {
	if (!window.confirm("确认撤销此邀请链接？撤销后原链接立即失效。")) return;
	try {
		const projectId = requireData().selectedProject?.id;
		if (!projectId) { showToast("请先选择项目", "error"); return; }
		showToast("正在撤销邀请链接…", "info");
		await apiClient.call("revokeInviteLink", { pathParams: { projectId, linkId } });
		showToast("邀请链接已撤销", "success");
		await refreshData();
	} catch (error) {
		showToast(`撤销失败：${error instanceof Error ? error.message : "未知错误"}`, "error");
	}
}

async function handleAddMember(): Promise<void> {
	const data = requireData();
	const projectId = data.selectedProject?.id;
	if (!projectId) { showToast("请先选择项目", "error"); return; }

	const userOptions = data.users.map((u) => ({ value: String(u.id), label: `${u.name} (@${u.username})` }));
	if (userOptions.length === 0) { showToast("暂无可添加的用户", "error"); return; }

	const result = await showModal("添加项目成员", [
		{ label: "选择用户", key: "userId", type: "select", required: true, options: userOptions },
		{ label: "项目角色", key: "role", type: "select", required: true, options: [
			{ value: "data_clerk", label: "资料员 (data_clerk)" },
			{ value: "data_admin", label: "数据管理员 (data_admin)" },
			{ value: "project_admin", label: "项目管理员 (project_admin)" },
		] },
	], "添加");

	if (!result) return;
	try {
		showToast("正在添加成员…", "info");
		await apiClient.call("addProjectMember", { pathParams: { projectId }, body: { userId: Number(result.userId), role: result.role } });
		showToast("成员添加成功", "success");
		await refreshData();
	} catch (error) {
		showToast(`添加失败：${error instanceof Error ? error.message : "未知错误"}`, "error");
	}
}

async function handleRemoveMember(memberId: number, userName: string): Promise<void> {
	if (!window.confirm(`确认将「${userName}」移出项目？`)) return;
	try {
		const projectId = requireData().selectedProject?.id;
		if (!projectId) { showToast("请先选择项目", "error"); return; }
		showToast("正在移除成员…", "info");
		await apiClient.call("removeProjectMember", { pathParams: { projectId, memberId } });
		showToast("成员已移除", "success");
		await refreshData();
	} catch (error) {
		showToast(`移除失败：${error instanceof Error ? error.message : "未知错误"}`, "error");
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

async function handleLoadCatalogTemplateNodes(templateId: number): Promise<void> {
	try {
		showToast("正在加载目录模板节点…", "info");
		const nodes = await apiClient.call("listCatalogTemplateNodes", { pathParams: { id: templateId } }) as import("./archive-api.js").CatalogTemplateNodeRecord[];
		showToast(`已加载 ${nodes.length} 个目录节点`, "success");
	} catch (error) {
		showToast(`加载目录节点失败：${error instanceof Error ? error.message : "未知错误"}`, "error");
	}
}

async function handleUploadFile(): Promise<void> {
	if (isProjectArchived()) { showToast("项目已归档锁定", "error"); return; }
	const projectId = requireData().selectedProject?.id;
	if (!projectId) { showToast("请先选择项目", "error"); return; }

	const file = await selectLocalFile();
	if (!file) return;

	try {
		showToast("正在上传文件…", "info");
		const formData = new FormData();
		formData.append("file", file);
		await apiClient.call("uploadFile", { pathParams: { projectId }, body: formData });
		showToast("文件上传成功", "success");
		await refreshData();
	} catch (error) {
		showToast(`上传失败：${error instanceof Error ? error.message : "未知错误"}`, "error");
	}
}

async function handleRenameFile(file: import("./archive-api.js").UploadFileRecord): Promise<void> {
	if (isProjectArchived()) { showToast("项目已归档锁定", "error"); return; }
	const projectId = requireData().selectedProject?.id;
	if (!projectId) { showToast("请先选择项目", "error"); return; }

	const result = await showModal("重命名文件", [
		{ label: "新题名", key: "title", type: "text", required: true, value: file.title ?? file.fileName },
	], "重命名");

	if (!result) return;
	try {
		showToast("正在重命名…", "info");
		await apiClient.call("renameUploadFile", { pathParams: { projectId, fileId: file.id }, body: { title: result.title } });
		showToast("重命名成功", "success");
		await refreshData();
	} catch (error) {
		showToast(`重命名失败：${error instanceof Error ? error.message : "未知错误"}`, "error");
	}
}

async function handleReplaceFile(file: import("./archive-api.js").UploadFileRecord): Promise<void> {
	if (isProjectArchived()) { showToast("项目已归档锁定", "error"); return; }
	const projectId = requireData().selectedProject?.id;
	if (!projectId) { showToast("请先选择项目", "error"); return; }

	const localFile = await selectLocalFile();
	if (!localFile) return;

	if (!window.confirm(`确认使用文件「${localFile.name}」替换「${file.title ?? file.fileName}」？替换后将创建新版本。`)) return;
	try {
		showToast("正在替换文件…", "info");
		const formData = new FormData();
		formData.append("file", localFile);
		await apiClient.call("replaceUploadFile", { pathParams: { projectId, fileId: file.id }, body: formData });
		showToast("文件替换成功", "success");
		await refreshData();
	} catch (error) {
		showToast(`替换失败：${error instanceof Error ? error.message : "未知错误"}`, "error");
	}
}

async function handleDeleteFile(file: import("./archive-api.js").UploadFileRecord): Promise<void> {
	if (isProjectArchived()) { showToast("项目已归档锁定", "error"); return; }
	const projectId = requireData().selectedProject?.id;
	if (!projectId) { showToast("请先选择项目", "error"); return; }

	if (!window.confirm(`确认删除文件「${file.title ?? file.fileName}」？此操作不可撤销。`)) return;
	try {
		showToast("正在删除文件…", "info");
		await apiClient.call("deleteUploadFile", { pathParams: { projectId, fileId: file.id } });
		showToast("文件已删除", "success");
		await refreshData();
	} catch (error) {
		showToast(`删除失败：${error instanceof Error ? error.message : "未知错误"}`, "error");
	}
}

async function handleReturnFile(file: import("./archive-api.js").UploadFileRecord): Promise<void> {
	if (isProjectArchived()) { showToast("项目已归档锁定", "error"); return; }
	const projectId = requireData().selectedProject?.id;
	if (!projectId) { showToast("请先选择项目", "error"); return; }

	const result = await showModal("退回文件", [
		{ label: "退回原因", key: "reason", type: "textarea", required: true, placeholder: "如：文件格式不符合归档要求，请重新上传。" },
	], "退回");

	if (!result) return;
	try {
		showToast("正在退回文件…", "info");
		await apiClient.call("returnUploadFile", { pathParams: { projectId, fileId: file.id }, body: { reason: result.reason } });
		showToast("文件已退回", "success");
		await refreshData();
	} catch (error) {
		showToast(`退回失败：${error instanceof Error ? error.message : "未知错误"}`, "error");
	}
}

async function handleClassifyFile(file: import("./archive-api.js").UploadFileRecord): Promise<void> {
	if (isProjectArchived()) { showToast("项目已归档锁定", "error"); return; }
	const projectId = requireData().selectedProject?.id;
	if (!projectId) { showToast("请先选择项目", "error"); return; }

	if (!window.confirm(`确认对文件「${file.title ?? file.fileName}」执行 AI 分类？需要后端已配置 AI 服务。`)) return;
	try {
		showToast("正在执行 AI 分类…", "info");
		const result = await apiClient.call("aiClassifyFile", {
			body: { fileName: file.fileName, fileContent: "", mimeType: file.mimeType ?? "", fileId: file.id, projectId },
		}) as Record<string, unknown>;

		const confirmed = await showClassificationModal("确认 AI 分类著录结果", [
			{ label: "题名", key: "title", type: "text", required: true, value: (result?.metadata as any)?.title || file.title || file.fileName },
			{ label: "目录节点 ID", key: "nodeId", type: "text", placeholder: "如：NODE-001", value: (result as any)?.catalogNodeId || file.nodeId || "" },
			{ label: "目录节点名称", key: "nodeLabel", type: "text", placeholder: "如：施工管理文件", value: (result as any)?.catalogNodeLabel || file.nodeLabel || "" },
			{ label: "编制单位", key: "compiler", type: "text", value: (result?.metadata as any)?.compiler || file.compiler || "" },
			{ label: "编制日期", key: "compileDate", type: "text", placeholder: "如：2026-01-15", value: (result?.metadata as any)?.compileDate || file.compileDate || "" },
			{ label: "责任人", key: "responsible", type: "text", value: (result?.metadata as any)?.responsible || file.responsible || "" },
		], result as any, "应用并保存");

		if (!confirmed) return;

		showToast("正在保存著录信息…", "info");
		const body: Record<string, unknown> = {
			title: confirmed.title,
			nodeId: confirmed.nodeId || undefined,
			nodeLabel: confirmed.nodeLabel || undefined,
		};
		if (confirmed.compiler) body.compiler = confirmed.compiler;
		if (confirmed.compileDate) body.compileDate = confirmed.compileDate;
		if (confirmed.responsible) body.responsible = confirmed.responsible;
		await apiClient.call("updateUploadFile", { pathParams: { projectId, fileId: file.id }, body });
		showToast("著录信息已保存并应用", "success");
		await refreshData();
	} catch (error) {
		showToast(`分类失败：${error instanceof Error ? error.message : "未知错误"}`, "error");
	}
}

async function handleCatalogueFile(file: import("./archive-api.js").UploadFileRecord): Promise<void> {
	if (isProjectArchived()) { showToast("项目已归档锁定", "error"); return; }
	const projectId = requireData().selectedProject?.id;
	if (!projectId) { showToast("请先选择项目", "error"); return; }

	const result = await showModal("著录文件", [
		{ label: "题名", key: "title", type: "text", required: true, value: file.title ?? file.fileName },
		{ label: "目录节点 ID", key: "nodeId", type: "text", placeholder: "如：NODE-001", value: file.nodeId ?? "" },
		{ label: "目录节点名称", key: "nodeLabel", type: "text", placeholder: "如：施工管理文件", value: file.nodeLabel ?? "" },
		{ label: "编制单位", key: "compiler", type: "text", value: file.compiler ?? "" },
		{ label: "编制日期", key: "compileDate", type: "text", placeholder: "如：2026-01-15", value: file.compileDate ?? "" },
		{ label: "责任人", key: "responsible", type: "text", value: file.responsible ?? "" },
	], "保存");

	if (!result) return;
	try {
		showToast("正在更新著录信息…", "info");
		const body: Record<string, unknown> = {
			title: result.title,
			nodeId: result.nodeId || undefined,
			nodeLabel: result.nodeLabel || undefined,
		};
		if (result.compiler) body.compiler = result.compiler;
		if (result.compileDate) body.compileDate = result.compileDate;
		if (result.responsible) body.responsible = result.responsible;
		await apiClient.call("updateUploadFile", { pathParams: { projectId, fileId: file.id }, body });
		showToast("著录信息已更新", "success");
		await refreshData();
	} catch (error) {
		showToast(`著录失败：${error instanceof Error ? error.message : "未知错误"}`, "error");
	}
}

async function handleEnableTemplate(templateId: number): Promise<void> {
	if (!window.confirm("确认启用此标准模板？启用后同步到所有租户。")) return;
	try {
		showToast("正在启用模板…", "info");
		await apiClient.call("enableTemplate", { pathParams: { id: templateId } });
		showToast("模板启用成功", "success");
		await refreshData();
	} catch (error) {
		showToast(`启用失败：${error instanceof Error ? error.message : "未知错误"}`, "error");
	}
}

async function handleDisableTemplate(templateId: number): Promise<void> {
	if (!window.confirm("确认停用此标准模板？")) return;
	try {
		showToast("正在停用模板…", "info");
		await apiClient.call("disableTemplate", { pathParams: { id: templateId } });
		showToast("模板已停用", "success");
		await refreshData();
	} catch (error) {
		showToast(`停用失败：${error instanceof Error ? error.message : "未知错误"}`, "error");
	}
}

async function handleCreateCompilationInstance(): Promise<void> {
	if (isProjectArchived()) { showToast("项目已归档锁定", "error"); return; }
	const projectId = requireData().selectedProject?.id;
	if (!projectId) { showToast("请先选择项目", "error"); return; }

	const result = await showModal("创建编制实例", [
		{ label: "编制名称", key: "name", type: "text", required: true },
		{ label: "单位工程 ID", key: "unitId", type: "number", placeholder: "如：1" },
		{ label: "目录模板 ID", key: "templateId", type: "number", placeholder: "如：1" },
	], "创建");

	if (!result) return;
	try {
		showToast("正在创建编制实例…", "info");
		await apiClient.call("createCompilationInstance", {
			pathParams: { projectId },
			body: { name: result.name, unitId: result.unitId ? Number(result.unitId) : undefined, templateId: result.templateId ? Number(result.templateId) : undefined },
		});
		showToast("编制实例创建成功", "success");
		await refreshData();
	} catch (error) {
		showToast(`创建失败：${error instanceof Error ? error.message : "未知错误"}`, "error");
	}
}

async function handleLoadCompilationForm(instanceId: number): Promise<void> {
	const projectId = requireData().selectedProject?.id;
	if (!projectId) { showToast("请先选择项目", "error"); return; }
	try {
		showToast("正在加载编制表单…", "info");
		const formData = await apiClient.call("getCompilationFormData", { pathParams: { projectId, instanceId } }) as Record<string, unknown>;
		const data = (formData?.data ?? {}) as Record<string, string | null>;
		setSelectedCompilationId(instanceId);
		setCompilationFormData(data);
		showToast("表单已加载", "success");
	} catch (error) {
		showToast(`加载表单失败：${error instanceof Error ? error.message : "未知错误"}`, "error");
	}
}

async function handleSaveFormField(instanceId: number, fieldKey: string, fieldValue: string): Promise<void> {
	if (isProjectArchived()) { showToast("项目已归档锁定", "error"); return; }
	const projectId = requireData().selectedProject?.id;
	if (!projectId) { showToast("请先选择项目", "error"); return; }
	try {
		showToast("正在保存字段…", "info");
		await apiClient.call("updateCompilationFormData", {
			pathParams: { projectId, instanceId },
			body: { data: { [fieldKey]: fieldValue } },
		});
		setCompilationFormData({ ...compilationFormData, [fieldKey]: fieldValue });
		showToast("字段已保存", "success");
	} catch (error) {
		showToast(`保存失败：${error instanceof Error ? error.message : "未知错误"}`, "error");
	}
}

async function handleDeleteCompilationInstance(instanceId: number): Promise<void> {
	if (isProjectArchived()) { showToast("项目已归档锁定", "error"); return; }
	if (!window.confirm(`确认删除编制实例 #${instanceId}？此操作不可撤销。`)) return;
	try {
		const projectId = requireData().selectedProject?.id;
		if (!projectId) return;
		showToast("正在删除编制实例…", "info");
		await apiClient.call("deleteCompilationInstance", { pathParams: { projectId, instanceId } });
		showToast("编制实例已删除", "success");
		if (selectedCompilationId === instanceId) setSelectedCompilationId(undefined);
		await refreshData();
	} catch (error) {
		showToast(`删除失败：${error instanceof Error ? error.message : "未知错误"}`, "error");
	}
}

async function handleCompleteCompilationInstance(): Promise<void> {
	if (isProjectArchived()) { showToast("项目已归档锁定", "error"); return; }
	const projectId = requireData().selectedProject?.id;
	if (!projectId) { showToast("请先选择项目", "error"); return; }
	if (!selectedCompilationId) { showToast("请先选择一个编制实例", "error"); return; }
	if (!window.confirm(`确认完成编制实例 #${selectedCompilationId}？完成后将进入签章流程。`)) return;
	try {
		showToast("正在完成编制…", "info");
		await apiClient.call("updateCompilationInstance", {
			pathParams: { projectId, instanceId: selectedCompilationId },
			body: { status: "completed" },
		});
		showToast("编制已完成", "success");
		setSelectedCompilationId(undefined);
		await refreshData();
	} catch (error) {
		showToast(`操作失败：${error instanceof Error ? error.message : "未知错误"}`, "error");
	}
}

async function handleFormFill(instanceId: number): Promise<void> {
	if (isProjectArchived()) { showToast("项目已归档锁定", "error"); return; }
	const projectId = requireData().selectedProject?.id;
	if (!projectId) { showToast("请先选择项目", "error"); return; }
	try {
		showToast("正在获取默认填充值…", "info");
		const data = await apiClient.call("getFormFillDefaults", { pathParams: { projectId } }) as Record<string, unknown>;
		const defaults = (data?.defaults ?? data?.data ?? {}) as Record<string, string>;
		if (Object.keys(defaults).length > 0) {
			const merged = { ...compilationFormData };
			for (const [key, value] of Object.entries(defaults)) {
				if (!merged[key] || merged[key] === "") merged[key] = value;
			}
			setCompilationFormData(merged);
			showToast(`智能填充完成（${Object.keys(defaults).length} 个字段）`, "success");
		} else {
			showToast("没有可用的默认填充值", "info");
		}
	} catch (error) {
		showToast(`填充失败：${error instanceof Error ? error.message : "未知错误"}`, "error");
	}
}

export function renderBusinessFlowOverview(): TemplateResult {
	const data = requireData();
	const analysis = getCurrentAnalysis();
	const ctx = analysis.lifecycleContext;
	const projectReady = Boolean(data.selectedProject && data.units.length > 0 && data.members.length > 0);
	const catalogReady = ctx.hasCatalogTemplate && ctx.uncataloguedFiles === 0;
	const compilationReady = ctx.compilationInProgress === 0 && data.documents.some((document) => document.status === "approved");
	const reviewReady = ctx.reviewPending === 0;
	const signingReady = ctx.signingPending === 0;
	const archiveReady = ctx.archivePackageReady || ctx.collectedCount > 0 || data.selectedProject?.status === "project_archive";
	const steps = [
		{
			label: "项目组织",
			value: `${data.units.length} 个单位工程 / ${data.members.length} 名成员`,
			description: projectReady ? "项目基础与责任人已具备" : "先补齐单位工程和项目成员",
			tone: projectReady ? "green" : "amber",
		},
		{
			label: "文件著录",
			value: `${data.uploads.length} 个文件`,
			description: catalogReady ? "目录归类和著录状态可进入后续环节" : `${ctx.uncataloguedFiles} 个文件仍需著录或确认目录`,
			tone: catalogReady ? "green" : ctx.uncataloguedFiles > 0 ? "amber" : "blue",
		},
		{
			label: "编制审核",
			value: `${data.compilations.length} 个编制实例 / ${ctx.reviewPending} 个审核`,
			description: compilationReady && reviewReady ? "编制和审核没有明显阻塞" : "仍有草稿、编制或审核任务需要处理",
			tone: compilationReady && reviewReady ? "green" : "amber",
		},
		{
			label: "签章确认",
			value: `${data.signingTasks.length} 个签章任务`,
			description: signingReady ? "签章任务已闭合或暂无待签" : `${ctx.signingPending} 个签章任务未完成`,
			tone: signingReady ? "green" : "amber",
		},
		{
			label: "预检归档",
			value: analysis.lifecycleStageLabel,
			description: archiveReady ? "归档包或采集状态已形成" : "归档前需通过预检并生成归档包",
			tone: archiveReady ? "green" : "blue",
		},
	];

	return html`
		<div class="section">
			<div class="section-head">
				<h2>档案业务链路</h2>
				<span class="badge blue">当前：${analysis.lifecycleStageLabel}</span>
			</div>
			<div class="business-flow">
				${steps.map(
					(step) => html`
						<div class="flow-step tone-${step.tone}">
							<div class="flow-step-title">
								<strong>${step.label}</strong>
								<span class="badge ${step.tone}">${step.value}</span>
							</div>
							<div class="sub">${step.description}</div>
						</div>
					`,
				)}
			</div>
		</div>
	`;
}

export function renderCockpitWorkspace(): TemplateResult {
	const data = requireData();
	const project = data.selectedProject;

	if (!project) {
		return html`
			${renderEmptyProject()}
		`;
	}

	return html`
		${renderBusinessFlowOverview()}
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
	`;
}

function renderEmptyProject(): TemplateResult {
	return html`
		<div class="section">
			<div class="card pad">
				<div class="agent-card-title">${icon("building-2")} 尚未选择项目</div>
				<div class="sub">当前租户下 ${requireData().projects.length} 个项目。</div>
				<div style="margin-top: 12px">
					<button class="btn primary" @click=${handleCreateProject}>${icon("plus")} 创建项目</button>
					<button class="btn" @click=${() => setActiveAgentPanelTab("actions")}>${icon("sparkles")} 咨询智能体</button>
				</div>
			</div>
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
							<tr><th>姓名</th><th>角色</th><th style="width:60px"></th></tr>
							${members.map((m) => html`
								<tr>
									<td><strong>${m.userName ?? `成员 #${m.userId ?? m.id}`}</strong></td>
									<td><span class="badge blue">${roleLabel(m.role)}</span></td>
									<td><button class="btn btn-small" style="color:var(--archive-red)" @click=${() => handleRemoveMember(m.id, m.userName ?? `成员 #${m.userId ?? m.id}`)}>${icon("circle-x")}</button></td>
								</tr>
							`)}
						</table>
					`}
				<div style="padding:10px 14px;border-top:1px solid #d9ded8">
					<button class="btn primary" @click=${handleAddMember}>${icon("user-plus")} 添加成员</button>
				</div>
			</div>
		`;
}

function renderAccessCodeSection(accessCode?: import("./archive-api.js").AccessCodeInfo): TemplateResult {
	const data = requireData();
	return html`
			<div class="card pad">
				<div class="section-head">
					<h2>项目接入码</h2>
					<span class="badge blue">邀请成员</span>
				</div>
				${accessCode ? html`
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
				` : html`<div class="sub">暂无接入码数据</div>`}
				${data.inviteLinks.length > 0 ? html`
					<h3 style="margin-top:16px;margin-bottom:8px">邀请链接</h3>
					<table class="table" style="border:0;border-radius:0">
						<tr><th>角色</th><th>有效期</th><th>备注</th><th>创建时间</th><th></th></tr>
						${data.inviteLinks.map((link) => html`
							<tr>
								<td><span class="badge blue">${link.role ?? "-"}</span></td>
								<td>${link.expiry ?? "-"}</td>
								<td>${link.remark ?? "-"}</td>
								<td>${formatDate(link.createdAt)}</td>
								<td><button class="btn btn-small" style="color:var(--archive-red)" @click=${() => handleRevokeInviteLink(link.id)}>${icon("circle-x")}</button></td>
							</tr>
						`)}
					</table>
				` : ""}
				${data.inviteMembers.length > 0 ? html`
					<h3 style="margin-top:16px;margin-bottom:8px">受邀成员</h3>
					<table class="table" style="border:0;border-radius:0">
						<tr><th>姓名</th><th>角色</th><th>状态</th><th>邀请时间</th></tr>
						${data.inviteMembers.map((im) => html`
							<tr>
								<td>${im.userName ?? `成员 #${im.userId ?? im.id}`}</td>
								<td><span class="badge blue">${im.role ?? "-"}</span></td>
								<td>${im.status ?? "pending"}</td>
								<td>${formatDate(im.invitedAt)}</td>
							</tr>
						`)}
					</table>
				` : ""}
				<div style="margin-top:12px">
					<button class="btn primary" @click=${handleCreateInviteLink}>${icon("link")} 创建邀请链接</button>
				</div>
			</div>
		`;
}

export function renderGenericWorkspace(): TemplateResult {
	return html`
		${renderLifecycle()}
	`;
}

function renderFileActions(file: import("./archive-api.js").UploadFileRecord): TemplateResult {
	const canModify = file.status === "pending" || file.status === "returned";
	const buttons: TemplateResult[] = [];
	buttons.push(html`<button class="btn btn-small" @click=${() => handleCatalogueFile(file)}>${icon("pencil")}</button>`);
	buttons.push(html`<button class="btn btn-small" @click=${() => handleClassifyFile(file)}>${icon("sparkles")}</button>`);
	buttons.push(html`<button class="btn btn-small" @click=${() => handleRenameFile(file)}>${icon("pencil-line")}</button>`);
	if (canModify || file.status === "signing" || file.status === "signed") {
		buttons.push(html`<button class="btn btn-small" @click=${() => handleReplaceFile(file)}>${icon("rotate-cw")}</button>`);
	}
	if (file.status === "pending" || file.status === "returned") {
		buttons.push(html`<button class="btn btn-small" style="color:var(--archive-red)" @click=${() => handleDeleteFile(file)}>${icon("trash-2")}</button>`);
	}
	if (file.status === "collected" || file.status === "signed") {
		buttons.push(html`<button class="btn btn-small" style="color:var(--archive-red)" @click=${() => handleReturnFile(file)}>${icon("rotate-ccw")}</button>`);
	}
	return html`${buttons}`;
}

export function renderIntakeWorkspace(): TemplateResult {
	const data = requireData();
	const uploads = data.uploads;
	return html`
		<div style="margin-bottom:12px"><button class="btn primary" @click=${handleUploadFile}>${icon("upload")} 上传文件</button></div>
		<div class="section split">
			<div class="card tree">
				<h2 style="padding: 4px 8px 10px">目录模板节点</h2>
				${renderCatalogTemplateTree(data.catalogTemplateNodes)}
				<h2 style="padding: 12px 8px 6px">后端返回目录节点</h2>
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
								<th>操作</th>
								<th>时间</th>
							</tr>
							${uploads.map(
								(file) => html`
									<tr>
										<td><strong>${file.title || file.fileName}</strong><div class="sub">${file.mimeType ?? file.fileType ?? "未知类型"} · ${formatFileSize(file.fileSize)}</div></td>
										<td>${file.nodeLabel || file.nodeId || "未著录"}</td>
										<td>${[file.compiler, file.compileDate, file.responsible].filter(Boolean).join(" / ") || "未补齐"}</td>
										<td><span class="badge ${file.status === "returned" ? "red" : file.status === "pending" ? "amber" : "green"}">${statusLabel(file.status)}</span></td>
										<td><div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap">${renderFileActions(file)}</div></td>
										<td>${formatDate(file.updatedAt ?? file.uploadedAt)}</td>
									</tr>
								`,
							)}
						</table>
				`}
			</div>
		</div>
	`;
}

export function renderCompileWorkspace(): TemplateResult {
	const data = requireData();
	const instances = data.compilations;
	return html`
		<div class="section grid cols-2">
			<div class="card">
				<div class="section-head" style="padding: 14px 14px 0">
					<h2>编制实例</h2>
					<span class="badge blue">${instances.length} 条</span>
				</div>
				<div style="padding: 0 14px 10px;border-bottom:1px solid #d9ded8">
					<button class="btn primary" @click=${handleCreateCompilationInstance}>${icon("plus")} 创建实例</button>
					${selectedCompilationId ? html`<button class="btn" style="margin-left:6px" @click=${() => handleFormFill(selectedCompilationId!)}>${icon("wand-sparkles")} 智能填充</button>` : ""}
				</div>
				${instances.length === 0
					? renderEmptyState("当前项目暂无编制实例")
					: html`
						<div class="instance-list">
							${instances.map((inst) => html`
								<div class="instance-row ${selectedCompilationId === inst.id ? "active" : ""}" @click=${() => handleLoadCompilationForm(inst.id)}>
									<div style="flex:1">
										<strong>${inst.name ?? `实例 #${inst.id}`}</strong>
										<div class="sub">${inst.itemId ?? "未绑定目录项"} · ${statusLabel(inst.status)}</div>
									</div>
									<div style="display:flex;gap:4px;align-items:center">
										<span class="badge ${inst.status === "completed" || inst.status === "signed" || inst.status === "collected" ? "green" : inst.status === "drafting" ? "amber" : "blue"}">${statusLabel(inst.status)}</span>
										${inst.status === "drafting" && selectedCompilationId === inst.id ? html`<button class="btn btn-small" @click=${(e: Event) => { e.stopPropagation(); handleCompleteCompilationInstance(); }}>${icon("check")}</button>` : ""}
										<button class="btn btn-small" style="color:var(--archive-red)" @click=${(e: Event) => { e.stopPropagation(); handleDeleteCompilationInstance(inst.id); }}>${icon("trash-2")}</button>
									</div>
								</div>
							`)}
						</div>
					`}
			</div>
			<div>
				<div class="card" style="margin-bottom:12px">
					${selectedCompilationId ? renderCompilationFormEditor() : renderEmptyState("请从左侧选择一个编制实例以编辑表单")}
				</div>
				<div class="card">
					<div class="section-head" style="padding: 14px 14px 0">
						<h2>在线资料</h2>
						<span class="badge blue">${data.documents.filter((document) => document.type === "online").length} 条</span>
					</div>
					${renderDocumentTable(data.documents.filter((document) => document.type === "online"))}
				</div>
			</div>
		</div>
	`;
}

function renderCompilationFormEditor(): TemplateResult {
	const entries = Object.entries(compilationFormData);
	return html`
		<div class="section-head" style="padding: 14px 14px 0">
			<h2>编制表单</h2>
			<span class="badge blue">${entries.length} 个字段</span>
		</div>
		<div style="padding:0 14px 10px;border-bottom:1px solid #d9ded8">
			<button class="btn" @click=${() => handleFormFill(selectedCompilationId!)}>${icon("wand-sparkles")} 智能填充</button>
			<button class="btn primary" @click=${handleCompleteCompilationInstance} style="margin-left:6px">${icon("check")} 完成编制</button>
		</div>
		${entries.length === 0
			? renderEmptyState("该编制实例暂无表单数据，请点击「智能填充」或手动添加字段")
			: html`
				<table class="table" style="border:0;border-radius:0;margin-top:4px">
					<tr><th>字段</th><th>值</th><th>操作</th></tr>
					${entries.map(([key, value]) => html`
						<tr>
							<td><strong>${key}</strong></td>
							<td>${value ?? html`<span class="sub">（空）</span>`}</td>
							<td><button class="btn btn-small" @click=${() => handleEditFormField(key, value ?? "")}>${icon("pencil")}</button></td>
						</tr>
					`)}
				</table>
			`}
	`;
}

async function handleEditFormField(fieldKey: string, currentValue: string): Promise<void> {
	if (!selectedCompilationId) return;
	const result = await showModal("编辑字段", [
		{ label: "字段名", key: "key", type: "text", required: true, value: fieldKey },
		{ label: "字段值", key: "value", type: "text", value: currentValue },
	], "保存");
	if (!result) return;
	await handleSaveFormField(selectedCompilationId, result.key, result.value);
}

export function renderReviewWorkspace(): TemplateResult {
	const reviews = requireData().reviews;
	return html`
		<div class="section">
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
		</div>
	`;
}

export function renderSigningWorkspace(): TemplateResult {
	const tasks = requireData().signingTasks;
	return html`
		<div class="section">
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
		<div class="section">
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
		</div>
		<div class="section grid cols-2">
			${renderArchivePackageTable(data.archivePackages)}
			${renderCollectionTable(data.collectionItems)}
		</div>
		<div class="section">
			<div class="card">
				<div class="section-head" style="padding:14px 14px 0">
					<h2>城建档案馆映射</h2>
					<span class="badge blue">${data.cityArchiveMappings.length} 对映射</span>
				</div>
				<div style="padding:0 14px 14px">
					${renderCityArchiveMappingTable(data.cityArchiveNodes, data.cityArchiveMappings, data.catalogTemplateNodes.length)}
				</div>
			</div>
		</div>
	`;
}

export function renderGovernanceWorkspace(): TemplateResult {
	const data = requireData();
	return html`
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
		<div class="card pad">
			<div class="section-head">
				<h2>企业模板配置</h2>
				<span class="badge blue">${data.enterpriseConfigTemplates.length + data.enterpriseConfigParadigms.length} 项</span>
			</div>
			${data.enterpriseConfigTemplates.length === 0
				? html`<div class="sub">暂无企业模板配置</div>`
				: html`<h3 style="margin:8px 0 4px;font-size:13px;font-weight:600">模板</h3><table class="table" style="border:0;border-radius:0;font-size:12px">
					<tr><th>模板名称</th><th>标准</th><th>状态</th></tr>
					${data.enterpriseConfigTemplates.map((t) => html`<tr><td>${t.name}</td><td>${t.archiveStandard ?? "-"}</td><td><span class="badge ${t.status === "enabled" ? "green" : "red"}">${t.status === "enabled" ? "已启用" : "已停用"}</span></td></tr>`)}
				</table>`}
			${data.enterpriseConfigParadigms.length === 0
				? html`<div class="sub" style="margin-top:8px">暂无企业范本配置</div>`
				: html`<h3 style="margin:12px 0 4px;font-size:13px;font-weight:600">范本</h3><table class="table" style="border:0;border-radius:0;font-size:12px">
					<tr><th>范本名称</th><th>模板引用</th><th>类型</th><th>状态</th></tr>
					${data.enterpriseConfigParadigms.map((p) => html`<tr><td>${p.name}</td><td>${p.templateRef ?? "-"}</td><td>${p.docType ?? "-"}</td><td><span class="badge ${p.status === "enabled" ? "green" : "red"}">${p.status === "enabled" ? "已启用" : "已停用"}</span></td></tr>`)}
				</table>`}
		</div>
	`;
}
