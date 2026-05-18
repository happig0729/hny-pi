# 设计 05：文件著录

## 文件进入流程

1. 用户上传文件。
2. 系统创建 UploadFile。
3. 系统创建 UploadFileVersion。
4. FileParser 提取文本和元数据。
5. AiClassifier 分类。
6. 系统生成著录建议。
7. 用户确认或复核。
8. 文件进入已著录、审核、签章或归档准备状态。

## 分类回退链

```text
AI 分类 -> 文件名关键词匹配 -> unclassified
```

规则：

- AI 置信度高于阈值：进入可批量确认。
- AI 置信度中等：进入建议抽检。
- AI 置信度低或解析失败：进入人工复核。
- 文件名规则命中但 AI 不确定：显示规则来源。

## 著录字段

推荐字段：

- title。
- fileType。
- nodeId。
- nodeLabel。
- carrier。
- compiler。
- compileDate。
- responsible。
- copies。
- pages。
- remarks。

每个字段都应带来源：

- extracted_text。
- filename_rule。
- ai_inference。
- project_default。
- manual。

## 批处理 UI

文件中台采用：

- 左侧目录树。
- 中间文件列表。
- 右侧当前 Agent。
- 批量确认栏。

列表列：

- 文件名。
- 类型。
- 解析状态。
- AI 建议目录。
- 字段建议。
- 置信度。
- 状态。
- 操作。

## Action Proposal

批量著录必须显示：

- 文件数量。
- 高/中/低置信度数量。
- 将写入字段。
- 对应 Action Type。
- operationId。
- 可撤销或修正方式。

## 验收用例

1. 上传 `施工组织设计.pdf`，AI 推荐目录为“施工文件 / 施工组织设计”，置信度 90% 以上。
2. 上传模糊扫描图片，OCR 噪声高，进入人工复核。
3. 执行批量著录后，OperationLog 记录文件数量和字段摘要。
4. 替换文件后，UploadFileVersion 增加，当前文件状态重新进入解析和分类。
