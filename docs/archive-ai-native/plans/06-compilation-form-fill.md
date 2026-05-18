# 子计划 06：档案编制与智能表单填充

## 目标

支持在线编制、模板表单、字段填充、编制完成和正式档案对象生成，减少资料员重复录入和漏填。

## 范围

- CompilationInstance。
- CompilationFormData。
- Document。
- Template。
- TemplateInstruction。
- TemplateAutofillConfig。
- FormFillService。
- Compilation Agent。

## 交付物

- 编制实例创建。
- 表单字段编辑。
- 自动填充建议。
- 字段来源和置信度。
- 历史填写复用。
- 编制完成。
- 提交审核或签章。

## 关键能力

- 从 CatalogTemplateNode 创建 CompilationInstance。
- 根据 Template 渲染表单。
- 自动填充策略：项目默认值、历史记录、AI 推断、人工确认。
- 字段级保留来源、置信度、修改人。
- 完成编制后生成 Document 或进入签章流程。

## 独立验证

- 创建编制实例后能保存 CompilationFormData。
- 项目默认字段自动填充。
- AI 推断字段低置信度时需要人工确认。
- 人工修改字段后，不被 AI 自动覆盖。
- 编制完成后能进入审核或签章链路。

## 不包含

- 不处理上传文件版本。
- 不决定最终审核是否通过。
