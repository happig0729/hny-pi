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
