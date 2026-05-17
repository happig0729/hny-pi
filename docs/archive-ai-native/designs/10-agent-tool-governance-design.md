# 设计 10：Agent 工具治理

## Agent 不是独立聊天窗口

Agent 是业务职责边界：

- 不一定是多个模型实例。
- 可以是一个 Agent Router + 多个 Agent Profile。
- 用户看到的是页面内智能工作层，而不是 8 个聊天机器人。

## Agent Profile 结构

```ts
interface AgentProfile {
  id: string;
  displayName: string;
  lifecycleStages: string[];
  ontologyScope: {
    objectTypes: string[];
    linkTypes: string[];
    actionTypes: string[];
    functions: string[];
    interfaces: string[];
  };
  toolWhitelist: string[];
  outputContract: AgentOutputContract;
}
```

## 路由规则

Agent Router 根据以下信号选择 Profile：

- 当前页面。
- 当前选中对象。
- 用户意图。
- LifecycleStage。
- 请求是否涉及权限、审计或高风险动作。

示例：

- 文件中台上传 PDF -> 文件著录 Agent。
- 审核页询问“能过吗” -> 审核 Agent。
- 项目驾驶舱询问“为什么不能归档” -> 项目总控 Agent + 归档 Agent。
- 用户询问“为什么我不能删除” -> 治理 Agent。

## 工具契约

### archive_context

返回当前用户、租户、项目、页面、选中对象和可执行动作。

### archive_query

受权限控制的只读查询。必须自动注入 tenantId 和 projectId。

### archive_action_propose

生成 Action Proposal，不执行写操作。

### archive_action_execute

只执行已确认 Action Proposal。

### archive_file_intake

处理文件解析、分类、著录建议。

### archive_compliance_check

执行完整性、格式、内容、映射和状态检查。

### archive_artifact

生成整改清单、审核意见、归档报告、操作说明等 artifact。

## Action Proposal

必须包含：

- actionType。
- operationId。
- requiredRole。
- confirmationLevel。
- input summary。
- affectedObjects。
- sideEffects。
- evidenceRefs。
- rollbackOrCorrection。

## 输出契约

Agent 输出必须区分：

- 事实：来自 API、对象或文件。
- 推断：来自 AI。
- 建议：可供用户采纳。
- 动作：需要确认后执行。
- 证据：EvidenceRef。

## 安全规则

- JWT、API Key、密码、密钥不得进入模型上下文。
- Agent 不能构造任意 fetch 调用绕过工具。
- 未确认 Action Proposal 不能执行。
- 高风险动作必须二次确认。
- 删除、归档、解锁、签章、批量提交均为高风险或中高风险动作。

## 验收用例

1. Agent 建议批量著录 12 个文件，生成 Action Proposal，但不执行。
2. 用户确认只执行高置信度项，execute 工具只处理过滤后的对象。
3. Agent 试图归档项目，但预检有阻断项，Action Proposal 不可执行。
4. 治理 Agent 查询某次 AI 建议，能显示模型、工具、证据、用户确认和执行结果。
