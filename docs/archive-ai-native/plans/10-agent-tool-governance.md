# 子计划 10：AI Agent 与工具治理

## 目标

把 AI 做成生产级业务协作者，而不是自由聊天助手。Agent 以生命周期职责划分，以工具白名单和 ActionPolicy 约束行为。

## 范围

- Agent Router。
- Agent Profile。
- 工具白名单。
- ArchiveWorkContext。
- Action Proposal。
- EvidenceRef。
- AgentRunRecord。
- 用户确认。
- 高风险动作二次确认。

## Agent Profile

- 项目总控 Agent。
- 目录模板 Agent。
- 文件著录 Agent。
- 编制 Agent。
- 审核 Agent。
- 签章 Agent。
- 归档 Agent。
- 治理 Agent。

## 工具

- `archive_context`。
- `archive_query`。
- `archive_action_propose`。
- `archive_action_execute`。
- `archive_file_intake`。
- `archive_compliance_check`。
- `archive_artifact`。

## 关键能力

- 根据当前页面和用户意图路由到 Agent Profile。
- Agent 只能访问自己的 ontology scope。
- Agent 只能调用工具白名单内工具。
- 写操作必须先生成 Action Proposal。
- 高风险动作必须二次确认。
- 所有 AI 建议必须绑定 EvidenceRef。
- 所有工具调用必须进入 AgentRunRecord。

## 独立验证

- 文件中台问题路由到文件著录 Agent。
- 审核页问题路由到审核 Agent。
- 归档页问题路由到归档 Agent。
- 没有 EvidenceRef 的归档建议不能执行。
- 当前用户无权限时，Agent 只能解释和建议申请权限，不能执行。

## 不包含

- 不定义每个业务 API 的具体实现。
- 不替代业务 UI。
