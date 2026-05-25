---
title: "Interfaces — Archive Manager Ontology"
modelVersion: "2.0"
created: 2026-05-16
updated: 2026-05-17
tags:
  - ontology
  - interfaces
  - archive-manager
source: "../api-spec/openapi.yaml"
---

## Interfaces（接口）

Interfaces 定义跨对象类型的共享形状，实现多态——不同 Object Type 实现相同 Interface，允许上层应用以统一方式处理。

### HasStatus（生命周期状态）

描述具备状态流转能力的实体。

```typescript
interface HasStatus {
  status: string
}
```

**实现者**: Project, Unit, Document, UploadFile, SigningTask, SigningNode, CompilationInstance, Seal, ArchivePackage, CompliancePrecheck, InviteLink, Template, EnterpriseTemplate, Tenant, User, EnterpriseConfigTemplate, EnterpriseConfigParadigm, CatalogTemplate, CityArchiveNode, Menu

### HasAudit（审计追溯）

描述具备创建/更新时间戳的实体。

```typescript
interface HasAudit {
  createdAt: timestamp
  updatedAt: timestamp
}
```

**实现者**: 几乎所有 Object Type（全部 32+ 张核心表中的绝大多数），包括 Tenant, Department, Enterprise, User, Session, ApiKey, WechatBinding, UserPreference, Project, ProjectMember, Unit, CompilationInstance, Document, UploadFile, UploadFileVersion, Template, TemplateExample, TemplateInstruction, TemplateAutofillConfig, CatalogTemplate, CatalogTemplateNode, CityArchiveCatalogNode, CityArchiveMapping, EnterpriseTemplate, EnterpriseParadigm, Review, SigningTask, SigningNode, Seal, ArchivePackage, CollectedItem, AiConfig, CompliancePrecheck, InviteLink, InviteMember, Position, Role, Menu, Dictionary, Notice

### HasOwner（归属人追溯）

描述由具体用户创建的实体。

```typescript
interface HasOwner {
  createdBy: link → User
}
```

**实现者**: Project, Enterprise, SigningTask, CompilationInstance, Document, UploadFile, ArchivePackage, InviteLink, Notice, Template, TemplateExample, EnterpriseTemplate, EnterpriseParadigm, CatalogTemplate, OperationLog, CollectedItem

### BelongsToProject（项目归属）

描述归属于某个项目的实体。

```typescript
interface BelongsToProject {
  projectId: link → Project
}
```

**实现者**: Unit, Document, UploadFile, SigningTask, CompilationInstance, ArchivePackage, CollectedItem, CompliancePrecheck, InviteLink, InviteMember, ProjectMember, ProjectExtension, UnitExtension

### BelongsToTenant（租户归属）

描述归属于某个租户的实体。多租户隔离的核心接口。

```typescript
interface BelongsToTenant {
  tenantId: link → Tenant
}
```

**实现者**: Department, User, Project, Template (条件: tenantId 不为 null 时), Enterprise, EnterpriseTemplate, EnterpriseParadigm, CatalogTemplate

### Versioned（版本化实体）

描述支持版本追溯的实体。

```typescript
interface Versioned {
  version: integer | text
}
```

**实现者**: Document, UploadFileVersion, CompilationInstance, Template

### Archivable（可归档实体）

描述可被采集归档的文件实体。

```typescript
interface Archivable {
  id: integer
  projectId: link → Project
  status: string
}
```

**实现者**: Document, UploadFile, CompilationInstance

### HasAssignee（指派实体）

描述可被指派给具体用户的实体。

```typescript
interface HasAssignee {
  assignedTo: link → User
}
```

**实现者**: Document (assignedReviewer), Review (assignedTo), SigningNode (assignee)

### HasAccessCode（接入码机制）

描述通过接入码 + 密码加入项目的实体。

```typescript
interface HasAccessCode {
  accessCode: string
  accessPassword: string  // bcrypt 哈希存储
  joinMethod: "access_code"
}
```

**实现者**: Project（accessCode 字段），User（通过 joinProjectByCode 操作关联）

### CanBeSigned（可签章实体）

描述可进入签章流程的实体。通过多态引用关联 SigningTask。

```typescript
interface CanBeSigned {
  id: string | number
  sourceType: string  // "compilation" | "upload"
}
```

**实现者**: CompilationInstance（sourceType: "compilation"），UploadFile（sourceType: "upload"）

### HasExtension（动态扩展字段）

描述通过扩展表实现动态字段的实体。采用 EAV（Entity-Attribute-Value）模式。

```typescript
interface HasExtension {
  id: number | string
  extensionTable: string  // "project_extensions" | "unit_extensions"
  fields: { fieldKey: string, fieldValue: string }[]
}
```

**实现者**: Project（ProjectExtension），Unit（UnitExtension），User（UserPreference）

---

## 接口关系矩阵

```
                    HasStatus HasAudit HasOwner BelongsToProject BelongsToTenant Versioned Archivable HasAssignee HasAccessCode CanBeSigned HasExtension
Tenant                 ✓        ✓         ✓                                           
Department             ✓        ✓                              ✓                   
Enterprise             ✓        ✓         ✓                     ✓                   
User                   ✓        ✓                                                                                                ✓
Project                ✓        ✓         ✓                                                              ✓
ProjectMember          ✓        ✓                              ✓                   
Unit                   ✓        ✓                              ✓                                                       ✓
Document               ✓        ✓         ✓                     ✓                    ✓           ✓           ✓
UploadFile             ✓        ✓         ✓                     ✓                    ✓           ✓                       ✓
CompilationInstance    ✓        ✓         ✓                     ✓                    ✓           ✓                       ✓
SigningTask            ✓        ✓         ✓                     ✓                                                        ✓
SigningNode            ✓        ✓                              ✓                                      ✓
Seal                   ✓        ✓                                                                             ✓
ArchivePackage         ✓        ✓         ✓                     ✓                   
CollectedItem          ✓        ✓         ✓                     ✓                   
CompliancePrecheck     ✓        ✓                              ✓                   
InviteLink             ✓        ✓         ✓                     ✓                   
InviteMember           ✓        ✓                              ✓                   
Template               ✓        ✓         ✓                                                        ✓
CatalogTemplate        ✓        ✓         ✓                                                   
CityArchiveNode        ✓        ✓                                                    
Review                 ✓        ✓                              ✓                                      ✓
AiConfig               ✓        ✓                                                    
Position               ✓        ✓                                                    
Role                   ✓        ✓                                                    
Menu                   ✓        ✓                                                    
Dictionary             ✓        ✓                                                    
Notice                 ✓        ✓         ✓                                        
OperationLog           ✓                   ✓                                        
EnterpriseTemplate     ✓        ✓         ✓                                                   
EnterpriseParadigm     ✓        ✓         ✓                                                   
```

**总计: 11 个共享接口，覆盖全部 32+ 个核心 Object Types，实现跨域多态。新增 HasAccessCode、CanBeSigned、HasExtension 三个接口。**
