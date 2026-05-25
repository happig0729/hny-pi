import { html, type TemplateResult } from "lit";

export const icon = (name: string): TemplateResult => html`<i data-lucide=${name}></i>`;

export function formatDate(value?: string): string {
	if (!value) return "-";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return date.toLocaleString("zh-CN", { hour12: false });
}

export function formatFileSize(value?: number): string {
	if (!value) return "未知大小";
	if (value < 1024) return `${value} B`;
	if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
	return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export function renderEmptyState(message: string): TemplateResult {
	return html`<div class="sub" style="padding: 16px">${message}</div>`;
}

export function showToast(message: string, tone: "success" | "error" | "info" = "info"): void {
	const container = document.getElementById("toast-container") ?? createToastContainer();
	const toast = document.createElement("div");
	toast.className = `toast toast-${tone}`;
	toast.textContent = message;
	container.appendChild(toast);
	setTimeout(() => {
		toast.classList.add("toast-exit");
		toast.addEventListener("transitionend", () => toast.remove());
	}, 3500);
}

function createToastContainer(): HTMLElement {
	const container = document.createElement("div");
	container.id = "toast-container";
	container.style.cssText =
		"position:fixed;top:16px;right:16px;z-index:9999;display:flex;flex-direction:column;gap:8px;pointer-events:none;";
	document.body.appendChild(container);
	return container;
}

export interface ModalField {
	label: string;
	key: string;
	type: "text" | "number" | "textarea" | "select";
	required?: boolean;
	options?: (string | { value: string; label: string })[];
	placeholder?: string;
	value?: string;
}

export function showModal(title: string, fields: ModalField[], submitLabel = "确认"): Promise<Record<string, string> | null> {
	return new Promise((resolve) => {
		const overlay = document.createElement("div");
		overlay.style.cssText = "position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;";
		const box = document.createElement("div");
		box.style.cssText = "background:#fff;border-radius:10px;padding:24px;min-width:420px;max-width:520px;max-height:80vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,0.2);";
		box.innerHTML = `<h3 style="margin:0 0 16px;font-size:16px;font-weight:600;">${title}</h3>`;

		const inputs: Map<string, HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement> = new Map();

		for (const field of fields) {
			const group = document.createElement("div");
			group.style.cssText = "margin-bottom:12px;";
			const label = document.createElement("label");
			label.style.cssText = "display:block;font-size:13px;font-weight:500;margin-bottom:4px;color:#18201d;";
			label.textContent = field.label + (field.required ? " *" : "");
			group.appendChild(label);

			if (field.type === "select" && field.options) {
				const select = document.createElement("select");
				select.style.cssText = "width:100%;padding:8px 10px;border:1px solid #d9ded8;border-radius:6px;font-size:14px;background:#fff;";
				const empty = document.createElement("option");
				empty.value = "";
				empty.textContent = field.placeholder ?? "请选择";
				select.appendChild(empty);
				for (const opt of field.options) {
					const el = document.createElement("option");
					el.value = typeof opt === "string" ? opt : opt.value;
					el.textContent = typeof opt === "string" ? opt : opt.label;
					select.appendChild(el);
				}
				if (field.required) select.required = true;
				inputs.set(field.key, select);
				group.appendChild(select);
			} else if (field.type === "textarea") {
				const ta = document.createElement("textarea");
				ta.style.cssText = "width:100%;padding:8px 10px;border:1px solid #d9ded8;border-radius:6px;font-size:14px;resize:vertical;min-height:60px;font-family:inherit;";
				ta.placeholder = field.placeholder ?? "";
				if (field.required) ta.required = true;
				inputs.set(field.key, ta);
				group.appendChild(ta);
			} else {
				const input = document.createElement("input");
				input.type = field.type === "number" ? "number" : "text";
				input.style.cssText = "width:100%;padding:8px 10px;border:1px solid #d9ded8;border-radius:6px;font-size:14px;";
				input.placeholder = field.placeholder ?? "";
				if (field.required) input.required = true;
				inputs.set(field.key, input);
				group.appendChild(input);
			}
			box.appendChild(group);
		}

		const btnRow = document.createElement("div");
		btnRow.style.cssText = "display:flex;gap:8px;justify-content:flex-end;margin-top:4px;";

		const cancelBtn = document.createElement("button");
		cancelBtn.className = "btn";
		cancelBtn.textContent = "取消";
		cancelBtn.onclick = () => { overlay.remove(); resolve(null); };

		const submitBtn = document.createElement("button");
		submitBtn.className = "btn primary";
		submitBtn.textContent = submitLabel;
		submitBtn.onclick = () => {
			const result: Record<string, string> = {};
			let valid = true;
			for (const field of fields) {
				const input = inputs.get(field.key);
				if (!input) continue;
				const value = input.value.trim();
				if (field.required && !value) { valid = false; input.style.borderColor = "#b84035"; } else { input.style.borderColor = "#d9ded8"; }
				result[field.key] = value;
			}
			if (!valid) return;
			overlay.remove();
			resolve(result);
		};

		btnRow.appendChild(cancelBtn);
		btnRow.appendChild(submitBtn);
		box.appendChild(btnRow);
		overlay.appendChild(box);
		overlay.onclick = (e) => { if (e.target === overlay) { overlay.remove(); resolve(null); } };
		document.body.appendChild(overlay);
	});
}

export function selectLocalFile(accept = "*"): Promise<File | null> {
	return new Promise((resolve) => {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = accept;
		input.style.display = "none";

		let finished = false;
		const finish = (file: File | null) => {
			if (finished) return;
			finished = true;
			input.remove();
			resolve(file);
		};

		input.onchange = () => {
			const file = input.files?.[0] ?? null;
			finish(file);
		};

		input.oncancel = () => {
			finish(null);
		};

		document.body.appendChild(input);
		input.click();
	});
}

export interface ClassificationResultView {
	success: boolean;
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

export function showClassificationModal(
	title: string,
	fields: ModalField[],
	result: ClassificationResultView,
	submitLabel = "确认"
): Promise<Record<string, string> | null> {
	return new Promise((resolve) => {
		const overlay = document.createElement("div");
		overlay.style.cssText = "position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;";
		const box = document.createElement("div");
		box.style.cssText = "background:#fff;border-radius:10px;padding:24px;min-width:420px;max-width:520px;max-height:80vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,0.2);";
		box.innerHTML = `<h3 style="margin:0 0 16px;font-size:16px;font-weight:600;">${title}</h3>`;

		// 1. Render AI Classification Result block
		const resultContainer = document.createElement("div");
		resultContainer.className = "classify-result";
		resultContainer.style.cssText = "margin-bottom:16px;padding:12px;border:1px solid #d9ded8;border-radius:6px;background:#f8faf7;font-size:12px;";

		if (result.error) {
			resultContainer.innerHTML = `<div style="color:var(--archive-red);font-weight:600;">分类失败：${result.error}</div>`;
		} else {
			const isHighConf = (result.confidence ?? 0) >= 0.7;
			const isLowConf = (result.confidence ?? 1) < 0.4;
			const badgeColor = isHighConf ? "#2e7d32" : isLowConf ? "#c62828" : "#f57c00";
			const badgeBg = isHighConf ? "#e8f5e9" : isLowConf ? "#ffebee" : "#fff3e0";
			const confidencePct = Math.round((result.confidence ?? 0) * 100);

			let html = `
				<div class="classify-row" style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
					<span style="color:#666;min-width:70px;">AI 识别类型:</span>
					<strong style="color:#111;">${result.fileTypeLabel ?? result.fileType ?? "未知类型"}</strong>
					<span class="badge" style="padding:2px 6px;border-radius:4px;font-size:11px;font-weight:600;color:${badgeColor};background:${badgeBg}">${confidencePct}% 置信度</span>
				</div>
			`;
			if (result.catalogNodeLabel) {
				html += `
					<div class="classify-row" style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
						<span style="color:#666;min-width:70px;">推荐目录:</span>
						<strong style="color:#111;">${result.catalogNodeLabel}</strong>
					</div>
				`;
			}
			if (result.metadata?.title) {
				html += `
					<div class="classify-row" style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
						<span style="color:#666;min-width:70px;">提取题名:</span>
						<strong style="color:#111;">${result.metadata.title}</strong>
					</div>
				`;
			}
			if (result.metadata?.compiler) {
				html += `
					<div class="classify-row" style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
						<span style="color:#666;min-width:70px;">编制单位:</span>
						<strong style="color:#111;">${result.metadata.compiler}</strong>
					</div>
				`;
			}
			if (result.metadata?.compileDate) {
				html += `
					<div class="classify-row" style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
						<span style="color:#666;min-width:70px;">编制日期:</span>
						<strong style="color:#111;">${result.metadata.compileDate}</strong>
					</div>
				`;
			}
			resultContainer.innerHTML = html;
		}
		box.appendChild(resultContainer);

		// 2. Render Form Fields
		const inputs: Map<string, HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement> = new Map();

		for (const field of fields) {
			const group = document.createElement("div");
			group.style.cssText = "margin-bottom:12px;";
			const label = document.createElement("label");
			label.style.cssText = "display:block;font-size:13px;font-weight:500;margin-bottom:4px;color:#18201d;";
			label.textContent = field.label + (field.required ? " *" : "");
			group.appendChild(label);

			if (field.type === "select" && field.options) {
				const select = document.createElement("select");
				select.style.cssText = "width:100%;padding:8px 10px;border:1px solid #d9ded8;border-radius:6px;font-size:14px;background:#fff;";
				const empty = document.createElement("option");
				empty.value = "";
				empty.textContent = field.placeholder ?? "请选择";
				select.appendChild(empty);
				for (const opt of field.options) {
					const el = document.createElement("option");
					el.value = typeof opt === "string" ? opt : opt.value;
					el.textContent = typeof opt === "string" ? opt : opt.label;
					select.appendChild(el);
				}
				if (field.required) select.required = true;
				if (field.value !== undefined) select.value = field.value;
				inputs.set(field.key, select);
				group.appendChild(select);
			} else if (field.type === "textarea") {
				const ta = document.createElement("textarea");
				ta.style.cssText = "width:100%;padding:8px 10px;border:1px solid #d9ded8;border-radius:6px;font-size:14px;resize:vertical;min-height:60px;font-family:inherit;";
				ta.placeholder = field.placeholder ?? "";
				if (field.required) ta.required = true;
				if (field.value !== undefined) ta.value = field.value;
				inputs.set(field.key, ta);
				group.appendChild(ta);
			} else {
				const input = document.createElement("input");
				input.type = field.type === "number" ? "number" : "text";
				input.style.cssText = "width:100%;padding:8px 10px;border:1px solid #d9ded8;border-radius:6px;font-size:14px;";
				input.placeholder = field.placeholder ?? "";
				if (field.required) input.required = true;
				if (field.value !== undefined) input.value = field.value;
				inputs.set(field.key, input);
				group.appendChild(input);
			}
			box.appendChild(group);
		}

		// 3. Render Buttons
		const btnRow = document.createElement("div");
		btnRow.style.cssText = "display:flex;gap:8px;justify-content:flex-end;margin-top:4px;";

		const cancelBtn = document.createElement("button");
		cancelBtn.className = "btn";
		cancelBtn.textContent = "取消";
		cancelBtn.onclick = () => { overlay.remove(); resolve(null); };

		const submitBtn = document.createElement("button");
		submitBtn.className = "btn primary";
		submitBtn.textContent = submitLabel;
		submitBtn.onclick = () => {
			const resultData: Record<string, string> = {};
			let valid = true;
			for (const field of fields) {
				const input = inputs.get(field.key);
				if (!input) continue;
				const value = input.value.trim();
				if (field.required && !value) { valid = false; input.style.borderColor = "#b84035"; } else { input.style.borderColor = "#d9ded8"; }
				resultData[field.key] = value;
			}
			if (!valid) return;
			overlay.remove();
			resolve(resultData);
		};

		btnRow.appendChild(cancelBtn);
		btnRow.appendChild(submitBtn);
		box.appendChild(btnRow);
		overlay.appendChild(box);
		overlay.onclick = (e) => { if (e.target === overlay) { overlay.remove(); resolve(null); } };
		document.body.appendChild(overlay);
	});
}

