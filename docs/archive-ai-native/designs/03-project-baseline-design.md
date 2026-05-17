# 设计 03：项目基线

## 项目创建输入

必填：

- name。
- code。
- type。
- buildingUnit。
- constructionUnit。
- supervisionUnit。
- designUnit。
- location。
- tenantId。

可选：

- startDate。
- endDate。
- totalArea。
- description。
- ProjectExtension。

## 项目初始化流程

1. 用户创建项目。
2. 系统生成 accessCode / accessPassword。
3. 系统创建项目拥有者 ProjectMember。
4. 用户或 AI 建议单体工程。
5. 用户选择目录模板。
6. 系统生成项目生命周期基线。
7. 项目进入档案生产状态。

## AI 辅助点

项目总控 Agent 可以：

- 从项目说明中提取字段。
- 识别缺失字段。
- 根据项目类型建议目录模板。
- 根据总建筑面积、标段描述建议 Unit。
- 根据参建单位建议项目成员角色。

AI 不能：

- 自动创建项目成员。
- 自动分配高权限角色。
- 自动锁定或归档项目。

## 生命周期基线

```ts
type LifecycleStage =
  | "setup"
  | "template"
  | "compilation"
  | "cataloguing"
  | "review"
  | "signing"
  | "precheck"
  | "packaging"
  | "collection"
  | "archived";
```

项目创建后默认进入 `setup`。选择目录模板后进入 `template` 或 `compilation`。

## UI 表现

项目驾驶舱展示：

- 项目基础信息。
- 单体工程列表。
- 成员和角色。
- 当前生命周期阶段。
- 初始化缺失项。
- 下一步建议。

## 验收用例

1. 输入一段项目描述，AI 生成项目创建草案，但不直接提交。
2. 项目管理员确认后执行 `createProject`。
3. 项目创建后能继续创建 Unit。
4. Unit 归档后，对该 Unit 下的文件上传和编制动作被阻断。
