# 设计 07：审核整改

## 审核对象

审核对象包括：

- Document。
- UploadFile。

审核记录 Review 关联文档，并记录：

- assignedTo。
- submittedBy。
- status。
- comment。
- reviewedAt。

## 审核流程

```text
draft/catalogued -> under_review -> approved
                                -> rejected -> rectifying -> under_review
```

实际状态字段以后端对象为准，但 UI 必须表达完整闭环。

## AI 风险提示

ReviewHintGenerator 输出：

- risk type。
- severity。
- object reference。
- evidence。
- suggestion。
- whether blocking。

风险类型：

- required_field_missing。
- invalid_date。
- format_mismatch。
- signing_missing。
- catalog_mapping_missing。
- duplicate_file。
- previous_rejection_unresolved。

## UI 设计

审核工作台包含：

- 左侧审核队列。
- 中间文件预览。
- 右侧风险提示和意见草稿。
- 顶部通过、退回、保存意见。

问题标注必须能定位到：

- 文件文本片段。
- 字段。
- 目录节点。
- 模板规则。
- 历史审核记录。

## AI 边界

AI 可以：

- 生成风险提示。
- 生成审核意见草稿。
- 建议整改清单。

AI 不能：

- 自动点击通过。
- 自动点击退回。
- 代替审核人承担意见。

## 验收用例

1. 文件日期非法，AI 标记为阻断项。
2. 文件缺监理签章，AI 标记为整改项。
3. 审核人采用 AI 草稿后退回，Review 记录审核人和意见。
4. 资料员整改后重新提交，审核历史保留两次记录。
