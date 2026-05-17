# AI Native 工程档案全生命周期管理系统子计划拆解

## 总体原则

系统不是 demo，也不是“聊天框 + 后台”。它是完整生产系统：结构化业务系统保证确定性、批量性、审计性；AI Native 能力进入业务主路径，负责理解、编排、推荐、预检、解释和受控执行。

所有子计划共同遵守：

- Ontology 是业务语义权威。
- OpenAPI / operationId 是执行权威。
- Action Type 是所有写操作唯一入口。
- AI 不能绕过权限、确认、审计。
- 传统 UI 元素保留在表格、树、表单、审批、预览、批处理、对账等确定性场景。

## 子计划 0：Ontology Runtime 与系统语义内核

目标：把 `ontology/*.md` 从文档变成系统运行时能力。

交付：

- `OntologyManifest`：Object / Link / Action / Function / Interface 统一索引。
- `ActionPolicy`：动作权限、输入、确认等级、副作用、审计要求。
- `LifecycleGraph`：项目从立项到采集归档的状态流。
- `operationId -> ActionType -> 权限 -> 副作用` 映射。
- `EvidenceRef` 标准：API 数据、文件片段、OCR、规则、历史记录、用户确认。

验收：

- 任意写操作都能定位到 Action Type 和 operationId。
- 任意业务对象都能找到所属生命周期、关系、权限和审计规则。

## 子计划 1：产品信息架构与核心工作台

目标：定义完整系统形态，不以聊天页作为主界面。

模块：

- 全局工作台：租户、项目、待办、风险、统计、异常。
- 项目驾驶舱：项目生命周期、单体、目录、文件、审核、签章、归档状态。
- 档案目录树：CatalogTemplateNode / CityArchiveCatalogNode / 文件挂接。
- 文件中台：上传、解析、预览、版本、批量著录、退回、采集。
- 编制工作台：模板表单、自动填充、历史建议、AI 推断。
- 审核工作台：审核队列、预览、问题、意见、整改闭环。
- 签章工作台：签章任务、节点、印章、个人待签。
- 归档工作台：完整性、预检、归档包、采集追踪。
- AI 任务栏：贯穿所有模块，基于当前上下文工作。

验收：

- 不用 AI 也能完成关键业务。
- 使用 AI 时能减少录入、判断、检查和跨模块操作成本。

## 子计划 2：租户、组织、用户与权限闭环

目标：保证多租户、项目隔离和工程档案责任边界。

范围：

- Tenant、Department、Enterprise、User、ProjectMember、Role。
- JWT + API Key 双通道认证。
- super_admin / tenant_admin / system_admin / tenant_user。
- project_admin / data_admin / data_clerk。
- ProjectRoleGuard、RolesGuard、AuthGuard 行为固化。
- OperationLog 覆盖所有 POST / PUT / PATCH / DELETE。

AI 要求：

- Agent 只读取当前用户可见对象。
- Agent 只提议当前用户有权执行的动作。
- 权限拒绝必须可解释。

验收：

- 跨租户数据不可见。
- 非项目成员不可访问项目档案。
- data_clerk 不能执行归档审批、删除、管理员动作。

## 子计划 3：项目立项、单体工程与项目基线

目标：完成项目从创建到可生产档案的初始化闭环。

范围：

- Project / ProjectExtension。
- Unit / UnitExtension。
- ProjectMember 初始化。
- 参建企业绑定。
- 项目接入码和邀请机制。
- 项目生命周期基线生成。

AI 能力：

- 从自然语言提取项目信息。
- 建议单体工程结构、参建单位、成员角色。
- 发现立项缺失字段。
- 生成项目初始化 Action Proposal。

验收：

- 一个项目创建后能立即进入目录初始化和档案生产。
- 项目归档锁定后，受影响单体和档案操作被正确阻断。

## 子计划 4：模板、目录与城建档案馆映射

目标：建立档案生产的目录和标准体系。

范围：

- Template、TemplateExample、TemplateInstruction、TemplateAutofillConfig。
- CatalogTemplate、CatalogTemplateNode。
- CityArchiveCatalogNode、CityArchiveMapping。
- EnterpriseTemplate、EnterpriseParadigm。
- 标准模板启用、停用、租户同步。

AI 能力：

- 推荐项目目录模板。
- 解释目录节点和模板字段。
- 建议城建档案馆目录映射。
- 识别目录缺项和映射冲突。

验收：

- 每个项目都有可执行的档案目录树。
- 项目目录能映射到城建档案馆标准。
- 映射不完整时，归档预检能明确指出问题。

## 子计划 5：文件上传、解析、分类与著录

目标：打通外部文件进入档案系统的完整链路。

范围：

- UploadFile / UploadFileVersion。
- 文件上传、替换、重命名、删除。
- PDF / DOCX / 图片 / 文本解析。
- OCR / 文本提取 / 元数据提取。
- AI 分类、文件名规则回退、未分类兜底。
- 批量著录、人工复核、退回。

AI 能力：

- 推荐题名、目录节点、文件类型、责任者、编制日期、页数、载体、备注。
- 给出字段级置信度和证据。
- 低置信度自动进入人工复核队列。
- 批量处理前生成差异清单。

验收：

- 上传文件能形成版本链。
- 文件能从未分类进入已著录状态。
- 低置信度建议不会自动写入。

## 子计划 6：档案编制与智能表单填充

目标：支持在线编制、模板填报和表单数据闭环。

范围：

- CompilationInstance。
- CompilationFormData。
- Document。
- 表单模板绑定目录节点。
- 编制状态：drafting / completed / signing / signed / collected。
- 编制完成生成正式档案对象。

AI 能力：

- 自动填充策略：项目默认值、历史记录、AI 推断、人工确认。
- 字段级来源和置信度。
- 解释字段含义和填写规范。
- 从类似项目复用填写经验。

验收：

- 表单字段有来源记录。
- 用户覆盖 AI 建议后，以人工值为准。
- 编制结果能进入审核、签章或归档链路。

## 子计划 7：审核、整改与质量控制

目标：形成审核通过、退回、整改、复审的闭环。

范围：

- Review。
- Document / UploadFile 提交审核。
- 审核通过、退回、意见记录。
- 整改任务与重新提交。
- 审核历史追踪。

AI 能力：

- ReviewHintGenerator 风险提示。
- 检查必填、格式、日期、签章、目录映射、退回历史。
- 生成审核意见草稿。
- 给出修复建议和相关对象。

验收：

- AI 不能自动批准或退回。
- 每次退回都有原因、责任对象、整改路径。
- 重新提交保留历史链路。

## 子计划 8：签章流转与印章治理

目标：完成电子签章从发起到完成或拒签的闭环。

范围：

- Seal。
- SigningTask。
- SigningNode。
- sequential / parallel 流程。
- 个人待签聚合。
- 拒签和重新发起。

AI 能力：

- 推荐签章参与人、节点顺序、流程模式。
- 检查印章有效性、权限、节点冲突。
- 解释签章阻塞原因。
- 拒签后建议重新发起方案。

验收：

- 顺序签章按 currentNodeIdx 推进。
- 并行签章等待全部节点完成。
- 拒签进入可追踪整改或重发闭环。

## 子计划 9：合规预检、归档包与采集

目标：完成工程档案生命周期最终闭环。

范围：

- CompliancePrecheck。
- checkProjectArchiveCompleteness。
- validateCityArchiveMapping。
- ArchivePackage。
- CollectedItem。
- 项目 / 单体归档锁定与解锁。
- 采集类型：自然采集、承诺移交、自然缺失、共享文件。

AI 能力：

- 解释缺项、格式问题、内容风险、映射问题。
- 生成整改清单。
- 判断哪些问题阻断归档，哪些可豁免。
- 推荐归档包范围和阶段。
- 解释采集状态和重复采集风险。

验收：

- 归档包生成前必须完成预检或记录豁免。
- 归档失败能明确指出对象、规则和修复路径。
- 采集记录能防止重复采集。

## 子计划 10：AI Agent 与工具治理

目标：把 AI 做成生产级业务协作者，而不是自由聊天助手。

Agent：

- 项目总控 Agent。
- 目录模板 Agent。
- 文件著录 Agent。
- 编制 Agent。
- 审核 Agent。
- 签章 Agent。
- 归档 Agent。
- 治理 Agent。

工具：

- `archive_context`：读取当前业务上下文。
- `archive_query`：受权限约束的只读查询。
- `archive_action_propose`：生成受控动作草案。
- `archive_action_execute`：用户确认后执行。
- `archive_file_intake`：文件解析和著录建议。
- `archive_compliance_check`：合规预检。
- `archive_artifact`：生成清单、报告、整改说明。

治理规则：

- 只读查询可自动执行。
- 写操作必须生成 Action Proposal。
- 高风险动作必须二次确认。
- API Key、JWT、密钥不得进入模型上下文。
- 所有 Agent 调用进入 AgentRunRecord。

验收：

- AI 每个建议都有证据。
- AI 每个写操作都有用户确认和审计。
- Agent 失败时能给出恢复路径。

## 子计划 11：统计、监控与运营分析

目标：让管理者掌握进度、质量、风险和效率。

范围：

- DashboardStats。
- MonthlyTrends。
- ProjectStats。
- TenantStats。
- SealStats。
- StorageStats。
- 逾期、缺项、退回率、签章耗时、归档完成率。

AI 能力：

- 生成运营摘要。
- 找出异常项目。
- 解释趋势变化。
- 推荐优先处理事项。

验收：

- 结构化图表是事实层。
- AI 摘要是解释层。
- 所有指标能追溯到原始对象。

## 子计划 12：审计、可解释性与合规证据链

目标：满足工程档案系统的追责和法律证据要求。

范围：

- OperationLog。
- AgentRunRecord。
- EvidenceRef。
- ActionExecutionResult。
- 文件版本链。
- 审核链。
- 签章链。
- 归档包生成链。
- 采集记录链。

验收：

- 任意档案对象能追溯来源、版本、责任人、审核、签章、归档状态。
- 任意 AI 辅助结果能追溯模型、输入证据、工具调用和用户确认。
- 任意状态变化能追溯 Action Type、operationId、用户和时间。

## 子计划 13：测试与验收体系

目标：证明系统不是局部功能拼接，而是生命周期闭环。

测试集：

- 立项到归档采集端到端测试。
- 租户隔离和项目隔离测试。
- 文件解析和版本替换测试。
- AI 分类高低置信度测试。
- 编制表单填充测试。
- 审核退回整改复审测试。
- 顺序 / 并行签章测试。
- 预检失败、豁免、通过测试。
- 归档包生成和采集去重测试。
- Agent 权限、确认、审计测试。

最终验收：

- 一个真实工程项目能完整跑通：立项、目录、文件、编制、著录、审核、签章、预检、打包、采集。
- 每个核心模块既有结构化 UI，也有 AI 辅助入口。
- 不使用 AI 时业务可完成；使用 AI 时效率和质量提升。
- 所有写操作可审计、可解释、可追责。

## 推荐实施顺序

1. 子计划 0：Ontology Runtime。
2. 子计划 2：租户、用户、权限。
3. 子计划 1：产品信息架构。
4. 子计划 3：项目立项。
5. 子计划 4：模板目录。
6. 子计划 5：文件中台。
7. 子计划 6：编制。
8. 子计划 7：审核。
9. 子计划 8：签章。
10. 子计划 9：归档采集。
11. 子计划 10：AI Agent 工具治理。
12. 子计划 11：统计运营。
13. 子计划 12：审计证据链。
14. 子计划 13：全链路验收。

其中子计划 10 不应最后才做；它的工具治理框架应在子计划 0 后并行启动，具体 Agent 能力随业务模块逐步接入。
