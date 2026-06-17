# Scenix 技术设计文档

> 版本: 1.2
> 更新日期: 2026-04-22

---

## 1. 系统概述

Scenix 是一个基于 Midscene.js 和 Appium 的 AI 驱动 UI 自动化测试平台。平台支持 Web、Android、iOS 三端测试，用户通过自然语言描述测试步骤，由 AI Agent 自动执行操作与断言。

### 1.1 核心能力

| 能力 | 说明 |
|------|------|
| 自然语言测试 | 以自然语言（中/英文）描述测试步骤，AI 自动解析并执行 |
| 多平台支持 | Web（Playwright）、Android（ADB）、iOS（WebDriverAgent） |
| 持久化存储 | SQLite 数据库，服务重启不丢失测试用例和执行记录 |
| 实时状态推送 | SSE（Server-Sent Events）实时推送测试执行状态到前端 |
| AI 模型配置 | 集中管理，支持 OpenAI / Qwen / Anthropic 等多 Provider 预设 |
| 套件执行模型 | 测试用例按套件顺序执行，生成套件总报告与子用例报告 |
| 队列调度 | 执行记录先进入 `queued`，再由调度器按资源策略出队 |
| 环境诊断 | `/api/readiness` 汇总 AI、Chromium、Android SDK、iOS/WDA readiness |

### 1.2 技术栈

```
前端:  React 18 + Ant Design + TypeScript + Vite
后端:  Express.js + TypeScript + better-sqlite3
核心:  Midscene.js (@midscene/web, @midscene/android) + Appium (WebDriverIO)
构建:  pnpm workspace monorepo
```

---

## 2. 系统架构

### 2.1 整体架构

```
┌──────────────────────────────────────────────────────┐
│                    Browser (React)                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│  │ Dashboard │  │ TestRun  │  │ Reports  │  ...      │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘           │
│       │              │              │                 │
│       └──────┬───────┴──────┬───────┘                 │
│              │              │                         │
│         REST API       EventSource (SSE)              │
└──────────────┬──────────────┬─────────────────────────┘
               │              │
┌──────────────┴──────────────┴─────────────────────────┐
│                  Express Server                        │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐        │
│  │ test-cases │ │ test-suites│ │ test-runs  │        │
│  │   Router   │ │   Router   │ │   Router   │        │
│  └─────┬──────┘ └─────┬──────┘ └────┬──────┘        │
│        │           │   │               │              │
│        ▼           ▼   │               ▼              │
│  ┌──────────┐          │         ┌──────────────┐     │
│  │  SQLite  │          │         │  Event Bus   │     │
│  │   (DB)   │          │         │  (SSE 广播)  │     │
│  └──────────┘          │         └──────────────┘     │
│                        ▼                              │
│               ┌──────────────┐                        │
│               │  TestRunner  │  (core 包)             │
│               └───┬───┬───┬──┘                        │
│                   │   │   │                           │
│                   ▼   ▼   ▼                           │
│             Web  Android  iOS                         │
│            Agent  Agent  Agent                        │
└───────────────────────────────────────────────────────┘
```

### 2.2 Monorepo 工程结构

```
scenix/
├── client/                 # 前端 React 应用
│   ├── src/
│   │   ├── components/     # 通用组件
│   │   ├── pages/          # 页面组件 (Dashboard, TestRun, Reports, ...)
│   │   ├── hooks/          # 自定义 Hooks (useSSE)
│   │   ├── services/       # API 调用层
│   │   ├── App.tsx
│   │   └── main.tsx
│   └── package.json
├── server/                 # 后端 Express 服务
│   ├── src/
│   │   ├── db/             # 数据库初始化与工具函数
│   │   ├── sse/            # SSE 事件总线
│   │   ├── routes/         # API 路由
│   │   │   ├── test-cases.ts
│   │   │   ├── test-suites.ts
│   │   │   ├── test-runs.ts
│   │   │   ├── events.ts
│   │   │   └── devices.ts
│   │   ├── services/       # 设备发现、执行协调、报告绑定、运行读模型
│   │   │   ├── run-coordinator.ts
│   │   │   ├── run-execution-service.ts
│   │   │   ├── run-read-service.ts
│   │   └── index.ts        # 服务入口
│   └── package.json
├── core/                   # 测试执行核心库
│   ├── src/
│   │   ├── agents/         # 平台 Agent (Web/Android/iOS/Appium)
│   │   ├── config/         # AI 模型配置
│   │   ├── device/         # 设备管理
│   │   ├── runner/         # TestRunner 统一执行器
│   │   └── index.ts
│   └── package.json
├── tests/                  # 测试用例示例
├── .env.example            # 环境变量模板
├── pnpm-workspace.yaml     # pnpm workspace 配置
└── package.json            # 根包配置
```

---

## 3. 数据库设计

### 3.1 技术选型

使用 **SQLite**（通过 `better-sqlite3`）作为嵌入式数据库：

- 零配置部署，无需独立数据库进程
- 同步 API 与 Node.js 单线程模型契合
- WAL 模式支持并发读写
- 单文件存储，便于备份与迁移

### 3.2 表结构

#### test_cases 表

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PRIMARY KEY | UUID v4 |
| name | TEXT | NOT NULL | 用例名称 |
| platform | TEXT | NOT NULL, CHECK | 平台: web / android / ios |
| steps | TEXT | NOT NULL | 测试步骤（自然语言，换行分隔） |
| created_at | TEXT | NOT NULL, DEFAULT | ISO 8601 创建时间 |
| updated_at | TEXT | NOT NULL, DEFAULT | ISO 8601 更新时间 |

#### test_suites 表

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PRIMARY KEY | UUID v4 |
| name | TEXT | NOT NULL | 套件名称 |
| platform | TEXT | NOT NULL, CHECK | 平台: web / android / ios |
| created_at | TEXT | NOT NULL, DEFAULT | ISO 8601 创建时间 |
| updated_at | TEXT | NOT NULL, DEFAULT | ISO 8601 更新时间 |

#### test_suite_cases 表

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| suite_id | TEXT | PK/FK | 关联套件 ID |
| test_case_id | TEXT | PK/FK | 关联用例 ID |
| sort_order | INTEGER | NOT NULL | 套件内执行顺序 |

#### test_runs 表

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PRIMARY KEY | UUID v4 |
| test_case_id | TEXT | NOT NULL, FK | 首个子用例 ID（兼容历史查询） |
| test_case_name | TEXT | NOT NULL | 首个子用例名称（兼容历史查询） |
| suite_id | TEXT | NULLABLE | 关联套件 ID |
| suite_name | TEXT | NULLABLE | 套件名称 |
| platform | TEXT | NOT NULL | 执行平台 |
| device_id | TEXT | NULLABLE | 设备 ID（移动端） |
| status | TEXT | NOT NULL, CHECK | queued / pending / running / passed / failed / error |
| queued_at | TEXT | NULLABLE | 入队时间 |
| dispatched_at | TEXT | NULLABLE | 调度器正式接纳并开始执行的时间 |
| started_at | TEXT | NOT NULL | 兼容历史字段；新数据与 `dispatched_at` 保持一致 |
| finished_at | TEXT | NULLABLE | 结束时间 |
| report_path | TEXT | NULLABLE | 报告文件路径 |
| error_message | TEXT | NULLABLE | 错误信息 |

#### test_run_items 表

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PRIMARY KEY | UUID v4 |
| test_run_id | TEXT | NOT NULL, FK | 关联 test_runs |
| test_case_id | TEXT | NOT NULL, FK | 子用例 ID |
| test_case_name | TEXT | NOT NULL | 子用例名称 |
| platform | TEXT | NOT NULL | 子用例平台 |
| status | TEXT | NOT NULL, CHECK | queued / pending / running / passed / failed / error |
| started_at | TEXT | NOT NULL | 子用例开始时间 |
| finished_at | TEXT | NULLABLE | 子用例结束时间 |
| report_path | TEXT | NULLABLE | 子用例报告路径 |
| error_message | TEXT | NULLABLE | 子用例错误信息 |
| sort_order | INTEGER | NOT NULL | 套件内顺序 |

#### 读模型补充字段

`TestRun` 为 API 返回对象时，`queued` 任务还会附带两个非持久化字段：

- `queuedAt`: 运行记录入队时间；若是历史数据则回退到兼容时间字段
- `dispatchedAt`: 调度器接纳时间；若是历史数据则回退到兼容时间字段
- `queuePosition`: 当前资源上的排队顺位（Web 全局槽位或指定移动设备）
- `blockedReason`: 当前阻塞原因，例如等待 Web 槽位、等待设备空闲、等待同资源前序任务、设备断开或等待调度器接管

#### 索引

```sql
CREATE INDEX idx_runs_case_id ON test_runs(test_case_id);
CREATE INDEX idx_runs_status  ON test_runs(status);
CREATE INDEX idx_runs_status_queued_at ON test_runs(status, queued_at);
CREATE INDEX idx_runs_status_dispatched_at ON test_runs(status, dispatched_at);
CREATE INDEX idx_suite_cases_suite_id ON test_suite_cases(suite_id);
CREATE INDEX idx_run_items_run_id ON test_run_items(test_run_id);
```

### 3.3 迁移策略

- 使用 `schema_migrations` 表记录已应用的 migration
- 新库通过顺序执行 migration 直接创建到最新结构
- 旧库通过幂等 migration 平滑补齐新列、索引和状态约束
- `queued_at / dispatched_at` 的回填规则会尽量复用已有 `started_at`，保证历史数据可读
### 3.4 命名映射

数据库列名采用 `snake_case`，API 返回 `camelCase`。通过 `toCamelCase()` 工具函数在路由层统一转换，保持前端接口形状不变。

```
DB:  test_case_id  →  API: testCaseId
DB:  created_at    →  API: createdAt
DB:  error_message →  API: errorMessage
```

---

## 4. SSE 实时推送设计

### 4.1 架构

```
┌─────────────┐     EventSource      ┌──────────────┐
│  Browser A  │◄─────────────────────│              │
├─────────────┤                      │   SSE        │
│  Browser B  │◄─────────────────────│   Event Bus  │
├─────────────┤                      │              │
│  Browser C  │◄─────────────────────│              │
└─────────────┘                      └──────┬───────┘
                                            │
                                     broadcast()
                                            │
                              ┌─────────────┴──────────────┐
                              │  test-runs POST handler     │
                              │  executeTestRun()           │
                              └────────────────────────────┘
```

### 4.2 事件类型

| 事件名 | 触发时机 | 数据负载 |
|--------|----------|----------|
| `connected` | 客户端首次连接 | `{ message: "SSE connected" }` |
| `test-run:created` | POST 创建新执行记录（通常是 `queued`） | 完整 TestRun 对象 |
| `test-run:updated` | 状态变更 (`queued/running/passed/failed/error`) | 完整 TestRun 对象 |

### 4.3 连接管理

- **心跳**: 每 30 秒发送 SSE 注释帧（`: heartbeat <timestamp>`），防止代理/负载均衡器超时断开
- **资源清理**: 客户端断开时自动从连接池移除；无客户端时停止心跳定时器
- **客户端重连**: `useSSE` Hook 实现指数退避重连（1s → 2s → 4s → ... → 30s），重连成功后自动触发数据重新拉取

### 4.4 数据流时序

```
用户点击"开始执行"
  │
  ▼
POST /api/test-runs
  │
  ├─ DB INSERT test_runs (status: queued)
  ├─ INSERT test_run_items (status: queued)
  ├─ SSE broadcast 'test-run:created'
  ├─ HTTP 201 立即返回
  │
  ▼ (异步，不阻塞 HTTP 响应)
调度器扫描 queued runs，按资源策略挑选可执行任务
DB UPDATE (status: running)
SSE broadcast 'test-run:updated'
  │
  ▼
TestRunner.run() 实际执行
  │
  ├─ 成功: DB UPDATE (status: passed, report_path, finished_at)
  └─ 失败: DB UPDATE (status: failed/error, error_message, finished_at)
  │
  ▼
SSE broadcast 'test-run:updated'
  │
  ▼
所有浏览器 Tab 实时收到更新，无需手动刷新
```

---

## 5. TestRunner 对接设计

### 5.1 执行流程

```
POST /api/test-runs { suiteId, deviceId }
  │
  ▼
查询 test_suites / test_suite_cases / test_cases 获取套件详情
  │
  ▼
创建 test_runs / test_run_items（初始状态: queued）
  │
  ▼
调度器根据资源策略选择可执行 run
  ├── Web: 全局最多 1 个 running 套件
  └── Mobile: 每个 deviceId 最多 1 个 running 套件
   │
   ▼
按顺序构造多个 TestCaseInput
   │
   ▼
逐个执行 TestRunner.run(testCaseInput)
  │
  ▼
TestRunner.run() 内部:
  ├── parseSteps(): 将自然语言按行拆分
  └── executeSteps(): 根据 platform 选择 Agent
       │
       ├── Web:     createWebAgent({ headless: true })
       ├── Android:  createAndroidAgent({ udid })
       └── iOS:      createIOSAgent({ udid })
       │
       ▼
       逐步执行:
       ├── 以"断言"/"assert"开头 → agent.aiAssert(step)
       └── 其他 → agent.aiAction(step)
```

### 5.2 错误处理

| 层级 | 处理方式 |
|------|----------|
| TestRunner.run() 返回 `status: 'failed'` | 测试步骤或断言失败，DB 更新为 `failed` |
| TestRunner.run() 返回 `status: 'error'` | Agent 创建、设备连接、系统级错误，DB 更新为 `error` |
| 状态更新后 | 均通过 SSE 广播通知前端 |

---

## 6. AI 配置模块设计

### 6.1 配置来源

通过环境变量读取，优先级：

```
MIDSCENE_MODEL_API_KEY  >  OPENAI_API_KEY
```

| 环境变量 | 说明 | 默认值 |
|----------|------|--------|
| `MIDSCENE_MODEL_BASE_URL` | 模型服务地址 | `https://api.openai.com/v1` |
| `MIDSCENE_MODEL_API_KEY` | API Key | (无) |
| `MIDSCENE_MODEL_NAME` | 模型名称 | `gpt-4o` |
| `MIDSCENE_MODEL_FAMILY` | 模型家族标识 | (无) |

### 6.2 Provider 预设

内置三个 Provider 预设，便于快速切换：

| Provider | Base URL | 默认模型 |
|----------|----------|----------|
| OpenAI | `https://api.openai.com/v1` | gpt-4o |
| Qwen (DashScope) | `https://dashscope.aliyuncs.com/compatible-mode/v1` | qwen3-vl |
| Anthropic | `https://api.anthropic.com/v1` | claude-sonnet-4-20250514 |

### 6.3 启动校验

服务启动时调用 `validateAIConfig()` 进行校验：

- 未配置 API Key → 输出警告，服务正常启动
- API Key 为占位符值 → 输出警告
- 配置有效 → 无输出

**设计原则**: 校验仅产生警告，不阻止服务启动。未配置时前端可正常使用用例管理功能，仅测试执行会失败。

---

## 7. API 接口设计

### 7.1 测试用例

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/test-cases` | 获取所有用例（按创建时间倒序） |
| GET | `/api/test-cases/:id` | 获取单个用例 |
| POST | `/api/test-cases` | 创建用例 |
| PUT | `/api/test-cases/:id` | 更新用例（支持部分更新） |
| DELETE | `/api/test-cases/:id` | 删除用例（级联删除关联执行记录） |

### 7.2 测试套件

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/test-suites` | 获取所有套件 |
| GET | `/api/test-suites/:id` | 获取单个套件 |
| POST | `/api/test-suites` | 创建套件 |
| PUT | `/api/test-suites/:id` | 更新套件 |
| DELETE | `/api/test-suites/:id` | 删除套件 |

### 7.3 测试执行

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/test-runs` | 获取所有执行记录（按开始时间倒序） |
| GET | `/api/test-runs/:id` | 获取单条执行记录 |
| POST | `/api/test-runs` | 创建 `queued` 执行记录并异步调度 |
| DELETE | `/api/test-runs/:id` | 删除终态执行记录，或取消 `queued` 任务 |
| GET | `/api/test-runs/events` | SSE 实时事件流 |

说明：

- `GET /api/test-runs*` 对于 `queued` 任务会额外返回 `queuePosition` 与 `blockedReason`
- 这两个字段属于读模型派生信息，不落库

### 7.4 设备管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/devices` | 获取已发现设备列表 |
| POST | `/api/devices/refresh` | 重新扫描设备 |

### 7.5 系统

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 |
| GET | `/api/readiness` | 运行环境 readiness 诊断 |

---

## 8. 前端 SSE 集成设计

### 8.1 useSSE Hook

```typescript
useSSE({
  events: {
    'test-run:created': (data) => { /* 新增记录 */ },
    'test-run:updated': (data) => { /* 更新状态 */ },
    'reconnect':        ()     => { /* 重连后全量刷新 */ },
  },
  enabled: true, // 可选，控制是否启用
});
```

### 8.2 各页面集成策略

| 页面 | created 事件 | updated 事件 | reconnect 事件 |
|------|-------------|-------------|---------------|
| TestRun | 将新记录 prepend 到列表头部 | 按 ID 替换更新 | 全量重新拉取 |
| Dashboard | 将新记录 prepend 到列表头部 | 按 ID 替换更新 | 全量重新拉取 |
| Reports | 忽略（queued/running 状态不相关） | 仅当状态为 passed/failed/error 时追加或更新 | 全量重新拉取 |

补充：

- `TestRun` 页面会把 `queuePosition` 与 `blockedReason` 组合成“排队信息”，帮助用户理解为什么任务仍停留在 `queued`

---

## 9. 关键设计决策

### 9.1 为什么选择 SQLite 而非 PostgreSQL / MySQL

- 零运维成本，无需独立进程
- better-sqlite3 同步 API 避免回调地狱，与 Express 路由配合简洁
- WAL 模式可满足当前并发量
- 如未来需要多实例部署，可平滑迁移至 PostgreSQL

### 9.2 为什么选择 SSE 而非 WebSocket

- 测试执行状态更新是服务端到客户端的单向数据流
- SSE 基于 HTTP，无需额外协议升级
- 浏览器原生 `EventSource` API，无需引入第三方库
- 自动重连是 EventSource 内建能力

### 9.3 为什么 SSE 路由挂载在 test-runs 之前

Express 路由匹配顺序敏感。`/api/test-runs/events` 必须在 `/api/test-runs` 之前注册，否则会被 `/api/test-runs/:id` 的 `:id` 参数捕获（`id = "events"`）。

### 9.4 为什么 test_runs 冗余存储 test_case_name

避免每次查询执行记录时都需要 JOIN test_cases 表。执行记录是高频查询场景（Dashboard、报告列表），冗余存储用例名称可简化查询并提升性能。

---

## 10. 安全考虑

| 风险点 | 应对措施 |
|--------|----------|
| SQL 注入 | 所有数据库操作均使用参数化 prepared statements |
| API Key 泄露 | `.env` 文件在 `.gitignore` 中排除；启动校验检测占位符值 |
| SSE 连接泄露 | 客户端断开时自动清理；无客户端时停止心跳 |
| 数据库文件暴露 | `*.db` / `*.db-wal` / `*.db-shm` 在 `.gitignore` 中排除 |
