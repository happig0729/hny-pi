const DB_NAME = "pi-archive-pinned";
const DB_VERSION = 1;
const STORE_NAME = "pinned_reports";

export interface PinnedReport {
	id: string;
	name: string;
	description: string;
	category: string;
	visibility: "personal" | "public";
	reportHtml: string;
	agentPrompt: string;
	toolName: string;
	toolParams: string;
	version: number;
	versions: PinnedReportVersion[];
	createdAt: number;
	updatedAt: number;
}

export interface PinnedReportVersion {
	version: number;
	reportHtml: string;
	agentPrompt: string;
	toolParams: string;
	savedAt: number;
}

let dbInstance: IDBDatabase | null = null;

function openDb(): Promise<IDBDatabase> {
	if (dbInstance) return Promise.resolve(dbInstance);
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, DB_VERSION);
		req.onupgradeneeded = () => {
			const db = req.result;
			if (!db.objectStoreNames.contains(STORE_NAME)) {
				const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
				store.createIndex("category", "category", { unique: false });
				store.createIndex("visibility", "visibility", { unique: false });
			}
		};
		req.onsuccess = () => {
			dbInstance = req.result;
			resolve(dbInstance);
		};
		req.onerror = () => reject(req.error);
	});
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
	return openDb().then(
		(db) =>
			new Promise((resolve, reject) => {
				const store = db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
				const req = fn(store);
				req.onsuccess = () => resolve(req.result);
				req.onerror = () => reject(req.error);
			}),
	);
}

export async function listPinnedReports(): Promise<PinnedReport[]> {
	const all = await tx<IDBValidKey[]>("readonly", (s) => s.getAllKeys());
	const results: PinnedReport[] = [];
	for (const key of all) {
		const record = await tx<PinnedReport>("readonly", (s) => s.get(key));
		if (record) results.push(record);
	}
	return results.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getPinnedReport(id: string): Promise<PinnedReport | undefined> {
	return tx<PinnedReport | undefined>("readonly", (s) => s.get(id));
}

export async function savePinnedReport(report: PinnedReport): Promise<void> {
	await tx("readwrite", (s) => s.put(report));
}

export async function deletePinnedReport(id: string): Promise<void> {
	await tx("readwrite", (s) => s.delete(id));
}

export async function listCategories(): Promise<string[]> {
	const all = await listPinnedReports();
	return [...new Set(all.map((r) => r.category).filter(Boolean))];
}

export function generateId(): string {
	return `pin_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
