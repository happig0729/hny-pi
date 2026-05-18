# 子计划 04：模板、目录与城建标准映射

## 目标

建立工程档案生产的标准目录、表单模板和城建档案馆交付标准映射，使文件著录、编制、预检和归档有统一结构。

## 范围

- Template。
- TemplateExample。
- TemplateInstruction。
- TemplateAutofillConfig。
- CatalogTemplate。
- CatalogTemplateNode。
- CityArchiveCatalogNode。
- CityArchiveMapping。
- EnterpriseTemplate。
- EnterpriseParadigm。

## 交付物

- 项目目录模板管理。
- 目录节点树管理。
- 表单模板绑定。
- 城建标准目录管理。
- 项目目录与城建标准映射。
- 企业模板和范本管理。
- Template Catalog Agent。

## 关键能力

- 项目可选择预置或自定义目录模板。
- file 类型目录节点可绑定表单模板。
- 项目目录节点可映射到城建档案馆目录节点。
- AI 可建议目录映射，但必须人工确认。
- 预检能检测未映射节点。

## 独立验证

- 新项目能选择目录模板并生成目录树。
- 修改目录节点后，文件著录候选目录同步变化。
- 未映射节点能在预检中被识别。
- 禁用模板后，新项目不可再选择，但历史项目不被破坏。

## 不包含

- 不处理具体文件上传。
- 不执行归档包生成。
