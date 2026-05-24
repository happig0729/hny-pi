---
title: "Archive Manager Ontology — 入口索引"
modelVersion: "2.0"
created: 2026-05-16
updated: 2026-05-17
source: "../../lib/api-spec/openapi.yaml"
tags:
  - ontology
  - archive-manager
  - index
---

## 概述

Archive Manager 本体模型，基于五要素（**Object Types** / **Link Types** / **Action Types** / **Functions** / **Interfaces**），以 `openapi.yaml` 为权威数据源。

核心业务域：**多租户建设工程档案的全生命周期管理**，覆盖项目立项 → 档案编制 → 审核(批) → 签章 → 归档采集的完整链路。

## 文档导航

### Object Types（对象类型）— 按业务域拆分

| 序号 | 文档 | 覆盖域 | 对象数 |
|------|------|--------|--------|
| 01 | [组织架构与用户身份](01-organization-identity.md) | 组织架构域 + 用户与身份域 | 7 |
| 02 | [项目管理](02-project-management.md) | 项目管理域 | 5 |
| 03 | [档案编制与著录](03-document-lifecycle.md) | 档案编制域 + 档案著录域 | 5 |
| 04 | [模板与目录](04-template-catalog.md) | 模板与目录域 + 企业配置域 | 9 |
| 05 | [审核与签章](05-review-signing.md) | 审核与签章域 | 4 |
| 06 | [归档与采集](06-archive-collection.md) | 归档与采集域 | 2 |
| 07 | [AI 与合规](07-ai-compliance.md) | AI 与合规域 | 2 |
| 08 | [邀请与系统管理](08-invitation-system.md) | 邀请与接入域 + 系统管理域 | 7 |
| 09 | [跨域服务](09-cross-domain-services.md) | 跨域服务域（表单填充、文件解析、AI分类、签章流转、个人工作台） | 6 |

### 本体关系与行为

| 文档 | 说明 |
|------|------|
| [Link Types](link-types.md) | 65+ 条对象间语义链接关系 |
| [Action Types](action-types.md) | 110+ 个受治理写操作 |
| [Functions](functions.md) | 17 个核心服务端函数 |
| [Interfaces](interfaces.md) | 8 个跨域共享接口 |
| [Security & Governance](security-governance.md) | 权限模型、数据隔离、审计日志 |


