# AI-Native 整改思路与计划

## 背景

当前 example 项目已经具备 AI 交互能力，但 AI-native 的目标不是在传统页面上外挂一个聊天入口，而是把 AI 作为系统核心能力来组织产品、交互、工具、上下文、治理和评估。

本次整改目标是把 Archive Manager 从“自然语言触发查询”逐步改造成“意图驱动、工具执行、过程可观测、结果可回放、质量可评估”的 AI-native 工作台。

## 整改目标

1. 用户通过自然语言表达任务，而不是只通过固定表单和按钮操作。
2. 系统能识别任务意图、判断风险、组装上下文并选择工具。
3. 所有后端业务能力通过 tool 进入 agent 工作流。
4. 工具调用过程可观察，包括状态、耗时、结果、错误和等待确认状态。
5. 写操作和高风险操作必须经过确认门禁。
6. AI 输出必须能渲染为结构化 A2UI 界面，而不是只输出文本。
7. 每次任务能保存、恢复和回放。
8. 通过治理检查和评估用例持续判断 AI 工作流质量。

## 总体架构思路

### 1. 产品层

将入口从“功能菜单优先”调整为“任务意图优先”：

- 首页保留自然语言任务输入。
- 快捷任务用于承载高频业务场景。
- 用户提交任务后进入 AI-native 任务中枢。
- 任务中枢展示意图、上下文、工具、执行时间线、治理结果和回归评估。
- A2UI surface 作为最终业务界面输出。

### 2. Agent 编排层

Agent 不只负责生成回答，而是负责编排完整任务：

- 接收用户自然语言任务。
- 识别业务意图和风险等级。
- 选择 `archive_api` 工具。
- 根据工具结果生成 A2UI 界面。
- 对写操作生成确认界面，等待用户确认后再执行。
- 将执行过程转成 trace。

### 3. Tool 层

将后端 OpenAPI 能力封装为统一工具：

- `list_operations`：按关键词或标签发现接口。
- `describe_operation`：查看接口参数、风险和请求体要求。
- `call_operation`：执行真实接口调用。
- 写操作和破坏性操作必须携带确认 key。

### 4. 上下文层

任务上下文不应完全依赖 prompt，而要结构化表达：

- 用户原始输入。
- 识别出的业务意图。
- 租户权限、工程档案本体、当前会话。
- 项目、审核、签章、归档等业务上下文标签。
- 工具调用 trace。
- A2UI 输出和 raw output。

### 5. 治理与评估层

治理分两层：

- 运行时治理：判断当前任务是否通过基本质量检查。
- 回归评估：将当前任务与预设场景用例匹配，检查断言是否通过。

## 当前已完成进展

### 1. AI-native 任务中枢

已在 `src/main.ts` 中增加任务画像：

- task id
- 用户 query
- intent
- risk
- context
- tools
- stage
- startedAt / updatedAt

当前支持的阶段：

- 理解意图
- 组装上下文
- 调用工具
- 生成界面
- 治理校验
- 阻塞状态

### 2. 紧凑搜索与结果态布局

已保留初始自然语言输入页，并在有任务结果后切换为顶部紧凑搜索栏：

- 当前任务继续展示在主区域。
- 用户可以直接输入新查询。
- 避免结果页回到大 hero 输入态。

### 3. 真实工具执行时间线

已接入 Agent 的工具事件：

- `tool_execution_start`
- `tool_execution_update`
- `tool_execution_end`

当前只追踪 `archive_api`，展示：

- operationId / mode
- method
- path
- risk
- HTTP status
- durationMs
- error
- running / success / error / waiting

写操作触发确认时会进入“等待确认”状态。

### 4. 任务持久化与回放

已将 AI-native task record 挂到 session 数据中保存。

保存内容包括：

- task profile
- tool trace
- raw LLM output
- A2UI messages
- surface count
- error state

加载历史 session 时会恢复：

- 任务中枢
- 工具执行时间线
- raw output
- A2UI surface

### 5. 治理校验面板

已新增运行时治理检查：

- 意图识别
- 工具选择
- 确认门禁
- 工具结果
- 界面渲染
- 回放能力

治理结果分为：

- 通过
- 警告
- 失败

### 6. 回归评估

已新增独立评估模块：

- `src/ai-native-evals.ts`
- `src/ai-native-eval-cases.ts`

当前评估场景包括：

- 仪表盘概览查询
- 项目档案查询
- 待审核任务查询
- 签章流转查询
- 归档预检分析
- 写操作确认门禁
- 通用档案任务

当前断言包括：

- 意图是否匹配
- 是否调用 `archive_api`
- 风险等级是否符合预期
- 是否正确触发确认门禁
- 是否生成 A2UI 输出

### 7. A2UI 输出质量治理

已将 A2UI 输出质量从“是否生成 messages/surface”升级为结构化诊断。

当前已覆盖：

- 校验 root component 是否存在。
- 校验 List.children 是否为 `{ componentId, path }`。
- 校验 List path 是否为绝对数据路径。
- 校验 List path 是否能在根数据模型中找到对应字段。
- 校验 action 是否包含 event.name。
- 校验 action 是否包含 event.context。
- 校验 `archive.confirmOperation` 是否包含 operationId、body、confirmationKey。
- 将 parse repair、fallback parse、partial JSON recover 纳入诊断。
- 将 normalize 修复纳入诊断，包括补 surfaceId、补 createSurface、修正 componentId/type/properties/components、补 root、修正 List children、补悬空引用等。
- 在治理面板展示 A2UI 质量诊断列表。
- 将 A2UI 输出诊断保存到 session task record，支持回放。

治理面板已展示：

- 匹配场景
- 场景总数
- 断言总数
- 通过数
- 观察数
- 失败数

## 当前文件变更概览

### 已修改

- `src/main.ts`
  - 增加任务画像。
  - 增加任务阶段推进。
  - 接入工具执行事件。
  - 增加 trace 持久化与回放。
  - 渲染任务中枢、治理面板和回归评估。

- `src/app.css`
  - 增加紧凑搜索栏样式。
  - 增加任务中枢样式。
  - 增加工具时间线样式。
  - 增加治理面板样式。
  - 增加回归评估和覆盖率样式。

### 已新增

- `src/ai-native-evals.ts`
  - 评估输入、结果、断言类型。
  - 当前任务评估函数。
  - 覆盖率统计。

- `src/ai-native-eval-cases.ts`
  - 评估场景数据。
  - 每个场景声明 intent、risk、tool、confirmation、surface 预期。

## 已验证内容

已多次运行并通过：

```bash
npm run check
```

说明：

- 当前检查只覆盖类型检查。
- 项目规则明确禁止运行 `npm run dev`。
- 当前未进行浏览器视觉验证。

## 尚未完成任务

### 1. 浏览器级验证

尚未完成：

- 打开页面检查布局。
- 验证桌面和移动端响应式效果。
- 验证 A2UI surface 恢复后是否完全可交互。
- 验证任务中枢和治理面板在真实模型输出下的视觉稳定性。

阻塞原因：

- 当前项目规则禁止运行 `npm run dev`。

### 2. 自动化评估测试

当前 evaluator 是运行时逻辑，尚未增加测试文件。

待完成：

- 为 `evaluateAiNativeTask` 增加单元测试。
- 覆盖只读查询、写操作、确认门禁、A2UI 输出失败等场景。
- 将回归评估从 UI 展示推进到 CI 可执行检查。

### 3. 评估样本扩展

当前评估场景仍是轻量 MVP。

待补充：

- 项目创建。
- 项目成员管理。
- 资料提交审核。
- 审核通过和驳回。
- 签章申请。
- 归档预检。
- 归档打包。
- 权限不足。
- 后端接口失败。
- 模型输出非 A2UI JSON。

### 4. Trace 存储结构标准化

当前 task record 挂在 session 数据扩展字段中。

待完成：

- 定义正式 task schema。
- 考虑单 session 多 task。
- 支持按 task id 查询。
- 支持导出 trace。
- 支持跨 session 评估统计。

### 5. Tool registry 标准化

当前主要围绕 `archive_api`。

待完成：

- 定义统一 tool registry。
- 为每个 tool 声明风险等级、幂等性、权限要求、确认策略。
- 支持非 `archive_api` 工具进入统一 trace。
- 支持 tool-level evaluator。

### 6. 确认门禁体验增强

当前确认门禁依赖模型生成 A2UI 确认 surface。

待完成：

- 前端提供统一确认组件或确认 action 渲染策略。
- 写操作 preview 标准化。
- 确认后记录确认人、确认时间、确认 payload。
- 取消后记录取消原因。

### 7. A2UI 输出质量治理深化

基础结构校验已完成。

待深化：

- 校验组件引用是否形成循环。
- 校验 action context 中的 path 引用是否能解析到当前 data model。
- 校验写操作确认 body 是否与 preview 字段一致。
- 校验 UI 复杂度，例如 root 下是否堆叠过多裸 Text、Card 密度是否过高。
- 将 A2UI 质量诊断接入 evaluator 单元测试。

### 8. 观测指标汇总

当前只在单任务中展示 trace。

待完成：

- 平均工具耗时。
- 失败率。
- 确认等待次数。
- A2UI 渲染失败次数。
- 每类 intent 的命中率。
- 每个 operation 的失败统计。

### 9. 文档和 README 同步

待完成：

- 更新 README 中的 AI-native 示例说明。
- 说明如何使用任务中枢。
- 说明治理面板含义。
- 说明评估用例维护方式。

### 10. 代码结构继续拆分

当前 `main.ts` 承载较多 UI 和状态逻辑。

待完成：

- 拆出 task state 模块。
- 拆出 governance 模块。
- 拆出 workbench renderer。
- 拆出 trace renderer。
- 保持 `main.ts` 只负责装配。

## 后续推荐实施顺序

### 阶段一：稳定 MVP

1. 增加 evaluator 单元测试。
2. 扩展 8 到 12 个评估场景。
3. 将治理检查和 eval 失败原因打磨清楚。
4. 在允许启动页面后做浏览器视觉验证。

### 阶段二：结构化治理

1. 抽出 task schema。
2. 支持一个 session 内保存多个 task。
3. 增加 trace 导出。
4. 增加 tool registry 风险声明。

### 阶段三：工程化回归

1. 将 eval cases 接入测试。
2. 加入模拟 task record。
3. 在 CI 中检查 evaluator。
4. 输出评估报告。

### 阶段四：产品化体验

1. 统一确认组件。
2. 增加任务历史和筛选。
3. 增加失败重试入口。
4. 增加治理详情展开。
5. 增加管理端评估统计。

## 风险与注意事项

1. 当前意图识别仍是前端启发式规则，后续应由模型输出结构化 intent 或由后端策略判断。
2. 当前回归评估只验证单次任务，不验证多轮任务。
3. 当前 session 扩展字段依赖 IndexedDB 保存额外属性，后续应正式扩展存储类型。
4. 当前 A2UI normalize 逻辑仍在 `main.ts` 中，复杂度较高，后续需要拆分。
5. 当前未做浏览器验证，CSS 需要在真实页面中再确认。
6. 当前 `.husky/pre-commit` 存在无关改动，不属于本次 AI-native 改造。

## 当前结论

本项目已经从“自然语言查询 demo”推进到 AI-native MVP：

- 有自然语言任务入口。
- 有任务画像。
- 有工具执行 trace。
- 有确认门禁状态。
- 有任务持久化和回放。
- 有运行时治理。
- 有回归评估用例和覆盖率显示。

下一步重点不是继续堆 UI，而是把评估和治理工程化：补测试、标准化 schema、扩展 eval cases、支持多 task 和 trace 导出。
