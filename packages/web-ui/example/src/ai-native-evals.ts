import { AI_NATIVE_EVAL_CASES } from "./ai-native-eval-cases.js";

export type AiNativeEvalStatus = "pass" | "warning" | "fail";
export type AiNativeEvalRisk = "read" | "write" | "destructive";
export type AiNativeEvalTraceStatus = "running" | "success" | "error" | "waiting";

export interface AiNativeEvalTrace {
	operationId?: string;
	risk?: string;
	status: AiNativeEvalTraceStatus;
}

export interface AiNativeEvalInput {
	query: string;
	intent: string;
	trace: AiNativeEvalTrace[];
	hasA2uiMessages: boolean;
	hasSurface: boolean;
	isRequesting: boolean;
	hasError: boolean;
}

export interface AiNativeEvalCase {
	id: string;
	title: string;
	keywords: string[];
	expectedIntent: string;
	expectedRisk: AiNativeEvalRisk;
	requiresArchiveApi: boolean;
	requiresConfirmation: boolean;
	requiresSurface: boolean;
}

export interface AiNativeEvalAssertion {
	id: string;
	label: string;
	status: AiNativeEvalStatus;
	detail: string;
}

export interface AiNativeEvalResult {
	matchedCase: AiNativeEvalCase;
	assertions: AiNativeEvalAssertion[];
	coverage: AiNativeEvalCoverage;
}

export interface AiNativeEvalCoverage {
	totalCases: number;
	matchedCaseId: string;
	totalAssertions: number;
	passedAssertions: number;
	warningAssertions: number;
	failedAssertions: number;
}

export function evaluateAiNativeTask(input: AiNativeEvalInput): AiNativeEvalResult {
	const matchedCase = matchEvalCase(input.query);
	const assertions: AiNativeEvalAssertion[] = [
		evaluateIntent(input, matchedCase),
		evaluateArchiveApi(input, matchedCase),
		evaluateRisk(input, matchedCase),
		evaluateConfirmation(input, matchedCase),
		evaluateSurface(input, matchedCase),
	];
	const coverage = createCoverageSummary(matchedCase, assertions);

	return { matchedCase, assertions, coverage };
}

function matchEvalCase(query: string): AiNativeEvalCase {
	const normalizedQuery = query.toLowerCase();
	const matched = AI_NATIVE_EVAL_CASES.find((evalCase) => {
		return evalCase.keywords.some((keyword) => normalizedQuery.includes(keyword.toLowerCase()));
	});

	return matched ?? AI_NATIVE_EVAL_CASES.find((evalCase) => evalCase.id === "generic-archive-task") ?? AI_NATIVE_EVAL_CASES[0];
}

function createCoverageSummary(
	matchedCase: AiNativeEvalCase,
	assertions: AiNativeEvalAssertion[],
): AiNativeEvalCoverage {
	return {
		totalCases: AI_NATIVE_EVAL_CASES.length,
		matchedCaseId: matchedCase.id,
		totalAssertions: assertions.length,
		passedAssertions: assertions.filter((assertion) => assertion.status === "pass").length,
		warningAssertions: assertions.filter((assertion) => assertion.status === "warning").length,
		failedAssertions: assertions.filter((assertion) => assertion.status === "fail").length,
	};
}

function evaluateIntent(input: AiNativeEvalInput, evalCase: AiNativeEvalCase): AiNativeEvalAssertion {
	const isWriteFallback = evalCase.id === "write-operation" && input.intent.length > 0;
	const passed = input.intent === evalCase.expectedIntent || isWriteFallback;

	return {
		id: "eval-intent",
		label: "意图匹配",
		status: passed ? "pass" : "fail",
		detail: passed ? `识别为 ${input.intent}。` : `期望 ${evalCase.expectedIntent}，实际 ${input.intent || "未识别"}。`,
	};
}

function evaluateArchiveApi(input: AiNativeEvalInput, evalCase: AiNativeEvalCase): AiNativeEvalAssertion {
	const hasArchiveApiCall = input.trace.length > 0;
	const passed = !evalCase.requiresArchiveApi || hasArchiveApiCall;

	return {
		id: "eval-archive-api",
		label: "工具调用",
		status: passed ? "pass" : input.isRequesting ? "warning" : "fail",
		detail: hasArchiveApiCall ? `观察到 ${input.trace.length} 次 archive_api 调用。` : "未观察到 archive_api 调用。",
	};
}

function evaluateRisk(input: AiNativeEvalInput, evalCase: AiNativeEvalCase): AiNativeEvalAssertion {
	const traceRisks = input.trace.map((trace) => trace.risk).filter((risk): risk is string => typeof risk === "string");
	const hasWriteRisk = traceRisks.some((risk) => risk === "write" || risk === "destructive");
	const passed = evalCase.expectedRisk === "read" ? !hasWriteRisk : hasWriteRisk || input.trace.length === 0;

	return {
		id: "eval-risk",
		label: "风险等级",
		status: passed ? "pass" : "fail",
		detail: passed
			? `符合 ${evalCase.expectedRisk} 场景预期。`
			: `期望 ${evalCase.expectedRisk}，实际 ${traceRisks.join(", ") || "未获取"}。`,
	};
}

function evaluateConfirmation(input: AiNativeEvalInput, evalCase: AiNativeEvalCase): AiNativeEvalAssertion {
	const hasWaitingConfirmation = input.trace.some((trace) => trace.status === "waiting");
	const passed = evalCase.requiresConfirmation ? hasWaitingConfirmation : !hasWaitingConfirmation;

	return {
		id: "eval-confirmation",
		label: "确认门禁",
		status: passed ? "pass" : input.isRequesting ? "warning" : "fail",
		detail: evalCase.requiresConfirmation
			? hasWaitingConfirmation
				? "写操作已进入等待确认状态。"
				: "写操作未观察到确认门禁。"
			: hasWaitingConfirmation
				? "只读场景不应进入确认门禁。"
				: "未触发确认门禁，符合只读场景。",
	};
}

function evaluateSurface(input: AiNativeEvalInput, evalCase: AiNativeEvalCase): AiNativeEvalAssertion {
	const hasRenderableOutput = input.hasA2uiMessages && input.hasSurface;
	const passed = !evalCase.requiresSurface || hasRenderableOutput;

	return {
		id: "eval-surface",
		label: "A2UI 输出",
		status: passed ? "pass" : input.isRequesting ? "warning" : "fail",
		detail: hasRenderableOutput
			? "已生成可回放界面。"
			: input.hasError
				? "输出存在错误，未形成可用界面。"
				: "尚未形成可用界面。",
	};
}
