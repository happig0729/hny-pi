---
title: "跨域服务 — Object Types"
modelVersion: "2.0"
created: 2026-05-17
tags:
  - ontology
  - object-types
  - cross-domain-services
  - archive-manager
nav:
  parent: "[[index]]"
  domain: cross-domain-services
  prev: "[[08-invitation-system]]"
---

## 跨域服务域

覆盖跨业务域共享的服务模块：智能表单填充、文件解析、审核提示、AI 分类器、签章流转聚合、个人工作台聚合。

### FormFillService（智能表单填充服务）

三层填充策略：AI 推断 > 历史记录建议 > 项目默认值。

| 属性 | 类型 | 说明 |
|------|------|------|
| 合并策略 | enum: ai_inference / history_weighted / project_default | 优先级降级链 |
| AI 推断层 | 调用 AiConfig 配置的大模型 | 基于项目上下文 + 已填字段推断缺失值 |
| 历史建议层 | 查询 CompilationFormData | 同 projectId + nodeId，按 recency 加权排序 |
| 默认值层 | Project 类型默认值 + Template 字段默认值 | 基础回退 |

**对应 API 端点**：

| 端点 | 方法 | 说明 |
|------|------|------|
| `/form-fill/project/{projectId}/defaults` | GET | 获取项目级表单默认值 |
| `/form-fill/suggest` | POST | 基于文件内容和分类生成字段建议 |
| `/form-fill/history` | POST | 查询历史填写记录 |
| `/form-fill/infer` | POST | AI 推断缺失字段 |
| `/form-fill/batch` | POST | 批量填充多节点表单 |

### FileParserService（文件解析服务）

多格式文件解析器，上传后自动触发解析。

| 属性 | 类型 | 说明 |
|------|------|------|
| 支持格式 | PDF / Word (.docx) / Image / Text | 按 MIME 类型自动选择解析器 |
| PDF 解析 | pdf-parse | 提取文本 + 页数 + 元数据 |
| Word 解析 | mammoth | 提取文本 + 段落结构 |
| 图片解析 | sharp | 读取元数据（尺寸、格式），OCR 文本提取 |
| 文本解析 | 自动编码检测 | UTF-8 / GBK / GB2312 |
| 文件名规范化 | CJK 检测 + 乱码修复 | 百分号解码，处理上传文件名编码问题 |

**触发时机**：UploadFile 创建后自动异步调用，结果写入 `extractedText` 字段。

### ReviewHintGenerator（审核智能提示服务）

基于规则的审核提示生成器，不接受 AI 调用。

| 属性 | 类型 | 说明 |
|------|------|------|
| detectRisks | 规则检测 | 必填字段缺失、格式不符、签章位置异常、归档目录不匹配 |
| checkCompliance | 城建标准对照 | 对照 CityArchiveCatalogNode 检查文档合规性 |
| generateSuggestions | 合并排序 | 风险 + 合规结果 → 按严重程度排序的可操作提示 |

**对应 API 端点**：`POST /reviews/hints`

### AiClassifier（AI 文件分类器）

三层回退链：AI 分类 → 文件名关键词匹配 → "unclassified"。

| 属性 | 类型 | 说明 |
|------|------|------|
| AI 模型 | GLM（通过 AiConfig 代理） | 调用大模型识别文件类型 |
| 分类体系 | 青岛市城建档案分类（鲁JJ 编码） | 施工组织设计、竣工图、检验批等 |
| 文件名回退 | 关键词匹配 | AI 不可用或置信度过低时触发 |
| 最终回退 | "unclassified" | 所有策略失败时的保底分类 |
| 置信度阈值 | 可配置 | 低于阈值触发回退链下一级 |

**对应 API 端点**：

| 端点 | 方法 | 说明 |
|------|------|------|
| `/ai/classify` | POST | 单文件分类 |
| `/ai/classify/batch` | POST | 批量分类（最多 10 个） |
| `/ai/classify/file-types` | GET | 支持的文件类型目录 |
| `/ai/chat` | POST | AI 对话代理（SSE 流式） |
| `/ai/test` | POST | 连接测试 |

### SealFlowModule（签章流转聚合）

跨项目签章任务聚合视图，以用户为维度汇总待签任务。

| 属性 | 类型 | 说明 |
|------|------|------|
| 聚合维度 | 用户 | 跨所有项目的 SigningNode（assignee = 当前用户） |
| 关联对象 | SigningTask → CompilationInstance / UploadFile | 多态来源（sourceType + sourceId） |
| 流转模式 | parallel / sequential | 影响 SigningTask 状态自动推进逻辑 |
| 印章关联 | sealResourceId → Seal | 无 FK 约束，逻辑引用 |

业务语义：`seal_flow_aggregates_user_tasks`（User → SigningNode，用户维度的跨项目签章任务汇总）。

### MyDocumentModule（个人工作台聚合）

以当前用户为维度，跨项目聚合上传文件和编制实例。

| 属性 | 类型 | 说明 |
|------|------|------|
| 上传文件聚合 | User → UploadFile（uploadedBy） | 当前用户上传的所有文件 |
| 编制实例聚合 | User → CompilationInstance（createdBy） | 当前用户创建的所有编制实例 |
| 跨项目视图 | 不限制 projectId | 展示用户在所有项目中的工作 |

业务语义：
- `my_document_aggregates_uploads`（User → UploadFile）
- `my_document_aggregates_compilations`（User → CompilationInstance）
