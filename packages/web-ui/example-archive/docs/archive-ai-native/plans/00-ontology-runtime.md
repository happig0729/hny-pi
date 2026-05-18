# 子计划 00：Ontology Runtime 与语义内核

## 目标

把 `ontology/*.md` 从静态说明文档升级为系统运行时语义内核，使前端、后端、Agent 和审计系统共享同一套业务语义。

## 范围

- Object Types：业务对象定义。
- Link Types：业务语义关系。
- Action Types：受治理写操作。
- Functions：计算、聚合、分类、预检、流程推进函数。
- Interfaces：跨对象能力抽象。
- Security & Governance：权限、隔离、审计、响应信封。

## 交付物

- `OntologyManifest`：五要素统一索引。
- `ActionPolicy`：动作权限、输入、确认等级、副作用、审计要求。
- `LifecycleGraph`：项目生命周期阶段与状态迁移。
- `OperationBinding`：Action Type 与 OpenAPI operationId 的绑定。
- `EvidenceRef` 标准：AI 或系统判断的证据引用。
- `AuditEnvelope` 标准：所有动作执行和 AI 建议的审计外壳。

## 关键能力

- 根据对象类型找到所属业务域、接口、状态字段、项目归属、租户归属。
- 根据用户角色和项目角色判断可见对象和可提议动作。
- 根据 Action Type 找到 operationId、权限、输入要求和副作用。
- 根据生命周期阶段判断下一步可执行动作。
- 根据 AI 输出绑定 EvidenceRef，避免不可解释建议。

## 独立验证

- 给定 `createProject`，能解析出 Action Type、operationId、触发者、输入、副作用。
- 给定 `UploadFile`，能识别它实现 `BelongsToProject`、`Archivable`、`HasStatus`、`HasAudit`。
- 给定项目状态和预检结果，能推断项目处于哪个 LifecycleStage。
- 给定低权限用户，能过滤不可执行动作。

## 不包含

- 不实现具体业务 UI。
- 不实现文件解析、审核、签章、归档业务逻辑。
- 不替代 OpenAPI；OpenAPI 仍是执行端点权威。
