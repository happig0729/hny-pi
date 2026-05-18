# CLAUDE.md

本文件为 Claude Code（claude.ai/code）在此仓库中工作提供指导。

## 项目概述

`pi-archive-manager`（"Archive AI OS"），一个 AI 原生的建设工程档案全生命周期管理 SPA。属于 `pi-monorepo` 的一部分，位于 `packages/web-ui/example-archive/`。

应用渲染一个多工作台仪表盘（覆盖从项目立项到归档采集的 7 个生命周期阶段），并集成 AI Agent 面板。Agent 由领域本体（Ontology）驱动——本体定义了对象、关系、动作、策略和生命周期阶段，AI 通过本体对后端数据进行推理，而非自由对话。

**技术栈**：Lit（Web Components）+ TypeScript + Vite + Tailwind CSS v4。使用 `@mariozechner/mini-lit` 进行响应式渲染，`@earendil-works/pi-agent-core` 作为 Agent 运行时，`@earendil-works/pi-web-ui` 提供共享的 ChatPanel/存储组件。

## 核心参考资料

### API 规范：`api-spec/openapi.yaml`

后端 API 的权威数据源（OpenAPI 3.1.0），共 **200 个 operationId**，覆盖 18 个标签域：

| 标签 | 域 | 说明 |
|------|-----|------|
| `projects`, `units` | 项目管理 | 项目、单位工程 CRUD |
| `documents` | 资料编制 | 在线资料创建、编辑、提交审核 |
| `reviews` | 审核流程 | 审核通过/退回 |
| `archives` | 档案管理 | 归档包、采集项、预检 |
| `templates` | 模板管理 | 目录模板、表单模板、企业配置 |
| `auth` | 认证授权 | 登录、注册、Token 刷新 |
| `seals` | 印章认证 | 印章管理、签章流程节点 |
| `tenants`, `users` | 多租户 | 租户管理、用户管理、部门、角色 |
| `ai`, `form-fill` | AI 助手 | AI 聊天、文件分类、智能表单填充 |
| `compliance-precheck` | 归档合规预检 | 预检执行、重跑 |
| `api-keys` | API Key 管理 | 创建、吊销 |
| `wechat` | 微信小程序 | 微信登录、绑定 |
| `system` | 系统管理 | 公告、字典、操作日志、菜单 |
| `health`, `metrics` | 运维 | 健康检查、Prometheus 指标 |

**与前端代码的关系**：
- `archive-api.ts` 通过 `API_ENDPOINTS`（来自 `@earendil-works/pi-web-ui`）调用后端，该常量由 `api-spec/orval.config.ts` 从 `openapi.yaml` 自动生成
- `archive-operation-policy.ts` 中的 17 个只读 `operationId` 是 OpenAPI 端点的子集——新增只读端点时需同步更新
- 前端的 `OntologyActionType` 通过 `operationId` 字段与 OpenAPI 的写操作端点绑定（如 `rejectReview` → `POST /reviews/{reviewId}/reject`）

### 本体模型：`ontology/index.md`

本体的入口索引，基于 **五要素模型**（Object Types / Link Types / Action Types / Functions / Interfaces），以 `openapi.yaml` 为后端真实能力权威数据源。

三层架构关系：
- `openapi.yaml`：后端事实源，定义真实 operationId、路径、方法
- `ontology/`：语义层，解释 OpenAPI 能力背后的业务对象、关系、动作、函数和治理规则
- 前端 `OntologyRuntime`：当前工作台的可执行子集，只覆盖页面需要推理的对象和动作

本体文档导航（共 14 个文档）：

| 文档 | 覆盖内容 |
|------|----------|
| `01-organization-identity.md` | 组织架构域 + 用户与身份域（7 个对象） |
| `02-project-management.md` | 项目管理域（5 个对象） |
| `03-document-lifecycle.md` | 档案编制域 + 档案著录域（5 个对象） |
| `04-template-catalog.md` | 模板与目录域 + 企业配置域（9 个对象） |
| `05-review-signing.md` | 审核与签章域（4 个对象） |
| `06-archive-collection.md` | 归档与采集域（2 个对象） |
| `07-ai-compliance.md` | AI 与合规域（2 个对象） |
| `08-invitation-system.md` | 邀请与接入域 + 系统管理域（7 个对象） |
| `09-cross-domain-services.md` | 跨域服务域（表单填充、文件解析、AI分类、签章流转、个人工作台，6 个对象） |
| `link-types.md` | 65+ 条对象间语义链接关系 |
| `action-types.md` | OpenAPI 写操作端点映射 + 内部生命周期语义动作 |
| `functions.md` | 29 个核心服务端函数 |
| `interfaces.md` | 11 个跨域共享接口 |
| `security-governance.md` | 权限模型、数据隔离、审计日志 |

**与前端代码的关系**：
- `ontology-runtime.ts` 中的 `ontologyManifest` 是本体模型的前端运行时子集（14 个核心对象类型、7 条关系、8 个动作类型、8 条策略），不等同于完整本体
- 修改 `ontology/` 文档时，应同步检查 `ontology-runtime.ts` 是否需要更新
- `workspace-definitions.ts` 中每个工作台的 `ontologyScope` 字段引用了本体中的对象类型名称

## 命令

```bash
npm run dev        # Vite 开发服务器，端口 5184，/api 代理到 VITE_API_PROXY_TARGET
npm run build      # Vite 生产构建
npm run check      # TypeScript 类型检查（tsgo --noEmit）
npm run clean      # 清理 dist/
```

在 monorepo 根目录下：
```bash
npm run check      # biome 代码检查/格式化 + tsgo + 浏览器冒烟检查（代码修改后运行）
./test.sh          # 运行所有测试（无 API Key 时跳过依赖 LLM 的测试）
```

**重要**：根目录的 `npm run check` 需要先执行 `npm run build`（web-ui 使用 tsc 需要依赖包的 `.d.ts` 文件）。除非用户明确要求，否则不要从根目录运行 `npm run dev`、`npm run build` 或 `npm test`。

## 架构

### 源文件角色

| 文件 | 角色 |
|------|------|
| `main.ts` | 应用入口（37 行），编排 `renderApp()`、`initApp()`，设置渲染回调 |
| `app-state.ts` | 全局状态管理：配置、API 客户端、存储、工作台切换、数据刷新、Agent 快照构建 |
| `archive-agent.ts` | Agent 生命周期：`setupArchiveAgent()` 创建 Agent/ChatPanel 并写入 app-state |
| `config.ts` | 从 Vite 环境变量加载配置 |
| `labels.ts` | 纯函数模块：业务对象标签、状态标签、角色标签、证据来源标签等中文本地化映射 |
| `render-utils.ts` | 纯渲染工具：`icon()`、`formatDate()`、`formatFileSize()`、`renderEmptyState()` |
| `render-layout.ts` | 布局渲染：`renderTopbar()`、`renderSidebar()`、`renderMain()`、工作台路由 |
| `render-workspaces.ts` | 工作台主体渲染：共享指标/生命周期/问题表/动作草案组件 + 7 个工作台特定视图 |
| `render-tables.ts` | 表格渲染：编制表、资料表、归档包表、采集项表、上传文件目录树 |
| `render-agent-panel.ts` | Agent 面板渲染：建议/证据/办理 三个 Tab + Agent 工作台 |
| `workspace-definitions.ts` | 7 个生命周期工作台定义，包含 Agent 角色、本体范围、生命周期上下文默认值 |
| `ontology-runtime.ts` | **核心本体清单与运行时**：14 个对象类型、7 条链接类型、8 个动作类型、4 个接口、10 个生命周期阶段、8 条动作策略。`OntologyRuntime` 类负责推断生命周期阶段、权限校验、证据需求验证 |
| `archive-ontology-analysis.ts` | 通过本体视角分析后端数据——为任意工作台+数据组合生成指标、问题、证据引用和动作草案 |
| `archive-api.ts` | REST API 客户端（JWT 认证）。`loadArchiveDashboardData()` 通过 `Promise.all` 并行获取所有工作台数据 |
| `archive-agent-tools.ts` | 两个 AI Agent 工具：`archive_context`（读取当前工作台本体快照）和 `archive_api_read`（只读 API 调用） |
| `archive-operation-policy.ts` | 17 个只读 `operationId` 白名单，确保 Agent 的 API 工具无法调用写操作 |
| `app.css` | 基于 Tailwind 的全局样式 |

### 数据流与模块依赖

1. **配置加载** → `config.ts` 读取 Vite 环境变量 → `app-state.ts` 初始化 API 客户端和存储
2. **API 认证** → `archive-api.ts` 登录，存储 JWT Token
3. **数据获取** → `refreshData()` 在 `app-state.ts` 中，通过 `Promise.all` 并行获取全部实体数据
4. **本体分析** → `archive-ontology-analysis.ts` 将原始数据处理为指标、问题、证据引用和动作草案
5. **Agent 上下文** → `app-state.ts` 中的 `getArchiveAgentSnapshot()` 打包分析结果为 Agent 工具快照
6. **渲染回调** → `main.ts` 通过 `setRenderCallback(renderApp)` 注入渲染函数，`app-state.ts` 的 `setActiveWorkspace()`/`refreshData()` 通过回调触发重渲染
7. **UI 渲染** → `render-layout.ts`（布局）→ `render-workspaces.ts`（工作台内容）→ `render-tables.ts`（表格组件），`render-agent-panel.ts` 独立渲染 Agent 面板

### Agent 架构

AI Agent 通过 `@earendil-works/pi-agent-core` 的 `Agent` 类在浏览器内运行，使用 DeepSeek V4 Flash 作为 LLM。每次切换工作台或刷新数据时，Agent 的系统提示词会重建，注入当前工作台角色、本体上下文和后端数据快照。Agent 有两个工具（`archive_context` 和 `archive_api_read`），设计上均为只读——写操作需要人工确认。

### 关键类型

- `OntologyObjectType` — 14 个领域对象（Project、Unit、Document、UploadFile、Review、SigningTask 等）
- `OntologyActionType` — 8 个业务动作（createProject、bulkSubmitUploadFiles、rejectReview、packageProject 等）
- `LifecycleStage` — 10 个阶段（setup → template → compilation → cataloguing → review → signing → precheck → packaging → collection → archived）
- `WorkspaceId` — 7 个工作台标识符
- `ArchiveDashboardData` — 项目全部后端数据的聚合类型
- `ArchiveOntologyAnalysis` — 计算后的分析输出（指标、问题、证据、动作草案）

## Monorepo 约定

完整规则见 monorepo 根目录的 `AGENTS.md`。要点：
- 提交、Issue、PR 评论、代码中不使用 emoji
- 除非绝对必要，不使用 `any` 类型
- 不使用内联导入（`await import(...)`）
- 代码修改后：从根目录运行 `npm run check`，修复所有 errors/warnings/infos
- 除非用户明确要求，不主动提交代码
- `npm run check` 不会运行测试
