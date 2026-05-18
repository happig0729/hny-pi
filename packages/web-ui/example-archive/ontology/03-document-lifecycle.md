---
title: "档案编制与著录 — Object Types"
modelVersion: "1.0"
created: 2026-05-16
tags:
  - ontology
  - object-types
  - compilation
  - cataloguing
  - archive-manager
nav:
  parent: "[[index]]"
  domain: document-lifecycle
  prev: "[[02-project-management]]"
  next: "[[04-template-catalog]]"
---

## 档案编制与著录域

覆盖编制实例、编制表单数据、著录文档、上传文件、上传文件版本。

### CompilationInstance（编制实例）

一个编制实例代表一条档案著录项的一次具体编制操作。它跟踪从草拟到最终签章的完整生命周期。

| 属性 | 类型 | 说明 |
|------|------|------|
| id | integer | 编制实例唯一标识 |
| projectId | link → Project | 所属项目 |
| unitId | link → Unit | 关联单体（可空） |
| itemId | text | 著录项 ID |
| name | text | 实例名称 |
| status | enum: drafting/completed/signing/signed/collected | 编制生命周期 |
| version | text | 版本号 |
| createdBy | link → User | 创建者 |
| createdAt | timestamp | 创建时间 |
| lastModifiedBy | link → User | 最后修改者 |
| lastModifiedAt | timestamp | 最后修改时间 |

### CompilationFormData（编制表单数据）

| 属性 | 类型 | 说明 |
|------|------|------|
| id | integer | 表单数据唯一标识 |
| instanceId | link → CompilationInstance | 关联编制实例 |
| fieldKey | text | 表单字段键 |
| fieldValue | text | 表单字段值 |

### Document（著录文档）

著录文档是在线编辑或上传产生的正式档案记录。它代表一个完整的、带版本控制的档案实体。

| 属性 | 类型 | 说明 |
|------|------|------|
| id | integer | 文档唯一标识 |
| projectId | link → Project | 所属项目 |
| unitId | link → Unit | 关联单体 |
| title | text | 文档标题 |
| code | text | 文档编码 |
| category | text | 分类 |
| subCategory | text | 子分类 |
| type | enum: online/uploaded | 文档来源类型 |
| status | enum: draft/under_review/approved/rejected | 审核状态 |
| content | jsonb | 在线编辑内容 |
| fileUrl | text | 文件 URL |
| fileFormat | text | 文件格式 |
| version | integer | 当前版本号 |
| templateId | link → Template | 关联模板 |
| createdBy | link → User | 创建者 |
| assignedReviewer | link → User | 指定审核人 |
| reviewComment | text | 审核意见 |
| createdAt / updatedAt | timestamp | 审计时间戳 |

### UploadFile（上传文件）

上传文件是外部文件（PDF/OFD/图片等）通过导入方式进入档案系统的入口，需经过著录后才能成为正式档案。

| 属性 | 类型 | 说明 |
|------|------|------|
| id | integer | 上传文件唯一标识 |
| projectId | link → Project | 所属项目 |
| unitId | link → Unit | 关联单体 |
| fileName | text | 原始文件名 |
| title | text | 文件题名 |
| fileType | text | 业务文件类型标签 |
| mimeType | text | MIME 类型 |
| fileSize | integer | 文件大小（字节） |
| fileUrl | text | 外部访问 URL |
| storagePath | text | 服务器存储路径 |
| extractedText | text | AI 提取的文本内容 |
| textExtractedAt | timestamp | 文本提取时间 |
| nodeId | text | 著录目录节点 ID |
| nodeLabel | text | 目录节点名称 |
| carrier | text | 载体类型 |
| compiler | text | 编制单位 |
| compileDate | date | 编制日期 |
| responsible | text | 责任人 |
| copies | integer | 份数 |
| pages | integer | 页数 |
| remarks | text | 备注 |
| status | enum: pending/signing/signed/collected/returned | 文件生命周期 |
| uploadedBy | link → User | 上传者 |
| uploadedAt | timestamp | 上传时间 |
| cataloguedBy | link → User | 著录者 |
| cataloguedAt | timestamp | 著录时间 |
| returnReason | text | 退回原因 |
| updatedAt | timestamp | 更新时间 |

### UploadFileVersion（上传文件版本）

| 属性 | 类型 | 说明 |
|------|------|------|
| id | integer | 版本记录唯一标识 |
| uploadFileId | link → UploadFile | 关联上传文件 |
| version | integer | 版本号 |
| fileUrl / storagePath | text | 版本文件路径 |
| fileSize / mimeType | integer / text | 版本文件属性 |
| titleSnapshot / fileNameSnapshot | text | 版本时的标题/文件名快照 |
| createdAt | timestamp | 创建时间 |
| createdBy | link → User | 创建者 |
