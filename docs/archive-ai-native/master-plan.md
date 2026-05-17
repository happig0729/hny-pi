# 总体计划：AI Native 工程档案全生命周期管理系统

## 目标

建设一个生产级工程档案全生命周期管理系统。系统以 Ontology 为业务语义内核，以结构化工作台承载确定性业务流程，以 AI Agent 承担理解、编排、推荐、检查、解释和受控执行。

本系统不是 demo，也不是纯聊天应用。它必须满足工程档案系统的核心要求：

- 证据链完整。
- 责任链清晰。
- 版本链可追溯。
- 审核链闭环。
- 签章链有效。
- 归档链合规。
- 权限、审计、租户隔离和项目隔离严格。

## 第一性原则

工程档案系统的核心对象不是页面，而是被治理的业务事实：

- 项目事实：Project、Unit、Enterprise、ProjectMember。
- 目录事实：CatalogTemplate、CatalogTemplateNode、CityArchiveCatalogNode、CityArchiveMapping。
- 档案事实：CompilationInstance、Document、UploadFile、UploadFileVersion。
- 质量事实：Review、ReviewHint、CompliancePrecheck。
- 法律事实：SigningTask、SigningNode、Seal。
- 交付事实：ArchivePackage、CollectedItem。
- 治理事实：Tenant、User、Role、OperationLog、AgentRunRecord、EvidenceRef。

AI 的价值不是替代这些事实，而是围绕这些事实降低理解、录入、检查、协调和复核成本。

## 产品形态

系统采用三层产品形态：

1. 结构化业务工作台  
   包含全局工作台、项目驾驶舱、目录树、文件中台、编制工作台、审核工作台、签章工作台、归档工作台、权限审计工作台。

2. AI 工作层  
   包含右侧常驻 Agent 面板、页面内建议、字段级建议、证据面板、Action Proposal 卡片、批量处理建议。

3. Ontology 执行层  
   包含 Object / Link / Action / Function / Interface、ActionPolicy、LifecycleGraph、EvidenceRef、AuditEnvelope。

## 子计划分解

系统拆为 12 个可独立交付的子计划：

1. Ontology Runtime 与语义内核。
2. 产品壳与工作台信息架构。
3. 租户、组织、用户与权限治理。
4. 项目立项、单体工程与项目基线。
5. 模板、目录与城建标准映射。
6. 文件上传、解析、分类与著录。
7. 档案编制与智能表单填充。
8. 审核、整改与质量控制。
9. 签章流转与印章治理。
10. 合规预检、归档包与采集闭环。
11. AI Agent 与工具治理。
12. 统计、监控与运营分析。

每个子计划都有对应设计文档，且具备独立验收标准。

## 实施顺序

推荐顺序：

1. 先建 Ontology Runtime、ActionPolicy、EvidenceRef。
2. 同步建立产品壳和 Agent 工作层框架。
3. 先打通身份权限、项目基线、模板目录。
4. 再打通文件著录、编制、审核、签章。
5. 最后打通预检、归档包、采集和统计。

AI Agent 工具治理不应最后才做。它应在 Ontology Runtime 后启动，后续每个业务模块只接入自己的 Agent Profile 和工具白名单。

## 总体完成定义

系统完成时，必须能完成以下端到端场景：

- 项目管理员创建项目，初始化单体和项目成员。
- 目录管理员选择目录模板并完成城建标准映射。
- 资料员上传一批文件，系统完成解析、分类、著录建议和人工复核。
- 资料员基于模板创建编制实例，使用 AI 自动填充字段并人工确认。
- 审核人查看 AI 风险提示，完成退回、整改和复审。
- 签章人完成顺序或并行签章任务。
- 归档管理员运行预检，处理阻断项，生成归档包。
- 采集员登记采集项，系统防止重复采集。
- 治理人员能追溯任意对象、任意状态变化和任意 AI 建议。
