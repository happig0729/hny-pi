#!/usr/bin/env npx tsx

import * as fs from "node:fs";
import * as path from "node:path";

const ONTOLOGY_DIR = path.resolve(import.meta.dirname, "../ontology");
const OUTPUT_FILE = path.resolve(import.meta.dirname, "../src/ontology-context.generated.ts");
const OBJECT_DOCS = [
	"01-organization-identity.md",
	"02-project-management.md",
	"03-document-lifecycle.md",
	"04-template-catalog.md",
	"05-review-signing.md",
	"06-archive-collection.md",
	"07-ai-compliance.md",
	"08-invitation-system.md",
	"09-cross-domain-services.md",
];
const _OTHER_DOCS = ["action-types.md", "link-types.md", "security-governance.md"];

function readFile(name: string): string {
	return fs.readFileSync(path.join(ONTOLOGY_DIR, name), "utf-8");
}

function stripFrontmatter(md: string): string {
	const match = md.match(/^---\n[\s\S]*?\n---\n*/);
	return match ? md.slice(match[0].length) : md;
}

function extractTables(md: string): string[] {
	const lines = md.split("\n");
	const tables: string[] = [];
	let inTable = false;
	let tableLines: string[] = [];

	for (const line of lines) {
		if (line.startsWith("|") && line.endsWith("|")) {
			if (!inTable) {
				inTable = true;
				tableLines = [];
			}
			tableLines.push(line);
		} else if (line.match(/^\|[-:| ]+\|$/)) {
			if (inTable) {
				tableLines.push(line);
			}
		} else {
			if (inTable && tableLines.length > 0) {
				tables.push(tableLines.join("\n"));
				tableLines = [];
			}
			inTable = false;
		}
	}
	if (inTable && tableLines.length > 0) {
		tables.push(tableLines.join("\n"));
	}
	return tables;
}

interface TableRow {
	cells: string[];
}

function parseTable(md: string): { header: string[]; rows: TableRow[] } {
	const lines = md.split("\n").filter((l) => !l.match(/^\|[-:| ]+\|$/));
	const headerCells = parseRow(lines[0]);
	const rows: TableRow[] = lines.slice(1).map((l) => ({ cells: parseRow(l) }));
	return { header: headerCells, rows };
}

function parseRow(line: string): string[] {
	return line
		.slice(1, -1)
		.split("|")
		.map((c) => c.trim());
}

function isObjectAttrTable(header: string[]): boolean {
	const needed = new Set(["属性", "类型", "说明"]);
	if (header.length < 3) return false;
	for (const h of header.slice(0, 3)) {
		if (!needed.has(h)) return false;
	}
	return true;
}

function isActionTable(header: string[]): boolean {
	const needed = new Set(["Action", "API operationId", "触发者", "输入", "副作用"]);
	if (header.length < 5) return false;
	for (const h of header.slice(0, 5)) {
		if (!needed.has(h)) return false;
	}
	return true;
}

function isLinkTable(header: string[]): boolean {
	const needed = new Set(["Link Type", "源对象", "目标对象", "基数", "业务语义"]);
	if (header.length < 5) return false;
	for (const h of header.slice(0, 5)) {
		if (!needed.has(h)) return false;
	}
	return true;
}

function compactType(type: string): string {
	return type
		.replace(/link → /g, "→")
		.replace(/enum: /g, "")
		.replace(/text/g, "string")
		.replace(/integer/g, "int")
		.replace(/bigint/g, "bigint")
		.replace(/boolean/g, "bool")
		.replace(/timestamp/g, "ts")
		.replace(/date/g, "date")
		.replace(/numeric\(10,2\)/, "decimal")
		.replace(/jsonb/g, "json")
		.replace(/\s*\n\s*/g, " ")
		.trim();
}

function buildObjectSections(): string {
	const sections: string[] = [];

	for (const filename of OBJECT_DOCS) {
		const md = stripFrontmatter(readFile(filename));
		const h2s = md.match(/^### (.+)$/gm);
		if (!h2s) continue;

		for (const h2 of h2s) {
			const name = h2
				.replace("### ", "")
				.replace(/（.+）/, "")
				.trim();
			if (!name || (name.includes("与") && !name.includes("（"))) continue;

			const startIdx = md.indexOf(h2);
			const rest = md.slice(startIdx);
			const nextH2 = rest.match(/\n### /);
			const block = nextH2 ? rest.slice(0, nextH2.index! + 1) : rest;
			const tables = extractTables(block);

			for (const tableMd of tables) {
				const { header, rows } = parseTable(tableMd);
				if (!isObjectAttrTable(header) || rows.length === 0) continue;

				const attrs = rows.slice(0, 25).map((r) => {
					const attr = r.cells[0] || "";
					const type = compactType(r.cells[1] || "");
					const desc = (r.cells[2] || "").slice(0, 60);
					return `    ${attr} (${type})${desc ? ` — ${desc}` : ""}`;
				});

				if (attrs.length > 0) {
					sections.push(`${name}:\n${attrs.join("\n")}`);
				}
			}
		}
	}

	return sections.join("\n\n");
}

function buildLinkSection(): string {
	const md = stripFrontmatter(readFile("link-types.md"));
	const tables = extractTables(md);
	const links: string[] = [];

	for (const tableMd of tables) {
		const { header, rows } = parseTable(tableMd);
		if (!isLinkTable(header)) continue;

		for (const row of rows.slice(0, 70)) {
			const source = row.cells[1]?.trim() || "";
			const target = row.cells[2]?.trim() || "";
			const cardinality = row.cells[3]?.trim() || "";
			const semantics = (row.cells[4] || "").trim().slice(0, 50);
			if (source && target) {
				links.push(`  ${source} → ${target} (${cardinality})${semantics ? ` — ${semantics}` : ""}`);
			}
		}
	}

	return links.length > 0 ? `Key relationships:\n${links.join("\n")}` : "";
}

function buildActionSection(): string {
	const md = stripFrontmatter(readFile("action-types.md"));
	const tables = extractTables(md);
	const actions: string[] = [];

	for (const tableMd of tables) {
		const { header, rows } = parseTable(tableMd);
		if (!isActionTable(header)) continue;

		for (const row of rows.slice(0, 80)) {
			const action = row.cells[0]?.trim();
			const opId = row.cells[1]?.trim();
			const role = row.cells[2]?.trim();
			const input = (row.cells[3] || "").trim().slice(0, 40);
			const effect = (row.cells[4] || "").trim().slice(0, 50);
			if (action && opId) {
				actions.push(`  ${action} → ${opId} [${role}] ${input ? `(${input})` : ""}${effect ? ` → ${effect}` : ""}`);
			}
		}
	}

	return actions.length > 0 ? `Write operations:\n${actions.join("\n")}` : "";
}

function buildSecuritySection(): string {
	const md = stripFrontmatter(readFile("security-governance.md"));
	const cleaned = md
		.replace(/^#.*$/gm, "")
		.replace(/^```[\s\S]*?^```/gm, "")
		.replace(/^\s*$/gm, "")
		.trim();
	const lines = cleaned.split("\n").filter((l) => l.trim());
	return lines.slice(0, 40).join("\n").trim();
}

function build() {
	const objects = buildObjectSections();
	const links = buildLinkSection();
	const actions = buildActionSection();
	const security = buildSecuritySection();

	const content = `// AUTO-GENERATED from ontology/ markdown files. Do not edit.
// Run: npx tsx scripts/generate-ontology.ts
export const ONTOLOGY_BUSINESS_CONTEXT = ${JSON.stringify(
		`--- Archive Manager Business Ontology ---

OBJECT TYPES (attributes with types and descriptions):
${objects}

${links}

${actions}

ROLES:
${security}`,
	)};
`;
	fs.writeFileSync(OUTPUT_FILE, content, "utf-8");
	console.log(`Generated ${OUTPUT_FILE}`);
}

build();
