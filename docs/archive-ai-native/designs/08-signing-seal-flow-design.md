# 设计 08：签章流转

## 对象模型

SigningTask：

- projectId。
- sourceType。
- sourceId。
- flowMode。
- status。
- currentNodeIdx。
- createdBy。

SigningNode：

- taskId。
- assignee。
- sealResourceId。
- status。
- signedAt。
- rejectReason。

Seal：

- owner。
- type。
- status。
- validUntil。

## 流程模式

### Sequential

- 只有 currentNodeIdx 对应节点可签。
- 节点签完后推进到下一个节点。
- 全部节点签完后 SigningTask completed。

### Parallel

- 所有 pending 节点可同时签。
- 任一拒签可使任务 rejected。
- 全部 signed 后任务 completed。

## AI 辅助点

签章 Agent 可以：

- 推荐参与人。
- 推荐节点顺序。
- 检查印章状态。
- 解释阻塞原因。
- 生成催办建议。
- 生成拒签后的重新发起草案。

AI 不能：

- 替用户签章。
- 跳过顺序节点。
- 绕过印章有效性。
- 自动创建高风险签章任务。

## UI 设计

签章工作台包含：

- 任务列表。
- 节点流程图。
- 印章状态。
- 当前待签人。
- 阻塞解释。
- 催办动作。

## Action Proposal

创建签章任务：

- Action Type：createSigningTask。
- 确认等级：高。
- 影响对象：SigningTask、SigningNode、source object。

执行签章：

- Action Type：executeSigning。
- 确认等级：高。
- 影响对象：SigningNode、SigningTask。

## 验收用例

1. 创建 sequential 签章任务，节点 2 不能在节点 1 前签。
2. 节点 1 签完后 currentNodeIdx 推进。
3. 节点拒签后任务 rejected，系统生成整改和重发建议。
4. 用户印章 revoked，创建任务时提示不可用。
