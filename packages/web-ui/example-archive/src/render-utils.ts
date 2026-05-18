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
	options?: string[];
	placeholder?: string;
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
					el.value = opt;
					el.textContent = opt;
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
