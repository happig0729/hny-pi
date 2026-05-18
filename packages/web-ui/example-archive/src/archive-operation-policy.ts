export type ReadOnlyOperationId =
	| "healthCheck"
	| "listProjects"
	| "getProject"
	| "getProjectStats"
	| "listUnits"
	| "getUnit"
	| "listDocuments"
	| "getDocument"
	| "listUploadFiles"
	| "listCompilationInstances"
	| "listReviews"
	| "listReviewHistory"
	| "listSigningTasks"
	| "getSigningTask"
	| "getLatestPrecheck"
	| "listArchivePackages"
	| "listCollectionItems";

// Agent read access is intentionally narrower than all OpenAPI GET operations.
// Add an operation here only after it is safe to expose in archive_api_read.
export const readOnlyOperationIds: ReadonlySet<ReadOnlyOperationId> = new Set<ReadOnlyOperationId>([
	"healthCheck",
	"listProjects",
	"getProject",
	"getProjectStats",
	"listUnits",
	"getUnit",
	"listDocuments",
	"getDocument",
	"listUploadFiles",
	"listCompilationInstances",
	"listReviews",
	"listReviewHistory",
	"listSigningTasks",
	"getSigningTask",
	"getLatestPrecheck",
	"listArchivePackages",
	"listCollectionItems",
]);

export function isReadOnlyOperationId(operationId: string): operationId is ReadOnlyOperationId {
	return readOnlyOperationIds.has(operationId as ReadOnlyOperationId);
}
