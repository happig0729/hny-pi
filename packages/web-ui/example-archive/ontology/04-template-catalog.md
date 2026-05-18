---
title: "模板与目录 — Object Types"
modelVersion: "1.0"
created: 2026-05-16
tags:
  - ontology
  - object-types
  - template
  - catalog
  - archive-manager
nav:
  parent: "[[index]]"
  domain: template-catalog
  prev: "[[03-document-lifecycle]]"
  next: "[[05-review-signing]]"
---

## 模板与目录域

覆盖文档模板、模板示例、填写指引、自动填充配置、著录目录模板、目录节点、城建档案馆目录节点、目录映射、企业档案模板、企业档案范本。

### Template（文档模板）

| 属性 | 类型 | 说明 |
|------|------|------|
| id | integer | 模板唯一标识 |
| name | text | 模板名称 |
| code | text | 模板编码 |
| category / subCategory | text | 分类/子分类 |
| description | text | 模板描述 |
| fields | jsonb | 字段定义 |
| isStandard | boolean | 是否标准模板 |
| enabled | boolean | 是否启用 |
| tenantId | integer | 租户范围（空=全局） |
| version | text | 模板版本 |
| createdAt / updatedAt | timestamp | 审计时间戳 |

### TemplateExample（模板示例数据）

| 属性 | 类型 | 说明 |
|------|------|------|
| id | integer | 示例唯一标识 |
| templateId | link → Template | 关联模板 |
| name | text | 示例名称 |
| data | jsonb | 示例数据 |
| createdBy | link → User | 创建者 |
| createdAt | timestamp | 创建时间 |

### TemplateInstruction（模板填写指引）

| 属性 | 类型 | 说明 |
|------|------|------|
| id | integer | 指引唯一标识 |
| templateId | link → Template（唯一） | 关联模板 |
| content | text | 指引内容 |
| updatedAt | timestamp | 更新时间 |

### TemplateAutofillConfig（模板自动填充配置）

| 属性 | 类型 | 说明 |
|------|------|------|
| id | integer | 配置唯一标识 |
| templateId | link → Template（唯一） | 关联模板 |
| mapping | jsonb | 自动填充映射 |
| updatedAt | timestamp | 更新时间 |

### CatalogTemplate（档案著录目录模板）

| 属性 | 类型 | 说明 |
|------|------|------|
| id | integer | 目录模板唯一标识 |
| name | text | 模板名称 |
| projectType | text | 适用项目类型 |
| tmplType | enum: preset/custom | 预置/自定义 |
| creator | link → User | 创建者 |
| createdAt / updatedAt | timestamp | 审计时间戳 |

### CatalogTemplateNode（目录模板节点）

目录模板节点组织成树形结构，每个节点可以是 folder（文件夹）或 file（文件），与表单模板（formId）关联。

| 属性 | 类型 | 说明 |
|------|------|------|
| id | integer | 节点唯一标识 |
| templateId | link → CatalogTemplate | 所属目录模板 |
| parentId | link → self | 父节点（树形结构） |
| name | text | 节点名称 |
| sortOrder | integer | 排序序号 |
| type | enum: folder/file | 节点类型 |
| formId | link → Template | 关联表单模板 |

### CityArchiveCatalogNode（城建档案馆目录节点）

城建档案馆发布的标准化目录结构，与项目目录模板通过 CityArchiveMapping 实现映射。

| 属性 | 类型 | 说明 |
|------|------|------|
| id | integer | 节点唯一标识 |
| number | text | 节点编号 |
| name | text | 节点名称 |
| sortOrder | integer | 排序序号 |
| parentId | link → self | 父节点（树形结构） |

### CityArchiveMapping（城建档案馆目录映射）

| 属性 | 类型 | 说明 |
|------|------|------|
| id | integer | 映射唯一标识 |
| cityNodeId | link → CityArchiveCatalogNode | 城建档案馆目录节点 |
| projectNodeId | link → CatalogTemplateNode | 项目目录模板节点 |

### EnterpriseTemplate（企业档案模板）

| 属性 | 类型 | 说明 |
|------|------|------|
| id | integer | 模板唯一标识 |
| name | text | 模板名称 |
| projectType | text | 适用项目类型 |
| archiveStandard | text | 参考归档标准 |
| version | text | 版本号 |
| description | text | 说明 |
| gridData | jsonb | 网格数据 |
| status | enum: enabled/disabled | 启用状态 |
| createdBy | link → User | 创建者 |
| updatedAt | timestamp | 更新时间 |

### EnterpriseParadigm（企业档案范本）

| 属性 | 类型 | 说明 |
|------|------|------|
| id | integer | 范本唯一标识 |
| name | text | 范本名称 |
| templateRef | text | 关联模板标识 |
| docType | text | 文档类型 |
| fillGuide | text | 填写指南 |
| exampleUrl | text | 范本示例 URL |
| status | enum: enabled/disabled | 启用状态 |
| createdBy | link → User | 创建者 |
| updatedAt | timestamp | 更新时间 |
