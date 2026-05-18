# 设计 00：Ontology Runtime

## 设计目标

Ontology Runtime 是系统的语义控制层。它不直接保存业务数据，而是描述业务数据如何被理解、关联、操作、审计和解释。

## 核心数据结构

```ts
interface OntologyManifest {
  objectTypes: Record<string, ObjectTypeDefinition>;
  linkTypes: Record<string, LinkTypeDefinition>;
  actionTypes: Record<string, ActionTypeDefinition>;
  functions: Record<string, FunctionDefinition>;
  interfaces: Record<string, InterfaceDefinition>;
  lifecycle: LifecycleGraph;
  policies: Record<string, ActionPolicy>;
}
```

```ts
interface ActionPolicy {
  actionType: string;
  operationId?: string;
  requiredRole: string;
  requiredProjectRole?: string;
  inputSchemaRef?: string;
  confirmationLevel: "none" | "low" | "medium" | "high";
  sideEffects: string[];
  auditRequired: boolean;
  evidenceRequired: boolean;
}
```

```ts
interface EvidenceRef {
  id: string;
  sourceType: "api" | "file_text" | "ocr" | "ontology_rule" | "history" | "user_confirmation" | "ai_inference";
  objectType?: string;
  objectId?: string | number;
  field?: string;
  excerpt?: string;
  confidence?: number;
  createdAt: string;
}
```

## Runtime 服务

- `getObjectDefinition(type)`：返回对象属性、接口、业务域。
- `getLinksForObject(type)`：返回对象可遍历关系。
- `getActionPolicy(actionType)`：返回动作权限、确认等级和副作用。
- `bindOperation(actionType)`：返回对应 OpenAPI operationId。
- `inferLifecycleStage(context)`：基于项目状态、档案状态、审核、签章、预检推断阶段。
- `filterActionsByPermission(userContext, actions)`：过滤不可执行动作。
- `requireEvidence(agentOutput)`：校验 AI 输出是否附带证据。

## 与 Agent 的关系

Agent 不直接“知道所有业务规则”。Agent 每次运行时从 Ontology Runtime 获取：

- 当前页面对象范围。
- 可查询对象。
- 可提议 Action。
- 必须解释的证据类型。
- 不可执行或高风险动作约束。

## 与 UI 的关系

UI 通过 Runtime 获得：

- 对象中文标签。
- 状态标签。
- 动作按钮是否可见。
- Action Proposal 展示字段。
- 证据面板内容结构。

## 错误处理

- 未知 Action Type：禁止执行，提示 ontology 缺失。
- Action Type 无 operationId：只能生成草案，不能执行。
- 权限不足：返回所需角色和当前角色。
- 证据不足：允许生成建议，但不能生成可执行 Action Proposal。

## 验收用例

1. 输入 `runPrecheck`，输出 requiredRole=`data_admin`、confirmationLevel 至少为 medium。
2. 输入 `archiveProject`，输出高风险确认，并列出锁定项目、禁止编制上传等副作用。
3. 输入 `UploadFile`，能找到与 Project、Unit、UploadFileVersion、User 的 Link Types。
4. Agent 输出“建议归档”但无预检证据时，Runtime 拒绝生成执行型 Action Proposal。
