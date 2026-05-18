# AI Native 工程档案全生命周期管理系统文档索引

本文档集用于把总体规划拆解为可独立评审、可独立实现、可独立验证的子计划与子设计。原型参考：

- `prototypes/archive-ai-native/index.html`

## 文档组织

每个子计划都有一个同编号子设计文档：

| 编号 | 子计划 | 子设计 | 独立验收对象 |
|------|--------|--------|--------------|
| 00 | [Ontology Runtime 与语义内核](plans/00-ontology-runtime.md) | [Ontology Runtime 设计](designs/00-ontology-runtime-design.md) | Ontology manifest、ActionPolicy、生命周期图 |
| 01 | [产品壳与工作台信息架构](plans/01-product-workspaces.md) | [产品工作台设计](designs/01-product-workspaces-design.md) | 全局工作台、项目驾驶舱、右侧 Agent 工作层 |
| 02 | [租户、组织、用户与权限治理](plans/02-identity-governance.md) | [身份权限设计](designs/02-identity-governance-design.md) | 租户隔离、项目隔离、角色动作边界、审计 |
| 03 | [项目立项、单体工程与项目基线](plans/03-project-baseline.md) | [项目基线设计](designs/03-project-baseline-design.md) | 项目从创建到可生产档案的初始化闭环 |
| 04 | [模板、目录与城建标准映射](plans/04-template-catalog.md) | [模板目录设计](designs/04-template-catalog-design.md) | 项目目录树、模板绑定、城建目录映射 |
| 05 | [文件上传、解析、分类与著录](plans/05-file-intake-cataloguing.md) | [文件著录设计](designs/05-file-intake-cataloguing-design.md) | 文件进入系统、版本链、AI 分类、批量著录 |
| 06 | [档案编制与智能表单填充](plans/06-compilation-form-fill.md) | [编制填报设计](designs/06-compilation-form-fill-design.md) | 编制实例、字段来源、表单填充、文档生成 |
| 07 | [审核、整改与质量控制](plans/07-review-rectification.md) | [审核整改设计](designs/07-review-rectification-design.md) | 审核通过、退回、整改、复审闭环 |
| 08 | [签章流转与印章治理](plans/08-signing-seal-flow.md) | [签章流转设计](designs/08-signing-seal-flow-design.md) | 顺序/并行签章、待签聚合、拒签处理 |
| 09 | [合规预检、归档包与采集闭环](plans/09-archive-collection.md) | [归档采集设计](designs/09-archive-collection-design.md) | 预检、阻断、归档包、采集去重、锁定 |
| 10 | [AI Agent 与工具治理](plans/10-agent-tool-governance.md) | [Agent 工具治理设计](designs/10-agent-tool-governance-design.md) | Agent Profile、工具白名单、Action Proposal、证据链 |
| 11 | [统计、监控与运营分析](plans/11-analytics-observability.md) | [统计运营设计](designs/11-analytics-observability-design.md) | Dashboard、趋势、风险项目、运营摘要 |

## 总体验收

完整系统必须能跑通一个真实工程项目：

1. 创建租户、用户、项目和项目成员。
2. 初始化单体工程、目录模板和城建目录映射。
3. 上传并解析文件，完成 AI 分类、人工复核和著录。
4. 基于模板完成在线编制和表单填报。
5. 提交审核、退回整改、复审通过。
6. 发起顺序或并行签章，完成签章流转。
7. 运行合规预检，处理缺项、格式、内容、映射问题。
8. 生成归档包，完成采集记录和归档锁定。
9. 全链路可追溯：对象、版本、审核、签章、归档、AI 证据、用户确认、Action Type、operationId。

## AI Native 边界

AI Native 不等于移除传统 UI。系统采用“结构化业务系统 + AI 作业编排层”：

- 结构化 UI 承载确定性、批量性、可核验性、审批和审计。
- AI 承担理解、推荐、预检、解释、编排和受控执行。
- 所有写操作必须通过 Action Type 和用户确认。
- 所有 AI 建议必须能展开证据。
