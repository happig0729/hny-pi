# 设计 09：归档采集

## 预检模型

CompliancePrecheck 包含：

- projectId。
- status。
- totalChecks。
- passedChecks。
- errorCount。
- warningCount。
- infoCount。
- issues。
- checkedFiles。
- duration。
- checkedBy。
- checkedAt。

Issue 应包含：

- severity。
- type。
- objectType。
- objectId。
- nodeId。
- message。
- evidence。
- suggestedAction。
- blocking。

## 预检类型

- 完整性：目录 file 节点是否有 Document 或 UploadFile。
- 格式：文件格式、页数、命名、必填字段。
- 内容：日期、责任者、题名、签章。
- 映射：项目目录是否映射城建标准。
- 状态：审核、签章、采集状态是否满足。

## 归档包生成条件

正式归档包生成前必须满足：

- 无 blocking issue，或 blocking issue 有明确豁免记录。
- 文件已著录。
- 需要签章的文件已 signed。
- 目录映射满足交付要求。
- 用户具备 data_admin 或更高权限。

## 采集记录

CollectedItem 记录：

- projectId。
- itemId。
- fileType。
- collectedAt。
- collectedBy。

采集类型：

- natural_collect。
- promise_transfer。
- natural_missing。
- shared_file。

## UI 设计

归档工作台包含：

- 预检得分。
- 阻断/警告/信息统计。
- 问题列表。
- 证据展开。
- 整改清单。
- 归档包草案。
- 采集状态表。

## Action Proposal

运行预检：

- Action Type：runPrecheck。
- 确认等级：低或中。

生成归档包：

- Action Type：generateArchivePackage。
- 确认等级：高。

项目归档锁定：

- Action Type：archiveProject。
- 确认等级：高。

## 验收用例

1. 项目缺少竣工验收备案表，预检返回 blocking issue。
2. 8 个文件未签章，归档包生成按钮不可执行。
3. 用户确认豁免自然缺失项，系统记录 EvidenceRef 和用户确认。
4. 归档包生成后 ArchivePackage 状态为 ready。
5. 采集同一 itemId 第二次时提示重复。
