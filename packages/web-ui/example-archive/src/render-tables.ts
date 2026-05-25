import { html, type TemplateResult } from "lit";
import type { ArchivePackageRecord, CatalogTemplateNodeRecord, CityArchiveMappingRecord, CityArchiveNodeRecord, CollectionItemRecord, DocumentRecord, UploadFileRecord, UploadFileVersionRecord } from "./archive-api.js";
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

interface TreeNode extends CatalogTemplateNodeRecord {
	children: TreeNode[];
}

function buildTree(nodes: CatalogTemplateNodeRecord[]): TreeNode[] {
	const map = new Map<number, TreeNode>();
	const roots: TreeNode[] = [];
	for (const node of nodes) {
		map.set(node.id, { ...node, children: [] });
	}
	for (const node of nodes) {
		const treeNode = map.get(node.id)!;
		if (node.parentId && map.has(node.parentId)) {
			map.get(node.parentId)!.children.push(treeNode);
		} else {
			roots.push(treeNode);
		}
	}
	roots.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
	return roots;
}

function renderTreeNodes(nodes: TreeNode[], depth = 0): TemplateResult[] {
	return nodes.flatMap((node) => [
		html`<div class="tree-row" style="padding-left: ${12 + depth * 20}px">
			${node.type === "folder" ? icon("folder") : icon("file-text")}
			<span>${node.name}</span>
			${node.formId ? html`<span class="badge blue" style="margin-left:6px">表单</span>` : ""}
		</div>`,
		...renderTreeNodes(node.children, depth + 1),
	]);
}

export function renderCatalogTemplateTree(nodes: CatalogTemplateNodeRecord[]): TemplateResult {
	if (nodes.length === 0) return html`<div class="sub" style="padding: 8px">暂无目录模板节点数据</div>`;
	const tree = buildTree(nodes);
	return html`<div class="tree">${renderTreeNodes(tree)}</div>`;
}

export function renderCityArchiveMappingTable(
	cityNodes: CityArchiveNodeRecord[],
	mappings: CityArchiveMappingRecord[],
	projectNodeCount: number,
): TemplateResult {
	const mappedCityNodeIds = new Set(mappings.map((m) => m.cityNodeId));
	const mappedProjectNodeIds = new Set(mappings.map((m) => m.projectNodeId));
	const mappedCount = mappings.length;

	return html`
		<div class="kv" style="margin-top:8px">
			<dt>城建档案馆节点</dt>
			<dd>${cityNodes.length} 个</dd>
			<dt>已映射节点</dt>
			<dd>${mappedCount} 对</dd>
			<dt>项目目录节点</dt>
			<dd>${projectNodeCount} 个</dd>
			<dt>映射覆盖率</dt>
			<dd>
				<span class="badge ${projectNodeCount > 0 && mappedCount >= projectNodeCount ? "green" : mappedCount > 0 ? "amber" : "red"}">
					${projectNodeCount > 0 ? `${Math.round((mappedCount / projectNodeCount) * 100)}%` : "无目录"}
				</span>
			</dd>
		</div>
		${cityNodes.length > 0 ? html`
			<table class="table" style="border:0;border-radius:0;margin-top:8px">
				<tr><th>编号</th><th>节点名称</th><th>映射状态</th></tr>
				${cityNodes.map((node) => html`
					<tr>
						<td>${node.number ?? "-"}</td>
						<td>${node.name}</td>
						<td>
							${mappedCityNodeIds.has(node.id)
								? html`<span class="badge green">已映射</span>`
								: html`<span class="badge red">未映射</span>`}
						</td>
					</tr>
				`)}
			</table>
		` : html`<div class="sub" style="padding:8px 0">暂无城建档案馆节点</div>`}
	`;
}


export function renderUploadFileVersionTable(versions: UploadFileVersionRecord[]): TemplateResult {
	if (versions.length === 0) return html`<div class="sub" style="padding: 4px 0">暂无版本记录</div>`;
	return html`
		<table class="table" style="border:0;border-radius:0;margin:4px 0;font-size:12px">
			<tr><th>版本</th><th>文件名</th><th>文件大小</th><th>创建时间</th></tr>
			${versions.map((v) => html`
				<tr>
					<td><span class="badge blue">v${v.version}</span></td>
					<td>${v.fileNameSnapshot ?? "未知"}</td>
					<td>${formatFileSize(v.fileSize)}</td>
					<td>${formatDate(v.createdAt)}</td>
				</tr>
			`)}
		</table>
	`;
}

export interface ClassificationResultView {
	fileType?: string;
	fileTypeLabel?: string;
	confidence?: number;
	catalogNodeId?: string;
	catalogNodeLabel?: string;
	metadata?: {
		title?: string;
		compiler?: string;
		compileDate?: string;
		responsible?: string;
	};
	error?: string;
}

export function renderClassificationResult(result: ClassificationResultView): TemplateResult {
	if (!result) return html``;
	const isHighConf = (result.confidence ?? 0) >= 0.7;
	const isLowConf = (result.confidence ?? 1) < 0.4;
	const hasError = result.error;

	return html`
		<div class="classify-result">
			${hasError ? html`<div class="sub" style="color:var(--archive-red)">分类失败：${result.error}</div>` : html`
				<div class="classify-row">
					<span class="sub">文件类型</span>
					<strong>${result.fileTypeLabel ?? result.fileType ?? "-"}</strong>
					<span class="badge ${isHighConf ? "green" : isLowConf ? "red" : "amber"}">${Math.round((result.confidence ?? 0) * 100)}%</span>
				</div>
				${result.catalogNodeLabel ? html`<div class="classify-row"><span class="sub">推荐目录</span><strong>${result.catalogNodeLabel}</strong></div>` : ""}
				${result.metadata?.title ? html`<div class="classify-row"><span class="sub">题名</span><strong>${result.metadata.title}</strong></div>` : ""}
				${result.metadata?.compiler ? html`<div class="classify-row"><span class="sub">编制单位</span><strong>${result.metadata.compiler}</strong></div>` : ""}
				${result.metadata?.compileDate ? html`<div class="classify-row"><span class="sub">编制日期</span><strong>${result.metadata.compileDate}</strong></div>` : ""}
			`}
		</div>
	`;
}
