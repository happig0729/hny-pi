# 子计划 08：签章流转与印章治理

## 目标

支持电子签章从流程设计、发起、待签、完成、拒签到重新发起的完整闭环。

## 范围

- Seal。
- SigningTask。
- SigningNode。
- CompilationInstance。
- UploadFile。
- sequential / parallel 流程。
- 个人待签聚合。
- 拒签处理。
- Signing Agent。

## 交付物

- 印章认证和状态展示。
- 签章任务创建。
- 签章节点配置。
- 顺序/并行签章流转。
- 待签工作台。
- 拒签整改和重发。
- 签章审计。

## 关键能力

- 对可签章对象创建 SigningTask。
- 支持 sequential 和 parallel。
- sequential 按 currentNodeIdx 推进。
- parallel 等待全部节点完成。
- 验证 assignee、seal 状态、任务状态。
- AI 推荐流程，但不能代签。

## 独立验证

- 顺序签章中，后续节点不能提前签。
- 并行签章中，所有节点签完后任务完成。
- 拒签后任务进入 rejected，并可生成重发方案。
- 印章过期或 revoked 时不能使用。

## 不包含

- 不实现具体 CA 厂商接口细节。
- 不决定审核是否通过。
