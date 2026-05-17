# 设计 06：编制填报

## 编制对象关系

- CatalogTemplateNode(file) 绑定 Template。
- 用户从 file 节点创建 CompilationInstance。
- 表单字段写入 CompilationFormData。
- 编制完成后生成或关联 Document。

## 自动填充策略

字段建议来源按优先级合并：

1. 项目默认值。
2. 单体默认值。
3. TemplateAutofillConfig。
4. 历史填写记录。
5. AI 推断。
6. 人工输入。

人工输入优先级最高，后续 AI 建议不能静默覆盖。

## 字段状态

字段应支持：

- empty。
- suggested。
- confirmed。
- manually_changed。
- low_confidence。
- conflict。

## UI 设计

编制工作台包含：

- 左侧目录或编制实例列表。
- 中间表单/文档预览。
- 右侧字段建议和 Agent。
- 顶部保存、提交审核、发起签章。

字段展示：

- 字段名称。
- 当前值。
- 来源。
- 置信度。
- 证据。
- 采用/忽略/编辑。

## Action Proposal

保存表单：

- Action Type：updateCompilationFormData。
- 影响对象：CompilationInstance、CompilationFormData。
- 确认等级：低。

完成编制：

- Action Type：completeCompilation。
- 影响对象：CompilationInstance、Document。
- 确认等级：中。

## 验收用例

1. 创建“单位工程质量竣工验收记录”编制实例。
2. 系统自动填充工程名称、施工单位、监理单位。
3. AI 推荐验收结论，但标明来源为历史高频 + 推断。
4. 用户修改项目负责人字段后，再次运行填充不覆盖该字段。
5. 完成编制后生成 Document 并进入审核队列。
