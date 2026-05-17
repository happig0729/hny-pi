---
title: "Functions — Archive Manager Ontology"
modelVersion: "2.0"
created: 2026-05-16
updated: 2026-05-17
tags:
  - ontology
  - functions
  - archive-manager
source: "../../lib/api-spec/openapi.yaml"
---

## Functions（函数）

Functions 是运行在 Ontology 之上的服务端逻辑，它们可读取对象属性、遍历 Link、调用外部服务，并返回计算结果。Functions 通常被 Actions 或应用层调用。

本文件基于 `openapi.yaml` 中所有具备计算/聚合/代理语义的端点映射，按功能域组织。

### 档案完整性校验函数

```
checkProjectArchiveCompleteness(projectId) → { passed: boolean, missing: string[] }
```

遍历项目目录模板的全部 file 节点，检查每个节点是否已有对应 Document 或 UploadFile 完成著录。返回缺失项清单。

### 签章流程推进函数

```
advanceSigningFlow(taskId) → SigningTask
```

根据 flowMode（parallel/sequential）和当前节点完成状态，决定是否推进 currentNodeIdx。在 sequential 模式下逐个推进；在 parallel 模式下等待全部完成后统一推进。

### 存储配额计算函数

```
calculateTenantStorage(tenantId) → { used: bigint, limit: bigint, ratio: float }
```

遍历租户下所有 UploadFile、UploadFileVersion、ArchivePackage 计算已用空间，与 plan 配额对比。

### 项目数据统计函数

```
getProjectStats(projectId) → {
  documentCount, fileCount, reviewPending, signingPending,
  compilationInProgress, collectedCount, precheckStatus
}
```

聚合项目下所有档案相关对象的实时统计。对应 `GET /projects/{projectId}/stats`。

### 仪表盘聚合函数

```
getDashboardStats() → DashboardStats
```

跨项目聚合系统级别的统计指标，包括项目总数、档案数量、审核状态分布、签章进度等。对应 `GET /dashboard/stats`。

### 月度趋势函数

```
getMonthlyTrends() → MonthlyTrends
```

按月份聚合档案编制量、审核通过率、签章完成率等趋势数据。对应 `GET /dashboard/monthly-trends`。

### 印章统计函数

```
getSealStats() → SealStats
```

按类型、状态聚合平台印章统计数据。对应 `GET /seals/stats`。

### 租户统计函数

```
getTenantStats() → TenantStats
```

聚合平台级租户统计：总数、按 plan 分布、存储使用排行等。对应 `GET /tenants/stats`。

### AI 辅助著录函数

```
autoCatalogueFile(fileId) → { title, compiler, compileDate, nodeId, confidence }
```

调用用户配置的 AI 模型（通过 AiConfig），将 extractedText 作为输入，返回著录信息推荐。

### AI 文件分类函数

```
aiClassifyFile(fileId) → { fileType, recommendedNodeId, metadata, confidence }
```

调用 AI 服务识别文件类型，推荐归档目录节点，提取元数据。对应 `POST /ai/classify`。

### AI 批量文件分类函数

```
aiClassifyFilesBatch(fileIds[]) → Array<{ fileId, fileType, recommendedNodeId, metadata, confidence }>
```

批量调用 AI 分类，单次最多 10 个文件。对应 `POST /ai/classify/batch`。

### AI 文件类型目录函数

```
aiGetFileTypes() → FileType[]
```

返回 AI 分类支持的文件类型及其对应的归档目录节点映射。对应 `GET /ai/classify/file-types`。

### AI 对话代理函数

```
aiChat(messages[], options?) → SSE stream
```

代理大模型 API 请求，支持流式响应。可在编制/审核界面嵌入，为 AI Agent 提供交互能力。对应 `POST /ai/chat`。

### AI 连接测试函数

```
aiTestConnection(config?) → { success: boolean, latency: number, message: string }
```

测试大模型 API 配置是否正确，记录最后测试结果。对应 `POST /ai/test` 和 `POST /ai/config/test`。

### 智能表单填充函数（FormFiller）

三层填充策略：AI 推断 > 历史记录建议 > 项目默认值。

```
getFormFillDefaults(projectId, nodeId) → { defaults: Record<string, unknown> }
```

获取项目级别的表单默认值，基于项目类型和模板节点配置。对应 `GET /form-fill/defaults`。

```
getFormFillSuggestions(projectId, nodeId, partialData?) → { suggestions: FieldSuggestion[] }
```

基于已填写部分数据和历史记录生成字段建议。对应 `GET /form-fill/suggestions`。

```
getFormFillHistory(projectId, nodeId, limit?) → { records: HistoricalRecord[] }
```

获取同一项目下相同节点类型的历史填写记录，按时间倒序。对应 `GET /form-fill/history`。

```
inferFormFillFields(projectId, nodeId, partialData) → { inferred: Record<string, unknown>, confidence: Record<string, number> }
```

调用 AI 推断缺失字段值，返回推断结果及置信度。对应 `POST /form-fill/infer`。

```
batchFormFill(projectId, items: { nodeId, data }[]) → { results: { nodeId, filled: boolean, data: Record<string, unknown> }[] }
```

批量填充多个节点的表单数据，每个节点独立执行三层填充策略。对应 `POST /form-fill/batch`。

FormFiller 合并策略（mergeSuggestions）：
1. **AI 推断层**: 调用 AiConfig 配置的大模型，基于项目上下文 + 已填字段推断缺失值
2. **历史建议层**: 查询同一 projectId + nodeId 的历史 CompilationFormData，按 recency 加权
3. **默认值层**: 从 Project 类型默认值 + Template 字段默认值合并

### 文件解析函数（FileParser）

多格式文件解析器，支持 PDF、Word、图片、纯文本。

```
parseFile(fileId, filePath, mimeType) → { text: string, metadata: FileMetadata }
```

根据 MIME 类型自动选择解析器，提取文本内容和元数据。对应内部调用（上传后自动触发）。

```
parsePdf(filePath) → { text: string, pageCount: number, metadata: PdfMetadata }
```

使用 pdf-parse 提取 PDF 文本内容，支持多页文档。对应 `FileParser.parsePdf()`。

```
parseWord(filePath) → { text: string, metadata: WordMetadata }
```

使用 mammoth 提取 .docx 文本内容，保留段落结构。对应 `FileParser.parseWord()`。

```
parseImage(filePath) → { text: string, metadata: ImageMetadata }
```

使用 sharp 读取图片元数据（尺寸、格式），OCR 文本提取。对应 `FileParser.parseImage()`。

```
parseText(filePath) → { text: string, encoding: string }
```

纯文本文件读取，自动检测编码（UTF-8/GBK/GB2312）。对应 `FileParser.parseText()`。

### 审核智能提示函数（ReviewHintGenerator）

```
generateReviewHints(documentId) → { hints: ReviewHint[] }
```

基于文档内容、历史审核记录和城建归档标准，生成审核建议和风险提示。对应 `POST /reviews/hints`。

子函数：

```
detectRisks(documentContent, projectType) → Risk[]
```

基于规则检测文档潜在风险：必填字段缺失、格式不符、签章位置异常、归档目录不匹配。

```
checkCompliance(documentContent, cityArchiveStandard) → ComplianceResult
```

对照城建档案馆标准（CityArchiveCatalogNode）检查文档合规性。

```
generateSuggestions(risks: Risk[], compliance: ComplianceResult) → ReviewHint[]
```

将风险和合规结果合并为可操作的审核提示，按严重程度排序。

### AI 分类器回退链函数（AiClassifier）

三层回退策略：AI 分类 → 文件名关键词匹配 → "unclassified"。

```
classifyFile(fileId, extractedText, fileName) → ClassificationResult
```

主分类函数，依次尝试 AI 分类、文件名规则匹配，最终回退到未分类。对应 `POST /ai/classify`。

```
classifyByFileName(fileName) → { fileType: string, confidence: number } | null
```

基于文件名关键词（如"施工组织设计"、"竣工图"、"检验批"）匹配青岛市城建档案分类（鲁JJ 编码）。无法匹配时返回 null，触发回退。

```
parseClassificationResult(aiResponse: string) → ClassificationResult
```

解析大模型返回的分类结果 JSON，提取 fileType、recommendedNodeId、metadata、confidence。若解析失败或 confidence 低于阈值，回退到文件名分类。若文件名分类也失败，标记为 "unclassified"。

### 目录映射校验函数

```
validateCityArchiveMapping(projectId) → { matched: number, unmatched: string[] }
```

将项目当前目录与城建档案馆标准目录（CityArchiveCatalogNode）进行映射比对，返回未匹配项。

### 文件预览函数

```
getFilePreview(fileId) → { fileName, title, mimeType, fileUrl, extractedText, metadata }
```

获取上传文件的预览数据，包括提取的文本内容和元数据。对应 `GET /projects/{projectId}/uploads/{fileId}/preview`。

---

## 总结

| 函数名 | 调用方 | 返回值 | 对应 API 端点 |
|--------|--------|--------|-------------|
| checkProjectArchiveCompleteness | Action / UI | missing items | (内部调用) |
| advanceSigningFlow | Action (sign) | SigningTask | (内部调用) |
| calculateTenantStorage | Action (upload/package) | storage stats | (内部调用) |
| getProjectStats | Application | ProjectStats | GET /projects/{id}/stats |
| getDashboardStats | Application | DashboardStats | GET /dashboard/stats |
| getMonthlyTrends | Application | MonthlyTrends | GET /dashboard/monthly-trends |
| getSealStats | Application | SealStats | GET /seals/stats |
| getTenantStats | Application | TenantStats | GET /tenants/stats |
| autoCatalogueFile | Action (upload) | catalogue suggestion | (AI 辅助, 内部调用) |
| aiClassifyFile | Action / UI | file class result | POST /ai/classify |
| aiClassifyFilesBatch | Action / UI | batch class results | POST /ai/classify/batch |
| aiGetFileTypes | Application | file type catalog | GET /ai/classify/file-types |
| aiChat | Agent / UI | SSE stream | POST /ai/chat |
| aiTestConnection | User config | test result | POST /ai/test |
| getFormFillDefaults | Action / UI | form defaults | GET /form-fill/defaults |
| getFormFillSuggestions | Action / UI | field suggestions | GET /form-fill/suggestions |
| getFormFillHistory | Action / UI | historical records | GET /form-fill/history |
| inferFormFillFields | Action / UI | inferred fields + confidence | POST /form-fill/infer |
| batchFormFill | Action / UI | batch fill results | POST /form-fill/batch |
| parseFile | Action (internal) | extracted text + metadata | (上传后自动触发) |
| parsePdf | Action (internal) | PDF text + metadata | (内部调用) |
| parseWord | Action (internal) | Word text + metadata | (内部调用) |
| parseImage | Action (internal) | image metadata + OCR | (内部调用) |
| parseText | Action (internal) | text + encoding | (内部调用) |
| generateReviewHints | Action / UI | review hints | POST /reviews/hints |
| detectRisks | Action (internal) | risk list | (generateReviewHints 子调用) |
| checkCompliance | Action (internal) | compliance result | (generateReviewHints 子调用) |
| generateSuggestions | Action (internal) | ordered hints | (generateReviewHints 子调用) |
| classifyFile | Action / UI | classification result | POST /ai/classify |
| classifyByFileName | Action (internal) | file type or null | (classifyFile 回退链) |
| parseClassificationResult | Action (internal) | parsed result | (classifyFile 回退链) |
| validateCityArchiveMapping | Action (precheck) | unmatched list | (内部调用) |
| getFilePreview | Application | preview data | GET .../uploads/{fileId}/preview |

**总计: 29 个 Functions，覆盖完整性校验、流程推进、统计分析、AI 辅助、智能表单填充、文件解析、合规预检、AI 分类器回退八大类别。**
