---
title: "Link Types — Archive Manager Ontology"
modelVersion: "1.0"
created: 2026-05-16
tags:
  - ontology
  - link-types
  - archive-manager
---

## Link Types（链接类型）

Link Types 定义 Object Types 之间的语义关系，是 Ontology 区别于传统数据库外键的核心——它描述的是**业务意义上的关系**。

### 组织架构关系

```
┌──────────┐         ┌──────────────┐         ┌──────────────┐
│  Tenant  │ 1───N  │  Department  │ 1───N  │     User     │
└──────────┘         └──────────────┘         └──────────────┘
     │                                               │
     │ 1───N                                         │ N───1
     │                                               │
     ▼                                               ▼
┌──────────┐         ┌──────────────┐         ┌──────────────┐
│  Project │ 1───N  │   Project    │         │  Enterprise  │
│          │◄────────│   Member     │────────►│              │
└──────────┘         └──────────────┘         └──────────────┘
```

| Link Type | 源对象 | 目标对象 | 基数 | 业务语义 |
|-----------|--------|----------|------|---------|
| tenant_contains_department | Tenant | Department | 1:N | 租户下设若干部门 |
| tenant_contains_project | Tenant | Project | 1:N | 租户管辖若干项目 |
| department_has_user | Department | User | 1:N | 部门包含若干用户 |
| tenant_has_user | Tenant | User | 1:N | 租户注册若干用户 |
| user_belongs_to_tenant | User | Tenant | N:1 | 用户归属租户 |
| user_works_at_department | User | Department | N:1 | 用户隶属部门 |
| user_created_enterprise | User | Enterprise | 1:N | 用户创建参建企业 |

### 项目协作关系

| Link Type | 源对象 | 目标对象 | 基数 | 业务语义 |
|-----------|--------|----------|------|---------|
| project_has_member | Project | ProjectMember | 1:N | 项目拥有若干参与成员 |
| project_member_is_user | ProjectMember | User | N:1 | 成员映射到具体用户 |
| project_has_unit | Project | Unit | 1:N | 项目包含若干单体工程 |
| project_has_extension | Project | ProjectExtension | 1:N | 项目动态扩展字段 |
| unit_has_extension | Unit | UnitExtension | 1:N | 单体动态扩展字段 |

### 档案编制与著录关系

```
┌──────────┐
│  Project │
└────┬─────┘
     │
     ├─────────────┬──────────────────┐
     │             │                  │
     ▼             ▼                  ▼
┌──────────┐ ┌───────────┐    ┌──────────────┐
│   Unit   │ │  Template │    │ UploadFile   │
└────┬─────┘ └─────┬─────┘    └──────┬───────┘
     │             │                  │
     │             ▼                  │ version_of
     │      ┌───────────┐            ▼
     │      │  Document │     ┌──────────────┐
     │      └─────┬─────┘     │UploadFileVer │
     │            │            └──────────────┘
     ▼            ▼
┌──────────────────────┐
│ CompilationInstance  │
└──────────────────────┘
```

| Link Type | 源对象 | 目标对象 | 基数 | 业务语义 |
|-----------|--------|----------|------|---------|
| project_contains_document | Project | Document | 1:N | 项目包含所有档案文档 |
| unit_contains_document | Unit | Document | 1:N | 单体工程关联档案文档 |
| document_based_on_template | Document | Template | N:1 | 文档基于模板生成 |
| document_has_review | Document | Review | 1:N | 文档经历多次审核 |
| document_created_by | Document | User | N:1 | 文档创建者 |
| document_assigned_to | Document | User | N:1 | 文档指派审核人 |
| upload_file_belongs_to_project | UploadFile | Project | N:1 | 上传文件归属项目 |
| upload_file_belongs_to_unit | UploadFile | Unit | N:1 | 上传文件关联单体 |
| upload_file_has_versions | UploadFile | UploadFileVersion | 1:N | 上传文件版本历史 |
| upload_file_uploaded_by | UploadFile | User | N:1 | 上传者 |
| upload_file_catalogued_by | UploadFile | User | N:1 | 著录者 |
| compilation_belongs_to_project | CompilationInstance | Project | N:1 | 编制实例归属项目 |
| compilation_belongs_to_unit | CompilationInstance | Unit | N:1 | 编制实例关联单体 |
| compilation_has_form_data | CompilationInstance | CompilationFormData | 1:N | 编制实例的表单数据 |
| compilation_created_by | CompilationInstance | User | N:1 | 编制创建者 |
| compilation_modified_by | CompilationInstance | User | N:1 | 编制修改者 |

### 模板与目录映射关系

```
┌────────────────────┐          ┌────────────────────┐
│  CatalogTemplate   │          │CityArchiveCatalog  │
│                    │          │       Node         │
└────────┬───────────┘          └──────────┬─────────┘
         │                                │
         │ 1───N                          │
         ▼                                │
┌────────────────────┐                    │
│ CatalogTemplate    │                    │
│       Node         │◄───────────────────┘
│ (folder / file)    │     CityArchiveMapping
│  parentId ↺ self   │
└────────┬───────────┘
         │ formId
         ▼
┌────────────────────┐
│     Template       │
└────────┬───────────┘
    ┌────┴──────────────┬──────────────────┐
    ▼                   ▼                  ▼
TemplateExample  TemplateInstruction  TemplateAutofillConfig
```

| Link Type | 源对象 | 目标对象 | 基数 | 业务语义 |
|-----------|--------|----------|------|---------|
| catalog_has_nodes | CatalogTemplate | CatalogTemplateNode | 1:N | 目录模板包含节点树 |
| catalog_node_parent | CatalogTemplateNode | CatalogTemplateNode | N:1 | 节点层级自引用 |
| catalog_node_has_form | CatalogTemplateNode | Template | N:1 | 节点关联表单模板 |
| template_has_examples | Template | TemplateExample | 1:N | 模板包含示例数据 |
| template_has_instruction | Template | TemplateInstruction | 1:1 | 模板的填写指引 |
| template_has_autofill | Template | TemplateAutofillConfig | 1:1 | 模板的自动填充 |
| city_node_maps_to_project_node | CityArchiveCatalogNode | CatalogTemplateNode | M:N | 城建档案馆标准 → 项目目录映射 |

### 签章流程关系

```
┌──────────┐        ┌──────────────┐        ┌──────────────┐
│  Project │ 1───N │ SigningTask  │ 1───N │  SigningNode │
│          │◄───────│              │◄───────│              │
└──────────┘        └──────┬───────┘        └──────┬───────┘
                           │                       │
                           │ docId                 │ assignee / sealResourceId
                           ▼                       ▼
                    ┌──────────┐            ┌──────────────┐
                    │ Document │            │  User / Seal │
                    └──────────┘            └──────────────┘
```

| Link Type | 源对象 | 目标对象 | 基数 | 业务语义 |
|-----------|--------|----------|------|---------|
| project_has_signing_tasks | Project | SigningTask | 1:N | 项目包含签章任务 |
| signing_task_for_document | SigningTask | Document | N:1 | 签章任务对应档案文档 |
| signing_task_has_nodes | SigningTask | SigningNode | 1:N | 签章任务包含签章节点 |
| signing_node_assignee | SigningNode | User | N:1 | 签章节点指派签章人 |
| signing_node_uses_seal | SigningNode | Seal | N:1 | 签章节点关联印章 |

### 归档采集关系

| Link Type | 源对象 | 目标对象 | 基数 | 业务语义 |
|-----------|--------|----------|------|---------|
| project_has_archive_package | Project | ArchivePackage | 1:N | 项目生成若干归档包 |
| project_has_collected_items | Project | CollectedItem | 1:N | 项目已采集的档案项 |
| collected_by_user | CollectedItem | User | N:1 | 采集操作执行者 |
| archive_package_created_by | ArchivePackage | User | N:1 | 归档包生成者 |

### AI 与合规关系

| Link Type | 源对象 | 目标对象 | 基数 | 业务语义 |
|-----------|--------|----------|------|---------|
| user_has_ai_config | User | AiConfig | 1:1 | 用户 AI 配置 |
| project_has_compliance_precheck | Project | CompliancePrecheck | 1:N | 项目的合规预检记录 |
| precheck_by_user | CompliancePrecheck | User | N:1 | 预检执行者 |

### 系统管理关系

| Link Type | 源对象 | 目标对象 | 基数 | 业务语义 |
|-----------|--------|----------|------|---------|
| user_has_session | User | Session | 1:N | 用户登录会话 |
| user_has_api_key | User | ApiKey | 1:N | 用户的 API 密钥（qd_live_ 前缀，bcrypt 哈希存储） |
| user_has_wechat_binding | User | WechatBinding | 1:1 | 用户绑定微信（OAuth code → openid） |
| user_has_preferences | User | UserPreference | 1:N | 用户偏好设置（key-value + jsonb） |
| user_performs_operation | User | OperationLog | 1:N | 用户操作日志（仅记录 POST/PUT/PATCH/DELETE） |
| menu_parent_child | Menu | Menu | N:1 | 菜单树层级（parentId 无 FK 约束，逻辑引用） |

### 项目接入与邀请关系

```
┌──────────┐         ┌──────────────┐         ┌──────────────┐
│  Project │ 1───N  │  InviteLink  │ 1───N  │ InviteMember │
│          │◄───────│              │◄───────│              │
└────┬─────┘         └──────────────┘         └──────┬───────┘
     │                                               │
     │ accessCode + accessPassword                   │ userId（可空）
     │ (joinMethod: access_code)                     │ (joinMethod: invite_link)
     ▼                                               ▼
┌──────────┐         ┌──────────────┐         ┌──────────────┐
│   User   │◄────────│ InviteMember │────────►│ Project      │
│          │  N:1    │              │  N:1    │ Member       │
└──────────┘         └──────────────┘         └──────────────┘
```

| Link Type | 源对象 | 目标对象 | 基数 | 业务语义 |
|-----------|--------|----------|------|---------|
| project_has_access_code | Project | — | 1:1 | 项目通过 accessCode + 加密 accessPassword 实现接入 |
| user_joins_project_via_access_code | User | Project | N:M | 通过输入接入码和密码加入项目（joinMethod: access_code） |
| invite_link_has_members | InviteLink | InviteMember | 1:N | 邀请链接被使用的成员记录 |
| invite_member_becomes_project_member | InviteMember | ProjectMember | 1:1 | 受邀成员接受邀请后转为正式项目成员 |
| user_joins_via_invite | User | InviteMember | 1:1 | 用户通过邀请链接加入（joinMethod: invite_link） |
| public_user_binds_to_tenant | User | Tenant | N:1 | 公共用户池用户绑定到租户（tenantId: null → 具体值） |

### 模板同步与传播关系

| Link Type | 源对象 | 目标对象 | 基数 | 业务语义 |
|-----------|--------|----------|------|---------|
| standard_template_syncs_to_tenants | Template | Tenant | M:N | 标准模板启用时自动同步独立副本到所有活跃租户 |
| template_has_autofill_config | Template | TemplateAutofillConfig | 1:1 | 模板的自动填充字段映射配置 |
| catalog_node_has_form_template | CatalogTemplateNode | Template | N:1 | 目录树的 file 节点关联表单模板（formId FK） |

### 签章认证与流转关系

| Link Type | 源对象 | 目标对象 | 基数 | 业务语义 |
|-----------|--------|----------|------|---------|
| user_applies_seal_certification | User | Seal | 1:N | 用户申请个人/企业印章认证（status: pending → active/revoked） |
| seal_approved_by_admin | Seal | User | N:1 | 租户管理员审批印章认证（含有效期和可用次数） |
| signing_node_uses_seal_resource | SigningNode | Seal | N:1 | 签章节点关联印章资源（注：sealResourceId 无 FK 约束） |
| seal_flow_aggregates_user_tasks | User | SigningNode | 1:N | 用户维度的跨项目签章任务汇总（封流视图） |
| signing_task_source_polymorphic | SigningTask | CompilationInstance\|UploadFile | N:1 | 多态来源（sourceType + sourceId，无 FK 约束） |

### 单元工程归档状态关系（扩展字段机制）

| Link Type | 源对象 | 目标对象 | 基数 | 业务语义 |
|-----------|--------|----------|------|---------|
| unit_archive_status_via_extension | Unit | UnitExtension | 1:1 | 通过 unitExtensionsTable 的 fieldKey='状态' 字段标记已归档/进行中 |
| project_lock_blocks_unit_operations | Project | Unit | 1:N | 项目锁定（status=project_archive）后禁止单位工程增删改操作 |

### 跨域聚合视图关系

| Link Type | 源对象 | 目标对象 | 基数 | 业务语义 |
|-----------|--------|----------|------|---------|
| my_document_aggregates_uploads | User | UploadFile | 1:N | 个人工作台汇聚当前用户上传的文件 |
| my_document_aggregates_compilations | User | CompilationInstance | 1:N | 个人工作台汇聚当前用户创建的编制实例 |
