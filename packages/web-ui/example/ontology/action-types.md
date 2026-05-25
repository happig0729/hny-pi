---
title: "Action Types — Archive Manager Ontology"
modelVersion: "1.1"
created: 2026-05-16
updated: 2026-05-17
tags:
  - ontology
  - action-types
  - archive-manager
source: "../api-spec/openapi.yaml"
---

## Action Types（动作类型）

Action Types 定义 Ontology 上受治理的写操作，是系统状态变更的唯一入口。每个 Action 包含：输入校验、副作用（通知/审计/下游联动）、权限门控。

`openapi.yaml` 是后端真实能力的权威来源，本文件只解释这些 operationId 的业务语义。没有出现在 OpenAPI 中的生命周期动作必须标注为内部语义动作，不得伪装成 API operationId。

本文件基于 `openapi.yaml` 中 POST/PUT/DELETE 端点映射生成，并补充少量内部生命周期语义动作，按业务域组织。

### 租户管理

| Action | API operationId | 触发者 | 输入 | 副作用 |
|--------|-----------------|--------|------|--------|
| createTenant | createTenant | super_admin | name, code, plan | 初始化租户存储配额、创建默认角色 |
| updateTenant | updateTenant | super_admin | tenantId, fields | 更新租户配置、通知租户管理员 |
| deleteTenant | deleteTenant | super_admin | tenantId | 清理租户全部数据、释放存储 |
| updateTenantPlan | (admin only) | super_admin | tenantId, plan | 更新配额限制、通知租户管理员 |
| freezeTenant | (admin only) | super_admin | tenantId, reason | 冻结所有项目、禁用租户用户登录 |
| activateTenant | (admin only) | super_admin | tenantId | 恢复项目状态、解除用户登录限制 |

### 项目管理

| Action | API operationId | 触发者 | 输入 | 副作用 |
|--------|-----------------|--------|------|--------|
| createProject | createProject | tenant_admin | name, type, buildingUnit, location... | 自动生成 accessCode、创建默认目录结构、记录操作日志 |
| updateProject | updateProject | project_admin | projectId, fields | 记录变更日志 |
| deleteProject | deleteProject | project_admin | projectId | 级联清理关联数据、记录操作日志 |
| archiveProject | archiveProject | project_admin | projectId | 状态变更为 project_archive、触发归档预检 |
| lockProject | (internal lifecycle) | project_admin | projectId | 锁定项目数据、禁止编制与上传；当前无独立 OpenAPI operationId |
| unlockProject | (internal lifecycle) | project_admin | projectId | 解锁项目、恢复编制与上传；当前无独立 OpenAPI operationId |
| joinProject | joinProject | any (持接入码) | accessCode, password | 校验接入码与密码、加入 ProjectMember |
| resetAccessPassword | resetProjectAccessPassword | project_admin | projectId | 重新生成接入密码 |
| addProjectMember | addProjectMember | project_admin | projectId, userId, role | 检查用户数配额、发送通知 |
| updateProjectMember | updateProjectMember | project_admin | memberId, role | 更新成员角色、刷新权限缓存 |
| removeProjectMember | removeProjectMember | project_admin | projectId, userId | 清理成员关联数据、记录操作日志 |
| updateProjectExtensions | updateProjectExtensions | project_admin | projectId, fields | 更新动态扩展字段 |

### 单位工程管理

| Action | API operationId | 触发者 | 输入 | 副作用 |
|--------|-----------------|--------|------|--------|
| createUnit | createUnit | project_admin | projectId, name, engType... | 初始化默认扩展字段 |
| updateUnit | updateUnit | project_admin | unitId, fields | 记录变更日志 |
| deleteUnit | deleteUnit | project_admin | unitId | 清理单体关联数据 |
| archiveUnit | (internal via UnitExtension) | project_admin | unitId | 通过单位工程扩展字段表达归档状态；当前无独立 OpenAPI operationId |
| unlockUnit | (internal via UnitExtension) | project_admin | unitId | 通过单位工程扩展字段恢复进行中状态；当前无独立 OpenAPI operationId |
| updateUnitExtensions | updateUnitExtensions | project_admin | unitId, fields | 更新单体动态扩展字段 |

### 档案编制

| Action | API operationId | 触发者 | 输入 | 副作用 |
|--------|-----------------|--------|------|--------|
| createCompilationInstance | createCompilationInstance | data_clerk | projectId, unitId, itemId | 初始化表单数据快照、记录编制日志 |
| updateCompilationInstance | updateCompilationInstance | data_clerk | instanceId, fields | 更新 lastModifiedAt / lastModifiedBy |
| deleteCompilationInstance | deleteCompilationInstance | data_clerk | instanceId | 清理表单数据、记录操作日志 |
| getCompilationFormData | (read — GET) | — | — | 只读，不作为 Action |
| updateCompilationFormData | updateCompilationFormData | data_clerk | instanceId, fieldKey → fieldValue | upsert 表单字段 |
| deleteCompilationFormField | deleteCompilationFormField | data_clerk | instanceId, fieldKey | 删除单个表单字段 |
| submitCompilationForSigning | (via SigningTask) | data_clerk | instanceId | 状态变为 signing、自动创建 SigningTask |
| completeCompilation | (lifecycle) | data_clerk | instanceId | 状态变为 completed、生成 Document 记录 |

### 档案著录 — Document

| Action | API operationId | 触发者 | 输入 | 副作用 |
|--------|-----------------|--------|------|--------|
| createDocument | createDocument | data_clerk | projectId, title, type... | 初始化文档记录 |
| updateDocument | updateDocument | data_clerk | documentId, fields | 记录版本变更 |
| deleteDocument | deleteDocument | data_admin | documentId | 清理关联审核记录 |
| submitDocumentForReview | submitDocumentForReview | data_clerk | documentId | 状态变更 under_review、通知指派审核人 |
| approveDocument | (via Review) | data_admin | documentId, comment | 状态变更 approved、触发后续签章或归档 |
| rejectDocument | (via Review) | data_admin | documentId, reason | 状态变更 rejected、通知创建者 |

### 档案著录 — UploadFile

| Action | API operationId | 触发者 | 输入 | 副作用 |
|--------|-----------------|--------|------|--------|
| uploadFile | uploadFile | data_clerk | projectId, file (binary) | 存储文件、提取文本(AI)、创建初始版本 |
| createUploadFile | createUploadFile | data_clerk | projectId, metadata | 创建上传文件元数据记录 |
| updateUploadFile | updateUploadFile | data_clerk | fileId, fields | 更新著录信息、记录操作日志 |
| deleteUploadFile | deleteUploadFile | data_admin | fileId | 清理文件与版本记录 |
| renameUploadFile | renameUploadFile | data_clerk | fileId, title | 更新文件题名 |
| replaceUploadFile | replaceUploadFile | data_clerk | fileId, file (binary) | 创建新版本快照、重新提取文本 |
| bulkSubmitUploadFiles | bulkSubmitUploadFiles | data_clerk | fileIds[], directoryUpdates | 批量提交文件进入签章/归档流程 |
| collectUploadFile | collectUploadFile | data_clerk | fileId | 标记为已采集、创建 CollectedItem |
| returnUploadFile | returnUploadFile | data_admin | fileId, reason | 状态变为 returned、记录退回原因 |
| catalogueFile | (embedded in update) | data_clerk | fileId, nodeId, title, metadata... | 著录信息补全、更新节点关联 |

### 审核流程

| Action | API operationId | 触发者 | 输入 | 副作用 |
|--------|-----------------|--------|------|--------|
| approveReview | approveReview | data_admin | reviewId, comment | 更新 Review 状态、更新 Document 状态、触发后续流程 |
| rejectReview | rejectReview | data_admin | reviewId, reason | 更新 Review 状态、更新 Document 状态、通知创建者 |

### 签章流程

| Action | API operationId | 触发者 | 输入 | 副作用 |
|--------|-----------------|--------|------|--------|
| createSigningTask | createSigningTask | data_admin | projectId, docId, flowMode, nodes | 创建 SigningTask + SigningNodes、校验印章有效性 |
| updateSigningTask | updateSigningTask | data_admin | taskId, fields | 修改签章编排参数 |
| deleteSigningTask | deleteSigningTask | data_admin | taskId | 清理签章节点、通知相关方 |
| updateSigningNode | updateSigningNode | data_admin | taskId, nodeId, fields | 调整签章节点配置 |
| executeSigning | (node update) | assignee | nodeId, credential | 验证证书有效性、更新节点状态为 signed、推进 task 流程 |
| rejectSigning | (node update) | assignee | nodeId, reason | 节点状态 rejected、任务状态 rejected、通知创建者 |
| completeSigningTask | (automatic) | system | taskId | 所有节点完成后自动触发、状态 completed |

### 归档管理

| Action | API operationId | 触发者 | 输入 | 副作用 |
|--------|-----------------|--------|------|--------|
| generateArchivePackage | packageProject | data_admin | projectId | 打包文件、生成 ZIP/OFD 包、更新存储用量 |
| createArchivePackage | createArchivePackage | data_admin | projectId, fields | 创建自定义归档包记录 |
| updateArchivePackage | updateArchivePackage | data_admin | packageId, fields | 更新归档包元数据 |
| deleteArchivePackage | deleteArchivePackage | data_admin | packageId | 清理归档包及关联文件 |
| submitArchivePackage | (lifecycle) | data_admin | packageId | 状态 submitted、通知验收方 |

### 采集项管理

| Action | API operationId | 触发者 | 输入 | 副作用 |
|--------|-----------------|--------|------|--------|
| createCollectionItem | createCollectionItem | data_clerk | projectId, itemId, fileType | 创建采集记录、检查去重 |
| updateCollectionItem | updateCollectionItem | data_clerk | itemId, fields | 更新采集状态 |
| deleteCollectionItem | deleteCollectionItem | data_admin | itemId | 清理采集记录 |
| collectArchiveItem | (via collectUploadFile) | data_clerk | projectId, itemId, fileType | 创建 CollectedItem、检查去重 |

### 合规预检

| Action | API operationId | 触发者 | 输入 | 副作用 |
|--------|-----------------|--------|------|--------|
| runPrecheck | runPrecheck | data_admin | projectId, options (skip*) | 执行完整性/格式/内容检查、生成 PrecheckIssue[]、记录统计 |
| rerunPrecheck | rerunPrecheck | data_admin | precheckId | 基于历史参数重新执行预检 |

### 邀请链接

| Action | API operationId | 触发者 | 输入 | 副作用 |
|--------|-----------------|--------|------|--------|
| createInviteLink | createInviteLink | project_admin | projectId, role, expiry, inviteRemark | 生成邀请码、设置失效策略 |
| revokeInviteLink | revokeInviteLink | project_admin | linkId | 链接状态 revoked、已加入成员不受影响 |
| refreshInviteLink | refreshInviteLink | project_admin | linkId | 重新生成邀请码 |
| acceptInvite | acceptInvite | any (登入用户) | code | 校验邀请码、创建 InviteMember + ProjectMember |
| addInviteMember | addInviteMember | project_admin | projectId, memberInfo | 手动添加受邀成员记录 |
| inviteMemberByLink | (deprecated — use acceptInvite) | any | inviteCode, name, unit | 校验邀请码、加入项目 |

### 印章管理

| Action | API operationId | 触发者 | 输入 | 副作用 |
|--------|-----------------|--------|------|--------|
| createSeal | createSeal | user | name, type | 创建印章认证申请、状态 pending |
| approveSeal | approveSeal | tenant_admin | sealId, validDays | 审批通过、设置有效期、状态 active |
| rejectSeal | rejectSeal | tenant_admin | sealId, reason | 审批拒绝、状态 revoked |
| updateSeal | updateSeal | user | sealId, fields | 更新印章信息 |
| deleteSeal | deleteSeal | user/tenant_admin | sealId | 删除印章记录 |

### 用户管理

| Action | API operationId | 触发者 | 输入 | 副作用 |
|--------|-----------------|--------|------|--------|
| createUser | createUser | tenant_admin | username, password, name, role | 密码哈希加盐、分配默认租户 |
| updateUser | updateUser | tenant_admin | userId, fields | 更新用户属性 |
| deleteUser | deleteUser | tenant_admin | userId | 清理用户关联数据 |
| resetUserPassword | resetUserPassword | tenant_admin | userId | 重置密码、强制下次登录修改 |
| bindUserTenant | bindUserTenant | super_admin | userId, tenantId | 将公共用户池用户绑定到租户 |
| registerUser | register | any (公开) | username, password, name, inviteCode | 注册 + 通过邀请码加入项目 |

### 部门管理

| Action | API operationId | 触发者 | 输入 | 副作用 |
|--------|-----------------|--------|------|--------|
| createDepartment | createDepartment | tenant_admin | name | 创建部门记录 |
| updateDepartment | updateDepartment | tenant_admin | deptId, name | 更新部门名称 |
| deleteDepartment | deleteDepartment | tenant_admin | deptId | 清理部门关联 |

### 企业管理

| Action | API operationId | 触发者 | 输入 | 副作用 |
|--------|-----------------|--------|------|--------|
| createEnterprise | createEnterprise | tenant_admin | name, type, creditCode | 创建参建企业记录 |
| updateEnterprise | updateEnterprise | tenant_admin | enterpriseId, fields | 更新企业信息 |
| deleteEnterprise | deleteEnterprise | tenant_admin | enterpriseId | 清理企业关联数据 |

### 模板管理

| Action | API operationId | 触发者 | 输入 | 副作用 |
|--------|-----------------|--------|------|--------|
| enableTemplate | enableTemplate | super_admin | templateId | 启用标准模板并同步到所有租户 |
| disableTemplate | disableTemplate | super_admin | templateId | 停用标准模板 |

### 目录模板

| Action | API operationId | 触发者 | 输入 | 副作用 |
|--------|-----------------|--------|------|--------|
| createCatalogTemplate | createCatalogTemplate | tenant_admin | name, projectType, fields | 创建目录模板 |
| updateCatalogTemplate | updateCatalogTemplate | tenant_admin | catalogId, fields | 更新目录模板元数据 |
| deleteCatalogTemplate | deleteCatalogTemplate | tenant_admin | catalogId | 级联删除节点树 |
| createCatalogTemplateNode | createCatalogTemplateNode | tenant_admin | templateId, parentId, name, type, formId | 添加目录节点 |
| updateCatalogTemplateNode | updateCatalogTemplateNode | tenant_admin | nodeId, fields | 更新节点配置 |
| deleteCatalogTemplateNode | deleteCatalogTemplateNode | tenant_admin | nodeId | 删除节点及子节点 |

### 模板范例

| Action | API operationId | 触发者 | 输入 | 副作用 |
|--------|-----------------|--------|------|--------|
| createTemplateExample | createTemplateExample | tenant_admin | templateId, name, data | 创建模板示例数据 |
| updateTemplateExample | updateTemplateExample | tenant_admin | exampleId, fields | 更新示例 |
| deleteTemplateExample | deleteTemplateExample | tenant_admin | exampleId | 删除示例 |
| updateTemplateInstructions | updateTemplateInstructions | tenant_admin | templateId, content | 更新模板填写说明 |
| updateTemplateAutofillConfig | updateTemplateAutofillConfig | tenant_admin | templateId, mapping | 更新模板自动填充配置 |

### 企业模板配置

| Action | API operationId | 触发者 | 输入 | 副作用 |
|--------|-----------------|--------|------|--------|
| createEnterpriseConfigTemplate | createEnterpriseConfigTemplate | tenant_admin | fields | 创建企业档案模板配置 |
| updateEnterpriseConfigTemplate | updateEnterpriseConfigTemplate | tenant_admin | configId, fields | 更新配置 |
| deleteEnterpriseConfigTemplate | deleteEnterpriseConfigTemplate | tenant_admin | configId | 删除配置 |

### 企业范本配置

| Action | API operationId | 触发者 | 输入 | 副作用 |
|--------|-----------------|--------|------|--------|
| createEnterpriseConfigParadigm | createEnterpriseConfigParadigm | tenant_admin | fields | 创建企业范本配置 |
| updateEnterpriseConfigParadigm | updateEnterpriseConfigParadigm | tenant_admin | paradigmId, fields | 更新范本 |
| deleteEnterpriseConfigParadigm | deleteEnterpriseConfigParadigm | tenant_admin | paradigmId | 删除范本 |

### 城建归档管理

| Action | API operationId | 触发者 | 输入 | 副作用 |
|--------|-----------------|--------|------|--------|
| createCityArchiveNode | createCityArchiveNode | tenant_admin | number, name, parentId | 创建城建档案馆目录节点 |
| updateCityArchiveNode | updateCityArchiveNode | tenant_admin | nodeId, fields | 更新节点 |
| deleteCityArchiveNode | deleteCityArchiveNode | tenant_admin | nodeId | 级联删除子节点 |
| createCityArchiveMapping | createCityArchiveMapping | tenant_admin | cityNodeId, projectNodeId | 建立城建 ↔ 项目目录映射 |
| deleteCityArchiveMapping | deleteCityArchiveMapping | tenant_admin | cityNodeId, projectNodeId | 解除映射 |

### 系统管理

| Action | API operationId | 触发者 | 输入 | 副作用 |
|--------|-----------------|--------|------|--------|
| createPosition | createPosition | super_admin | name, code | 创建岗位记录 |
| updatePosition | (not in OpenAPI) | super_admin | positionId, fields | 更新岗位 |
| deletePosition | (not in OpenAPI) | super_admin | positionId | 删除岗位 |
| createRole | createRole | super_admin | name, permissions | 创建角色 |
| updateRole | (not in OpenAPI) | super_admin | roleId, fields | 更新角色权限 |
| deleteRole | (not in OpenAPI) | super_admin | roleId | 删除角色 |
| createMenu | createMenu | super_admin | name, path, icon | 创建菜单项 |
| updateMenu | (not in OpenAPI) | super_admin | menuId, fields | 更新菜单 |
| deleteMenu | (not in OpenAPI) | super_admin | menuId | 删除菜单 |
| createDictionary | createDictionary | super_admin | name, code, items | 创建数据字典 |
| updateDictionary | (not in OpenAPI) | super_admin | dictId, fields | 更新字典项 |
| deleteDictionary | (not in OpenAPI) | super_admin | dictId | 删除字典 |
| createNotice | createNotice | super_admin | title, content | 创建通知公告 |
| updateNotice | (not in OpenAPI) | super_admin | noticeId, fields | 更新公告 |
| deleteNotice | (not in OpenAPI) | super_admin | noticeId | 删除公告 |
| createOperationLog | createOperationLog | (system) | action, module, ip | 记录操作审计日志 |

### AI 配置

| Action | API operationId | 触发者 | 输入 | 副作用 |
|--------|-----------------|--------|------|--------|
| saveAiConfig | saveAiConfig | authenticated | baseUrl, apiKey, model, isEnabled | 加密存储 API Key、upsert 用户配置 |
| deleteAiConfig | deleteAiConfig | authenticated | (per user) | 清除 AI 配置 |
| testAiConfig | testAiConfig | authenticated | (per user) | 调用 AI 服务测试连接 |

### 账号与安全

| Action | API operationId | 触发者 | 输入 | 副作用 |
|--------|-----------------|--------|------|--------|
| login | login | any (公开) | username, password | 密码验证、创建 Session、更新 lastLoginAt |
| logout | logout | authenticated | refreshToken (optional) | 销毁 Session（或全部 Session） |
| refreshToken | refreshToken | any (公开) | refreshToken | 验证有效期、发放新 access token |
| changePassword | changePassword | authenticated | oldPassword, newPassword | 验证旧密码、更新哈希、销毁旧 Session |
| createApiKey | createApiKey | authenticated | name, expiresAt | 生成 key、bcrypt 哈希存储 |
| revokeApiKey | revokeApiKey | authenticated | keyId | 状态 revoked |
| bindWechat | wechatBind | authenticated | openid, unionid, nickname | 绑定微信到现有用户 |
| updateUserPreference | upsertUserPreference | authenticated | key, value | upsert 用户偏好 |

### 签章流转（用户维度的跨项目签章执行）

| Action | API operationId | 触发者 | 输入 | 副作用 |
|--------|-----------------|--------|------|--------|
| executeSigning | signSealFlowNode | assignee | nodeId | 验证节点存在、assignee 匹配、status=pending、task 未完结、顺序校验；更新节点 status=signed；全部节点完成→任务 completed；否则自动推进 currentNodeIdx |

**签章流转状态机**:
```
SigningNode: pending ──► signed | rejected
SigningTask:  pending ──► in_progress ──► completed
                   └──► rejected
```

### 智能表单填充（跨域 AI 辅助服务）

| Action | API operationId | 触发者 | 输入 | 副作用 |
|--------|-----------------|--------|------|--------|
| getFormFillDefaults | (read — getFormFillDefaults) | authenticated | projectId | 从项目信息提取 7 个默认字段值（projectName/code/unit 等），confidence=1.0；只读函数，不改变状态 |
| getFormFillSuggestions | getFormFillSuggestions | authenticated | projectId, fileContent?, category? | 三源合并：项目默认值 → 历史频率（minConfidence=0.3）→ AI 推断，返回带 source 标注的建议 |
| getFormFillHistory | getFormFillHistory | authenticated | projectId, category?, minConfidence | 从 compilationFormDataTable 分析字段值频率 |
| inferFormFillFields | inferFormFillFields | authenticated | fileContent | 调用用户 AI 配置（GLM 模型），从文件内容提取元数据 |
| batchFormFill | batchFormFill | authenticated | projectId, files[] | 批量填充（≤50 文件），并行三源合并 |

### AI 文件分类

| Action | API operationId | 触发者 | 输入 | 副作用 |
|--------|-----------------|--------|------|--------|
| aiClassifyFile | aiClassifyFile | authenticated | fileBuffer, fileName, mimeType | AI 分类 + 降级链：AI 分类 → 文件名关键词 → 标记"未分类" |
| aiClassifyFilesBatch | aiClassifyFilesBatch | authenticated | files[] (≤10) | 批量分类，独立降级策略 |
| aiChat | aiChat | authenticated | messages[], options? | SSE 流式代理，支持工具调用 |
| aiTestConnection | aiTestConnection | authenticated | config? | 测试 AI 连接，记录 lastTestedAt |

### 审核智能提示

| Action | API operationId | 触发者 | 输入 | 副作用 |
|--------|-----------------|--------|------|--------|
| generateReviewHints | generateReviewHints | data_admin | documentId, projectId, content? | 规则引擎：风险检测（必填/日期/格式）+ 合规检查（必交文件/退回记录）+ 建议 |

### 档案著录补充操作

| Action | API operationId | 触发者 | 输入 | 副作用 |
|--------|-----------------|--------|------|--------|
| renameUploadFile | renameUploadFile | data_clerk | fileId, title | 更新文件题名，仅允许 pending/signed/returned 状态 |
| replaceUploadFile | replaceUploadFile | data_clerk | fileId, file (multipart) | 创建版本快照（title/fileName/fileSize/mimeType/storagePath）→ 插入 uploadFileVersionsTable → 替换文件 → 重新提取文本 |
| bulkSubmitUploadFiles | bulkSubmitUploadFiles | data_clerk | fileIds[], directoryUpdates[] | 逐文件校验（非 signing/collected、nodeId 必填）后批量提交 |
| collectUploadFile | collectUploadFile | data_admin | fileId | 状态 → collected，需 nodeId 已分配 |
| returnUploadFile | returnUploadFile | data_admin | fileId, reason | 状态 → returned，记录退回归因 |

### 微信集成

| Action | API operationId | 触发者 | 输入 | 副作用 |
|--------|-----------------|--------|------|--------|
| wechatLogin | wechatLogin | any | code | OAuth 换取 openid，查询或创建用户，下发 JWT |
| wechatBind | wechatBind | authenticated | openid, unionid, nickname | 绑定微信到现有用户 |
| wechatUnbind | wechatUnbind | authenticated | openid | 解绑微信 |

### 注册与公共用户池

| Action | API operationId | 触发者 | 输入 | 副作用 |
|--------|-----------------|--------|------|--------|
| registerWithInvite | register | any (公开) | username, password, name, inviteCode | 校验邀请码 → 事务：创建用户（tenantId=null）+ projectMember + inviteMember + 递增 usedCount → 发放 JWT |
| bindUserTenant | bindUserTenant | super_admin | userId, tenantId | 公共用户池用户（tenantId=null）→ 绑定到租户 |

### 项目接入机制

| Action | API operationId | 触发者 | 输入 | 副作用 |
|--------|-----------------|--------|------|--------|
| getProjectAccessCode | (read — getProjectAccessCode) | project_admin | projectId | 返回解密后的接入码和密码；只读能力，不改变状态 |
| resetAccessPassword | resetProjectAccessPassword | project_admin | projectId | 重新生成并加密接入密码 |
| joinProjectByCode | joinProject | any | accessCode, password | 解密+校验接入码和密码，加入 ProjectMember（joinMethod: access_code） |

### 单位工程归档机制

| Action | API operationId | 触发者 | 输入 | 副作用 |
|--------|-----------------|--------|------|--------|
| archiveUnit | (internal via UnitExtension) | project_admin | unitId | 通过 unitExtensionsTable 设置 fieldKey='状态' = '已归档'，禁止编制/上传 |
| unlockUnit | (internal via UnitExtension) | project_admin | unitId | 设置 fieldKey='状态' = '进行中'，恢复档案操作 |

---

## 总结

| 业务域 | Action 数量 | 对应 API 端点 |
|--------|------------|-------------|
| 租户管理 | 6 | /tenants |
| 项目管理 | 15 | /projects, /projects/{id}/members, /projects/{id}/extensions, /projects/join, /projects/{id}/access-code |
| 单位工程管理 | 8 | /projects/{id}/units |
| 档案编制 | 8 | /projects/{id}/instances |
| 档案著录 (Document) | 6 | /projects/{id}/documents |
| 档案著录 (UploadFile) | 15 | /projects/{id}/uploads |
| 审核流程 | 3 | /reviews |
| 签章流程 | 8 | /signing-tasks, /seal-flow |
| 归档管理 | 5 | /projects/{id}/archive, /projects/{id}/package, /projects/{id}/packages |
| 采集项管理 | 4 | /projects/{id}/collection/items |
| 合规预检 | 2 | /projects/{id}/prechecks |
| 邀请链接 | 7 | /projects/{id}/invites, /invite-links |
| 印章管理 | 5 | /seals |
| 用户管理 | 7 | /users |
| 部门管理 | 3 | /departments |
| 企业管理 | 3 | /enterprises |
| 模板管理 | 2 | /templates/{id}/enable, /templates/{id}/disable |
| 目录模板 | 6 | /catalog-templates |
| 模板范例 | 3 | /templates/{id}/extras/examples |
| 企业模板配置 | 3 | /enterprise-configs/templates |
| 企业范本配置 | 3 | /enterprise-configs/paradigms |
| 城建归档管理 | 5 | /city-archive |
| 系统管理 | 15 | /system/* |
| AI 配置 | 3 | /ai/config |
| AI 分类 | 4 | /ai/classify, /ai/chat, /ai/test |
| 智能表单填充 | 5 | /form-fill |
| 账号与安全 | 9 | /auth, /wechat |
| 微信集成 | 3 | /wechat |

**总计: 覆盖 OpenAPI 当前 125 个写操作端点，并补充少量内部生命周期语义动作。OpenAPI 中不存在的动作均以 internal 标注。**
