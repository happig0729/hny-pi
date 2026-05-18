# 设计 04：模板目录与标准映射

## 目录模型

CatalogTemplate 是项目档案目录模板。CatalogTemplateNode 构成树：

- `folder`：目录容器。
- `file`：可生产、上传、编制或归档的档案项。

file 节点可绑定 Template，用于在线编制和表单填报。

## 城建映射模型

CityArchiveCatalogNode 是城建档案馆标准目录。CityArchiveMapping 建立：

- cityNodeId -> projectNodeId。

映射用于：

- 文件分类推荐。
- 合规预检。
- 归档包目录生成。
- 移交标准对照。

## AI 辅助点

目录模板 Agent 可以：

- 根据项目类型推荐 CatalogTemplate。
- 解释节点含义。
- 根据节点名称、编号、历史项目建议 CityArchiveMapping。
- 发现重复节点、孤立节点、未绑定表单节点。
- 生成映射草案。

AI 不能：

- 自动删除目录节点。
- 自动启用或停用标准模板。
- 自动覆盖已有人工映射。

## UI 设计

模板目录工作台包含：

- 左侧目录树。
- 中间节点详情。
- 右侧 Agent 面板。
- 底部映射差异和预检影响。

节点详情展示：

- 节点名称。
- 节点类型。
- 父节点。
- 排序。
- 绑定表单模板。
- 城建映射。
- 关联文件数量。

## 验收用例

1. 创建 CatalogTemplate 后能添加 folder 和 file 节点。
2. file 节点绑定 Template 后，编制工作台能创建 CompilationInstance。
3. AI 推荐 10 条 CityArchiveMapping，用户确认 8 条，剩余 2 条进入未映射清单。
4. 归档预检能显示未映射节点对归档包的影响。
