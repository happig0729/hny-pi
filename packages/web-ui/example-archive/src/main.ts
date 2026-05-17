import { html, render, type TemplateResult } from "lit";
import { createIcons, icons } from "lucide";
import "./app.css";
import {
	buildActionProposal,
	getCurrentLifecycleStage,
	getWorkspace,
	lifecycleStages,
	type WorkspaceId,
	workspaces,
} from "./workspace-data.js";
import { ontologyManifest, ontologyRuntime, type LifecycleStage } from "./ontology-runtime.js";

let activeWorkspaceId: WorkspaceId = "cockpit";

const icon = (name: string): TemplateResult => html`<i data-lucide=${name}></i>`;

function issueTone(severity: "info" | "warning" | "blocking"): "blue" | "amber" | "red" {
	if (severity === "blocking") return "red";
	if (severity === "warning") return "amber";
	return "blue";
}

function stageState(stage: LifecycleStage, currentStage: LifecycleStage): string {
	const currentIndex = lifecycleStages.findIndex((item) => item.id === currentStage);
	const stageIndex = lifecycleStages.findIndex((item) => item.id === stage);
	if (stageIndex < currentIndex) return "done";
	if (stageIndex === currentIndex) return "current";
	return "";
}

function renderTopbar(): TemplateResult {
	return html`
		<header class="topbar">
			<div class="brand">
				<div class="brand-mark">${icon("archive")}</div>
				<span>Archive AI OS</span>
			</div>
			<div class="project-switcher">
				${icon("building-2")}
				<strong>青岛国际科创中心一期</strong>
				<span class="badge amber">预检中</span>
			</div>
			<div class="search">
				${icon("search")}
				<span>搜索项目、文件、目录节点、审核意见、签章任务</span>
			</div>
			<div class="top-actions">
				<button class="icon-btn" title="通知">${icon("bell")}</button>
				<button class="icon-btn" title="审计">${icon("shield-check")}</button>
				<button class="icon-btn" title="设置">${icon("settings")}</button>
			</div>
		</header>
	`;
}

function renderSidebar(): TemplateResult {
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

function renderMetrics(): TemplateResult {
	const workspace = getWorkspace(activeWorkspaceId);
	return html`
		<div class="grid cols-3">
			${workspace.metrics.map(
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

function renderLifecycle(): TemplateResult {
	const currentStage = getCurrentLifecycleStage(getWorkspace(activeWorkspaceId));
	return html`
		<div class="section">
			<div class="section-head">
				<h2>生命周期阶段</h2>
				<span class="badge blue">当前：${lifecycleStages.find((stage) => stage.id === currentStage)?.label}</span>
			</div>
			<div class="timeline">
				${lifecycleStages.map(
					(stage) => html`
						<div class="stage ${stageState(stage.id, currentStage)}">
							<strong>${stage.label}</strong>
							<span>${stage.description}</span>
						</div>
					`,
				)}
			</div>
		</div>
	`;
}

function renderIssueTable(): TemplateResult {
	const workspace = getWorkspace(activeWorkspaceId);
	return html`
		<div class="card">
			<div class="section-head" style="padding: 14px 14px 0">
				<h2>阻塞与建议</h2>
				<span class="badge ${workspace.issues.some((issue) => issue.severity === "blocking") ? "red" : "amber"}">
					${workspace.issues.length} 项
				</span>
			</div>
			<table class="table" style="border: 0; border-radius: 0; margin-top: 8px">
				<tr>
					<th>问题</th>
					<th>影响对象</th>
					<th>建议</th>
				</tr>
				${workspace.issues.map(
					(issue) => html`
						<tr>
							<td>
								<strong>${issue.title}</strong>
								<div class="sub">${issue.description}</div>
							</td>
							<td>
								<span class="badge ${issueTone(issue.severity)}">${issue.objectType}</span>
								<div class="sub">${issue.objectId}</div>
							</td>
							<td>${issue.suggestedAction ? html`<span class="badge blue">${issue.suggestedAction}</span>` : "待分析"}</td>
						</tr>
					`,
				)}
			</table>
		</div>
	`;
}

function renderActionProposal(): TemplateResult {
	const workspace = getWorkspace(activeWorkspaceId);
	const proposal = buildActionProposal(workspace);
	return html`
		<div class="card pad">
			<div class="section-head">
				<h2>Action Proposal</h2>
				<span class="badge ${proposal.canExecute ? "green" : "red"}">${proposal.canExecute ? "可执行草案" : "权限不足"}</span>
			</div>
			<div class="action-proposal">
				<div class="agent-card-title">${icon("workflow")} ${proposal.label}</div>
				<dl class="kv">
					<dt>Action Type</dt>
					<dd>${proposal.actionType}</dd>
					<dt>operationId</dt>
					<dd>${proposal.operationId ?? "未绑定"}</dd>
					<dt>确认等级</dt>
					<dd>${proposal.confirmationLevel}</dd>
					<dt>所需角色</dt>
					<dd>${proposal.requiredProjectRole ?? proposal.requiredRole}</dd>
					<dt>证据数量</dt>
					<dd>${proposal.evidenceCount}</dd>
				</dl>
				<div class="sub">副作用：${proposal.sideEffects.join("、")}</div>
				<div style="margin-top: 12px">
					<button class="btn primary">${icon("check")} 确认草案</button>
					<button class="btn">${icon("eye")} 查看证据</button>
				</div>
			</div>
		</div>
	`;
}

function renderGenericWorkspace(): TemplateResult {
	return html`
		${renderMetrics()}
		${renderLifecycle()}
		<div class="section grid cols-2">
			${renderIssueTable()}
			${renderActionProposal()}
		</div>
	`;
}

function renderIntakeWorkspace(): TemplateResult {
	return html`
		${renderMetrics()}
		<div class="section split">
			<div class="card tree">
				<h2 style="padding: 4px 8px 10px">档案目录树</h2>
				<div class="tree-row">${icon("folder")} 工程准备阶段文件</div>
				<div class="tree-row indent">${icon("folder")} 立项文件</div>
				<div class="tree-row">${icon("folder")} 施工文件</div>
				<div class="tree-row indent active">${icon("file-text")} 施工组织设计</div>
				<div class="tree-row indent">${icon("file-text")} 技术交底记录</div>
				<div class="tree-row">${icon("folder")} 竣工图</div>
				<div class="tree-row indent">${icon("file-text")} 建筑竣工图</div>
			</div>
			<div class="card">
				<table class="table">
					<tr>
						<th>文件</th>
						<th>AI 建议目录</th>
						<th>字段建议</th>
						<th>置信度</th>
						<th>状态</th>
					</tr>
					<tr>
						<td><strong>施工组织设计.pdf</strong><div class="sub">PDF · 42 页</div></td>
						<td>施工文件 / 施工组织设计</td>
						<td>题名、责任者、日期已提取</td>
						<td><div class="confidence"><span style="width: 94%"></span></div></td>
						<td><span class="badge green">可批量确认</span></td>
					</tr>
					<tr>
						<td><strong>给排水竣工图.pdf</strong><div class="sub">PDF · 18 页</div></td>
						<td>竣工图 / 给排水</td>
						<td>页数、载体、编制单位已提取</td>
						<td><div class="confidence"><span style="width: 86%"></span></div></td>
						<td><span class="badge blue">建议抽检</span></td>
					</tr>
					<tr>
						<td><strong>扫描件_0421.jpg</strong><div class="sub">图片 · OCR 完成</div></td>
						<td>未确认，可能为隐蔽验收记录</td>
						<td>OCR 噪声较高</td>
						<td><div class="confidence"><span style="width: 48%; background: var(--archive-amber)"></span></div></td>
						<td><span class="badge amber">人工复核</span></td>
					</tr>
				</table>
			</div>
		</div>
		<div class="section grid cols-2">
			${renderIssueTable()}
			${renderActionProposal()}
		</div>
	`;
}

function renderCompileWorkspace(): TemplateResult {
	return html`
		${renderMetrics()}
		<div class="section workbench">
			<div class="document-preview">
				<div class="paper">
					<div class="paper-title">单位工程质量竣工验收记录</div>
					<div class="paper-table">
						<div class="paper-cell">工程名称</div>
						<div class="paper-cell">青岛国际科创中心一期</div>
						<div class="paper-cell">施工单位</div>
						<div class="paper-cell">青建集团股份公司</div>
						<div class="paper-cell">监理单位</div>
						<div class="paper-cell">海信监理有限公司</div>
						<div class="paper-cell">验收日期</div>
						<div class="paper-cell">2026-05-12</div>
					</div>
					<div class="paper-line" style="margin-top: 26px"></div>
					<div class="paper-line short"></div>
					<div class="paper-line"></div>
				</div>
			</div>
			<div class="grid">
				${[
					["工程名称", "青岛国际科创中心一期", "项目默认值", "100%"],
					["施工单位", "青建集团股份公司", "Project.constructionUnit", "100%"],
					["验收结论", "符合设计及施工质量验收规范要求", "AI 推断 + 历史高频", "83%"],
					["项目负责人", "待人工确认", "缺少可靠来源", "42%"],
				].map(
					(field) => html`
						<div class="field">
							<label>${field[0]}</label>
							<div class="field-value">${field[1]}</div>
							<div class="field-source"><span>${field[2]}</span><span>${field[3]}</span></div>
						</div>
					`,
				)}
			</div>
		</div>
		<div class="section">${renderActionProposal()}</div>
	`;
}

function renderReviewWorkspace(): TemplateResult {
	return html`
		${renderMetrics()}
		<div class="section workbench">
			<div class="document-preview">
				<div class="paper">
					<div class="paper-title">施工组织设计报审表</div>
					<div class="paper-line"></div>
					<div class="paper-line short"></div>
					<div class="paper-table">
						<div class="paper-cell">编制日期</div>
						<div class="paper-cell" style="background: #fff4f3">2026-06-31</div>
						<div class="paper-cell">签章状态</div>
						<div class="paper-cell" style="background: #fff8eb">缺监理章</div>
						<div class="paper-cell">目录节点</div>
						<div class="paper-cell">施工组织设计</div>
					</div>
				</div>
			</div>
			<div class="card">
				<div class="review-marker">
					<div class="marker-icon red">${icon("calendar-x")}</div>
					<div><strong>日期非法</strong><div class="sub">提取到 2026-06-31，不是有效日期。</div></div>
					<span class="badge red">阻断</span>
				</div>
				<div class="review-marker">
					<div class="marker-icon amber">${icon("stamp")}</div>
					<div><strong>签章缺失</strong><div class="sub">监理单位节点未签，不能进入归档包。</div></div>
					<span class="badge amber">整改</span>
				</div>
				<div class="review-marker">
					<div class="marker-icon amber">${icon("message-square-text")}</div>
					<div><strong>退回意见草稿</strong><div class="sub">请修正编制日期，并补齐监理单位电子签章后重新提交。</div></div>
					<button class="btn">采用</button>
				</div>
			</div>
		</div>
		<div class="section">${renderActionProposal()}</div>
	`;
}

function renderSigningWorkspace(): TemplateResult {
	return html`
		${renderMetrics()}
		<div class="section grid cols-2">
			<div class="card pad">
				<div class="section-head">
					<h2>施工组织设计签章流程</h2>
					<span class="badge amber">Sequential</span>
				</div>
				<div class="sign-flow">
					<div class="sign-node"><div class="node-index done">1</div><div><strong>施工单位项目负责人</strong><div class="sub">已签 · 企业章有效</div></div><span class="badge green">完成</span></div>
					<div class="sign-node"><div class="node-index active">2</div><div><strong>监理工程师</strong><div class="sub">当前节点 · 等待签章</div></div><span class="badge amber">待签</span></div>
					<div class="sign-node"><div class="node-index">3</div><div><strong>总监理工程师</strong><div class="sub">等待前序节点完成</div></div><span class="badge blue">排队</span></div>
					<div class="sign-node"><div class="node-index">4</div><div><strong>建设单位项目负责人</strong><div class="sub">等待前序节点完成</div></div><span class="badge blue">排队</span></div>
				</div>
			</div>
			${renderActionProposal()}
		</div>
	`;
}

function renderArchiveWorkspace(): TemplateResult {
	return html`
		${renderMetrics()}
		<div class="section precheck-grid">
			<div class="card pad">
				<div class="section-head">
					<h2>预检结果</h2>
					<span class="badge red">未通过</span>
				</div>
				<div class="ring"><div class="ring-inner">74%</div></div>
				<div class="grid cols-3">
					<div class="metric"><div class="metric-value">312</div><div class="sub">通过项</div></div>
					<div class="metric"><div class="metric-value">12</div><div class="sub">警告项</div></div>
					<div class="metric"><div class="metric-value">9</div><div class="sub">阻断项</div></div>
				</div>
			</div>
			${renderIssueTable()}
		</div>
		<div class="section">${renderActionProposal()}</div>
	`;
}

function renderGovernanceWorkspace(): TemplateResult {
	return html`
		${renderMetrics()}
		<div class="section grid cols-2">
			<div class="card">
				<table class="table">
					<tr>
						<th>时间</th>
						<th>用户</th>
						<th>Action</th>
						<th>结果</th>
					</tr>
					<tr><td>10:42</td><td>李明</td><td>bulkSubmitUploadFiles</td><td><span class="badge green">成功</span></td></tr>
					<tr><td>10:35</td><td>王工</td><td>signSealFlowNode</td><td><span class="badge green">成功</span></td></tr>
					<tr><td>10:21</td><td>系统</td><td>runPrecheck</td><td><span class="badge red">阻断</span></td></tr>
				</table>
			</div>
			<div class="card pad">
				<div class="section-head">
					<h2>Ontology Runtime 验证</h2>
					<span class="badge blue">00 已接入</span>
				</div>
				<dl class="kv">
					<dt>Object Types</dt>
					<dd>${Object.keys(ontologyManifest.objectTypes).length}</dd>
					<dt>Action Types</dt>
					<dd>${Object.keys(ontologyManifest.actionTypes).length}</dd>
					<dt>Policies</dt>
					<dd>${Object.keys(ontologyManifest.policies).length}</dd>
					<dt>UploadFile Links</dt>
					<dd>${ontologyRuntime.getLinksForObject("UploadFile").length}</dd>
				</dl>
			</div>
		</div>
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

function renderMain(): TemplateResult {
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
						<button class="btn">${icon("download")} 导出</button>
						<button class="btn primary">${icon("play-circle")} 生成动作草案</button>
					</div>
				</div>
				${renderWorkspaceBody()}
			</section>
		</main>
	`;
}

function renderAgentPanel(): TemplateResult {
	const workspace = getWorkspace(activeWorkspaceId);
	const proposal = buildActionProposal(workspace);
	const currentStage = getCurrentLifecycleStage(workspace);
	const stageLabel = lifecycleStages.find((stage) => stage.id === currentStage)?.label ?? currentStage;
	return html`
		<aside class="agent-panel">
			<div class="agent-head">
				<div class="agent-title">
					<div>
						<div class="eyebrow">${workspace.agentKind}</div>
						<h2>${workspace.agentName}</h2>
					</div>
					<span class="badge green">在线</span>
				</div>
				<div class="agent-tabs">
					<button class="agent-tab active">建议</button>
					<button class="agent-tab">证据</button>
					<button class="agent-tab">动作</button>
				</div>
			</div>
			<div class="agent-body">
				<div class="agent-card important">
					<div class="agent-card-title">${icon("sparkles")} 当前上下文判断</div>
					<ul class="agent-list">
						<li>生命周期阶段：${stageLabel}。</li>
						<li>主要对象：${workspace.primaryObjects.join("、")}。</li>
						<li>当前建议动作：${proposal.label}。</li>
					</ul>
				</div>
				<div class="action-proposal">
					<div class="agent-card-title">${icon("clipboard-list")} Action Proposal</div>
					<dl class="kv">
						<dt>Action Type</dt>
						<dd>${proposal.actionType}</dd>
						<dt>operationId</dt>
						<dd>${proposal.operationId ?? "未绑定"}</dd>
						<dt>确认等级</dt>
						<dd>${proposal.confirmationLevel}</dd>
						<dt>可执行</dt>
						<dd>${proposal.canExecute ? "是" : "否"}</dd>
					</dl>
					<button class="btn primary">${icon("check")} 确认</button>
					<button class="btn">${icon("x")} 暂不执行</button>
				</div>
				<div class="agent-card">
					<div class="agent-card-title">${icon("braces")} Ontology Scope</div>
					<ul class="agent-list">
						${workspace.ontologyScope.map((item) => html`<li>${item}</li>`)}
					</ul>
				</div>
				<div class="agent-card">
					<div class="agent-card-title">${icon("file-search")} EvidenceRef</div>
					<ul class="agent-list">
						${workspace.evidenceRefs.map(
							(evidence) => html`<li>${evidence.sourceType} · ${evidence.objectType ?? "unknown"} · ${evidence.excerpt}</li>`,
						)}
					</ul>
				</div>
			</div>
			<div class="agent-input">
				<div class="input-box">问当前 Agent：为什么不能归档？哪些项可以批量处理？这个动作会影响哪些对象？</div>
			</div>
		</aside>
	`;
}

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

function setActiveWorkspace(workspaceId: WorkspaceId): void {
	activeWorkspaceId = workspaceId;
	renderApp();
}

renderApp();
