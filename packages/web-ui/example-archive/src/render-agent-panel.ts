import { html, type TemplateResult } from "lit";
import type { ArchiveDashboardData } from "./archive-api.js";
import type { ArchiveOntologyAnalysis } from "./archive-ontology-analysis.js";
import { activeAgentPanelTab, activeWorkspaceId, appState, chatPanel, setActiveAgentPanelTab } from "./app-state.js";
import { analyzeArchiveWorkspace, analyzeEmptyWorkspace } from "./archive-ontology-analysis.js";
import { confirmationLabel, evidenceSourceLabel, fieldLabel, issueTone, objectLabel, objectLabelList, roleLabel } from "./labels.js";
import { icon } from "./render-utils.js";
import { getWorkspace, type WorkspaceId } from "./workspace-definitions.js";

export function renderAgentTabs(): TemplateResult {
	return html`
		<div class="decision-tabs">
			<button class="decision-tab ${activeAgentPanelTab === "suggestions" ? "active" : ""}" @click=${() => setActiveAgentPanelTab("suggestions")}>建议</button>
			<button class="decision-tab ${activeAgentPanelTab === "evidence" ? "active" : ""}" @click=${() => setActiveAgentPanelTab("evidence")}>依据</button>
			<button class="decision-tab ${activeAgentPanelTab === "actions" ? "active" : ""}" @click=${() => setActiveAgentPanelTab("actions")}>办理</button>
		</div>
	`;
}

function renderOntologyDecisionBody(workspaceId: WorkspaceId, data?: ArchiveDashboardData): TemplateResult {
	if (!data) {
		return html`
			<div class="agent-card important">
				<div class="agent-card-title">${icon("loader-circle")} 等待真实后端数据</div>
				<div class="sub">智能体已初始化，业务建议、依据和办理草案会在接口数据加载后生成。</div>
			</div>
		`;
	}
	const analysis = analyzeArchiveWorkspace(workspaceId, data);
	if (activeAgentPanelTab === "evidence") return renderAgentEvidenceTab(analysis);
	if (activeAgentPanelTab === "actions") return renderAgentActionsTab(analysis);
	return renderAgentSuggestionsTab(analysis);
}

function renderAgentSuggestionsTab(analysis: ArchiveOntologyAnalysis): TemplateResult {
	return html`
		<div class="decision-body-grid">
			<div class="agent-card important">
				<div class="agent-card-title">${icon("sparkles")} 当前上下文判断</div>
				<ul class="agent-list">
					<li>生命周期阶段：${analysis.lifecycleStageLabel}。</li>
					<li>后端数据：${analysis.apiErrors.length === 0 ? "已加载" : `${analysis.apiErrors.length} 个接口异常`}。</li>
					<li>下一步建议：${analysis.actionProposal.label}，${analysis.actionProposal.evidenceRequired ? "需要业务依据" : "不强制要求依据"}。</li>
				</ul>
			</div>
			<div class="agent-card">
				<div class="agent-card-title">${icon("triangle-alert")} 待处理事项</div>
				${analysis.issues.length === 0
					? html`<div class="sub">当前工作台未发现必须处理的问题。可查看"依据"确认数据来源，或查看"办理"生成下一步办理草案。</div>`
					: html`
						<div class="agent-items">
							${analysis.issues.slice(0, 2).map(
								(issue) => html`
									<div class="agent-item">
										<div>
											<strong>${issue.title}</strong>
											<span>${issue.description}</span>
										</div>
										<div class="agent-item-meta">
											<span class="badge ${issueTone(issue.severity)}">${objectLabel(issue.objectType)}</span>
										</div>
									</div>
								`,
							)}
						</div>
					`}
			</div>
		</div>
	`;
}

function renderAgentEvidenceTab(analysis: ArchiveOntologyAnalysis): TemplateResult {
	return html`
		<div class="agent-card compact">
			<div class="agent-card-title">${icon("file-search")} 业务依据</div>
			${analysis.evidenceRefs.length === 0
				? html`<div class="sub">当前还没有可展示的业务依据。请先加载项目数据，或进入具体工作台查看文件、审核、签章、预检记录。</div>`
				: html`
					<div class="sub">系统已从当前项目数据中找到 ${analysis.evidenceRefs.length} 条可追溯依据。</div>
					<div class="agent-items">
						${analysis.evidenceRefs.slice(0, 4).map(
							(evidence) => html`
								<div class="agent-item">
									<div>
										<strong>${objectLabel(evidence.objectType)} · ${fieldLabel(evidence.field)}</strong>
										<span>${evidence.excerpt ?? evidence.id}</span>
									</div>
									<div class="agent-item-meta">
										<span class="badge blue">${evidenceSourceLabel(evidence.sourceType)}</span>
										<span>可信度 ${Math.round((evidence.confidence ?? 0) * 100)}%</span>
									</div>
								</div>
							`,
						)}
					</div>
				`}
		</div>
	`;
}

function renderAgentActionsTab(analysis: ArchiveOntologyAnalysis): TemplateResult {
	const proposal = analysis.actionProposal;
	return html`
		<div class="action-proposal">
			<div class="agent-card-title">${icon("clipboard-list")} 下一步办理建议</div>
			<div class="agent-action-grid">
				<div><span>办理事项</span><strong>${proposal.label}</strong></div>
				<div><span>能否提交</span><strong>${proposal.canExecute ? "可以生成草案" : "暂不能提交"}</strong></div>
				<div><span>确认要求</span><strong>${confirmationLabel(proposal.confirmationLevel)}</strong></div>
				<div><span>办理人员</span><strong>${roleLabel(proposal.requiredProjectRole ?? proposal.requiredRole)}</strong></div>
				<div><span>依据要求</span><strong>${proposal.evidenceRequired ? `需要，当前 ${proposal.evidenceCount} 条` : "不强制要求"}</strong></div>
				<div><span>留痕要求</span><strong>${proposal.auditRequired ? "需要记录日志" : "不强制留痕"}</strong></div>
			</div>
			<div class="sub">提交后影响：${proposal.sideEffects.join("、")}</div>
			<div style="margin-top: 12px; display: flex; gap: 8px; flex-wrap: wrap">
				<button class="btn primary" ?disabled=${!proposal.canExecute || !proposal.operationId}>${icon("check")} 确认办理草案</button>
				<button class="btn" @click=${() => setActiveAgentPanelTab("evidence")}>${icon("eye")} 查看依据</button>
				<button class="btn" @click=${() => { setActiveAgentPanelTab("suggestions"); }}>${icon("sparkles")} 查看建议</button>
			</div>
		</div>
	`;
}

export function renderOntologyDecisionPanel(): TemplateResult {
	const workspace = getWorkspace(activeWorkspaceId);
	const data = appState.data;
	const analysis = data ? analyzeArchiveWorkspace(activeWorkspaceId, data) : analyzeEmptyWorkspace(activeWorkspaceId);

	return html`
		<section class="ontology-decision-panel">
			<div class="ontology-decision-head">
				<div>
					<div class="eyebrow">当前业务判断</div>
					<h2>${workspace.label} · ${analysis.lifecycleStageLabel}</h2>
					<div class="sub">先给出当前环节、关键对象、依据数量和下一步办理动作，右侧智能体负责解释和追问。</div>
				</div>
				${renderAgentTabs()}
			</div>
			<div class="ontology-summary-grid">
				<div>
					<span>当前阶段</span>
					<strong>${analysis.lifecycleStageLabel}</strong>
				</div>
				<div>
					<span>核心对象</span>
					<strong>${objectLabelList(workspace.primaryObjects)}</strong>
				</div>
				<div>
					<span>可追溯依据</span>
					<strong>${analysis.evidenceRefs.length} 条</strong>
				</div>
				<div>
					<span>下一动作</span>
					<strong>${analysis.actionProposal.label}</strong>
				</div>
			</div>
			<div class="decision-tab-body">
				${renderOntologyDecisionBody(activeWorkspaceId, data)}
			</div>
		</section>
	`;
}

export function renderAgentPanel(): TemplateResult {
	const workspace = getWorkspace(activeWorkspaceId);
	const data = appState.data;
	const analysis = data ? analyzeArchiveWorkspace(activeWorkspaceId, data) : analyzeEmptyWorkspace(activeWorkspaceId);
	return html`
		<aside class="agent-panel">
			<div class="agent-head">
				<div class="agent-title">
					<div>
						<div class="eyebrow">${workspace.agentKind}</div>
						<h2>${workspace.agentName}</h2>
					</div>
					<span class="badge ${appState.loadState === "ready" ? "green" : "amber"}">${appState.loadState === "ready" ? "在线" : "等待数据"}</span>
				</div>
				<div class="agent-context">
					<div>阶段：${analysis.lifecycleStageLabel}</div>
					<div>关注：${objectLabelList(workspace.primaryObjects)}</div>
					<div>依据：${analysis.evidenceRefs.length} 条</div>
				</div>
			</div>
			<div class="agent-chat-shell">
				${chatPanel
					? chatPanel
					: html`
						<div class="agent-loading">
							${icon("loader-circle")}
							<span>正在初始化智能体</span>
						</div>
					`}
			</div>
		</aside>
	`;
}
