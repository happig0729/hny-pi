import { DownloadButton } from "@mariozechner/mini-lit/dist/DownloadButton.js";
import { html, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import * as pdfjsLib from "pdfjs-dist";
import { i18n } from "../../utils/i18n.js";
import { ArtifactElement } from "./ArtifactElement.js";

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

/** Check if a string looks like valid base64 (PDF binary data) */
function isLikelyBase64(str: string): boolean {
	const s = str.replace(/^data:.*?base64,/, "").trim();
	// Base64: only A-Z, a-z, 0-9, +, /, =
	return /^[A-Za-z0-9+/]*={0,2}$/.test(s) && s.length >= 50;
}

/** Check if content starts with PDF magic bytes (after base64 decode) */
function isLikelyPdfData(content: string): boolean {
	if (content.startsWith("%PDF-")) return true;
	try {
		const s = content.replace(/^data:.*?base64,/, "").trim();
		const decoded = atob(s);
		return decoded.startsWith("%PDF-");
	} catch {
		return false;
	}
}

@customElement("pdf-artifact")
export class PdfArtifact extends ArtifactElement {
	@property({ type: String }) private _content = "";
	@state() private error: string | null = null;
	@state() private isTextContent = false;
	private currentLoadingTask: any = null;

	get content(): string {
		return this._content;
	}

	set content(value: string) {
		this._content = value;
		this.error = null;
		this.isTextContent = false;
		this.requestUpdate();
	}

	protected override createRenderRoot(): HTMLElement | DocumentFragment {
		return this;
	}

	override connectedCallback(): void {
		super.connectedCallback();
		this.style.display = "block";
		this.style.height = "100%";
	}

	override disconnectedCallback(): void {
		super.disconnectedCallback();
		this.cleanup();
	}

	private cleanup() {
		if (this.currentLoadingTask) {
			this.currentLoadingTask.destroy();
			this.currentLoadingTask = null;
		}
	}

	private base64Decode(value: string): string {
		let s = value;
		if (s.startsWith("data:")) {
			const m = s.match(/base64,(.+)/);
			if (m) s = m[1];
		}
		return atob(s.trim());
	}

	private base64ToUint8Array(value: string): Uint8Array {
		const binaryString = this.base64Decode(value);
		const bytes = new Uint8Array(binaryString.length);
		for (let i = 0; i < binaryString.length; i++) {
			bytes[i] = binaryString.charCodeAt(i);
		}
		return bytes;
	}

	public getHeaderButtons() {
		if (this.isTextContent || !isLikelyBase64(this._content)) {
			return html`<div class="flex items-center gap-1"></div>`;
		}
		try {
			return html`
				<div class="flex items-center gap-1">
					${DownloadButton({
						content: this.base64ToUint8Array(this._content),
						filename: this.filename,
						mimeType: "application/pdf",
						title: i18n("Download"),
					})}
				</div>
			`;
		} catch {
			return html`<div class="flex items-center gap-1"></div>`;
		}
	}

	override async updated(changedProperties: Map<string, any>) {
		super.updated(changedProperties);

		if (changedProperties.has("_content") && this._content && !this.error && !this.isTextContent) {
			await this.renderPdf();
		}
	}

	private async renderPdf() {
		const container = this.querySelector("#pdf-container");
		if (!container || !this._content) return;

		let pdf: any = null;

		try {
			// If content is not base64 PDF data, show as text
			if (!isLikelyBase64(this._content) && !isLikelyPdfData(this._content)) {
				this.isTextContent = true;
				this.requestUpdate();
				return;
			}

			const data = this.base64ToUint8Array(this._content);

			if (this.currentLoadingTask) {
				this.currentLoadingTask.destroy();
			}

			this.currentLoadingTask = pdfjsLib.getDocument({ data });
			pdf = await this.currentLoadingTask.promise;
			this.currentLoadingTask = null;

			container.innerHTML = "";
			const wrapper = document.createElement("div");
			wrapper.className = "p-4";
			container.appendChild(wrapper);

			for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
				const page = await pdf.getPage(pageNum);

				const pageContainer = document.createElement("div");
				pageContainer.className = "mb-4 last:mb-0";

				const canvas = document.createElement("canvas");
				const context = canvas.getContext("2d");

				const viewport = page.getViewport({ scale: 1.5 });
				canvas.height = viewport.height;
				canvas.width = viewport.width;

				canvas.className = "w-full max-w-full h-auto block mx-auto bg-white rounded shadow-sm border border-border";

				if (context) {
					context.fillStyle = "white";
					context.fillRect(0, 0, canvas.width, canvas.height);
				}

				await page.render({
					canvasContext: context!,
					viewport: viewport,
					canvas: canvas,
				}).promise;

				pageContainer.appendChild(canvas);

				if (pageNum < pdf.numPages) {
					const separator = document.createElement("div");
					separator.className = "h-px bg-border my-4";
					pageContainer.appendChild(separator);
				}

				wrapper.appendChild(pageContainer);
			}
		} catch (error: any) {
			console.error("Error rendering PDF:", error);
			// If PDF parse fails but content exists, show as text
			if (this._content && !String(error).includes("atob")) {
				this.isTextContent = true;
				this.requestUpdate();
			} else {
				this.error = error?.message || i18n("Failed to load PDF");
			}
		} finally {
			if (pdf) {
				pdf.destroy();
			}
		}
	}

	override render(): TemplateResult {
		if (this.error) {
			return html`
				<div class="h-full flex items-center justify-center bg-background p-4">
					<div class="bg-destructive/10 border border-destructive text-destructive p-4 rounded-lg max-w-2xl">
						<div class="font-medium mb-1">${i18n("Error loading PDF")}</div>
						<div class="text-sm opacity-90">${this.error}</div>
					</div>
				</div>
			`;
		}

		if (this.isTextContent) {
			return html`
				<div class="h-full flex flex-col bg-background overflow-auto">
					<div class="bg-muted/50 border-b border-border px-4 py-2 text-sm text-muted-foreground">
						内容为文本而非 PDF 二进制数据。如需生成 PDF，让 AI 用 JavaScript REPL 中的 jsPDF 库生成 PDF 并编码为 base64。
					</div>
					<pre class="flex-1 overflow-auto p-4 text-sm font-mono whitespace-pre-wrap break-words">${this._content}</pre>
				</div>
			`;
		}

		return html`
			<div class="h-full flex flex-col bg-background overflow-auto">
				<div id="pdf-container" class="flex-1 overflow-auto"></div>
			</div>
		`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"pdf-artifact": PdfArtifact;
	}
}
