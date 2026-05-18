import { html, type TemplateResult } from "lit";
import type { ArchivePackageRecord, CollectionItemRecord, DocumentRecord, UploadFileRecord } from "./archive-api.js";
import { statusLabel } from "./labels.js";
import { formatDate, formatFileSize, icon, renderEmptyState } from "./render-utils.js";

export function renderUploadNodeTree(uploads: UploadFileRecord[]): TemplateResult {
	const nodeLabels = Array.from(new Set(uploads.map((upload) => upload.nodeLabel ?? upload.nodeId).filter((value): value is string => Boolean(value))));
	if (nodeLabels.length === 0) {
		return html`<div class="sub" style="padding: 8px">后端上传文件暂无目录节点数据。</div>`;
	}
	return html`${nodeLabels.map((label) => html`<div class="tree-row">${icon("file-text")} ${label}</div>`)}`;
}

export function renderCompilationTable(compilations: readonly { id: number; name?: string; itemId?: string; status?: string; lastModifiedAt?: string; createdAt?: string }[]): TemplateResult {
	if (compilations.length === 0) return renderEmptyState("当前项目暂无编制实例");
	return html`
		<table class="table" style="border: 0; border-radius: 0; margin-top: 8px">
			<tr><th>实例</th><th>目录项</th><th>状态</th><th>时间</th></tr>
			${compilations.map(
				(item) => html`
					<tr>
						<td><strong>${item.name ?? `编制实例 #${item.id}`}</strong></td>
						<td>${item.itemId ?? "-"}</td>
						<td><span class="badge ${item.status === "completed" || item.status === "signed" ? "green" : "amber"}">${statusLabel(item.status)}</span></td>
						<td>${formatDate(item.lastModifiedAt ?? item.createdAt)}</td>
					</tr>
				`,
			)}
		</table>
	`;
}

export function renderDocumentTable(documents: DocumentRecord[]): TemplateResult {
	if (documents.length === 0) return renderEmptyState("当前项目暂无资料");
	return html`
		<table class="table" style="border: 0; border-radius: 0; margin-top: 8px">
			<tr><th>资料</th><th>分类</th><th>状态</th><th>更新时间</th></tr>
			${documents.map(
				(document) => html`
					<tr>
						<td><strong>${document.title}</strong><div class="sub">${document.code ?? `资料 #${document.id}`}</div></td>
						<td>${document.category ?? "-"}</td>
						<td><span class="badge ${document.status === "approved" ? "green" : document.status === "rejected" ? "red" : "amber"}">${statusLabel(document.status)}</span></td>
						<td>${formatDate(document.updatedAt ?? document.createdAt)}</td>
					</tr>
				`,
			)}
		</table>
	`;
}

export function renderArchivePackageTable(packages: ArchivePackageRecord[]): TemplateResult {
	return html`
		<div class="card">
			<div class="section-head" style="padding: 14px 14px 0">
				<h2>归档包</h2>
				<span class="badge blue">${packages.length} 条</span>
			</div>
			${packages.length === 0
				? renderEmptyState("当前项目暂无归档包")
				: html`
					<table class="table" style="border: 0; border-radius: 0; margin-top: 8px">
						<tr><th>名称</th><th>阶段</th><th>文件数</th><th>状态</th></tr>
						${packages.map(
							(item) => html`
								<tr>
									<td><strong>${item.name ?? `归档包 #${item.id ?? "-"}`}</strong></td>
									<td>${item.stage ?? "-"}</td>
									<td>${item.fileCount ?? "-"}</td>
									<td><span class="badge ${item.status === "ready" || item.status === "submitted" ? "green" : "amber"}">${statusLabel(item.status)}</span></td>
								</tr>
							`,
						)}
					</table>
				`}
		</div>
	`;
}

export function renderCollectionTable(items: CollectionItemRecord[]): TemplateResult {
	return html`
		<div class="card">
			<div class="section-head" style="padding: 14px 14px 0">
				<h2>采集项</h2>
				<span class="badge blue">${items.length} 条</span>
			</div>
			${items.length === 0
				? renderEmptyState("当前项目暂无采集项")
				: html`
					<table class="table" style="border: 0; border-radius: 0; margin-top: 8px">
						<tr><th>采集编号</th><th>类型</th><th>采集时间</th></tr>
						${items.map(
							(item) => html`
								<tr>
									<td><strong>${item.itemId ?? item.id ?? "-"}</strong></td>
									<td>${item.fileType ?? "-"}</td>
									<td>${formatDate(item.collectedAt)}</td>
								</tr>
							`,
						)}
					</table>
				`}
		</div>
	`;
}
