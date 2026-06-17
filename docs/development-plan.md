# AI Test Platform 开发计划

> 版本: 1.2
> 更新日期: 2026-04-22

---

## 1. 项目背景

Scenix 已完成从“脚手架状态”到“可运行系统”的第一阶段演进：SQLite 持久化、真实 TestRunner、SSE 实时推送、测试套件模型都已落地。当前阶段的重点不再是补齐最小功能，而是围绕执行编排、运行环境 readiness、文档一致性和工程可复现性做第二轮收口。

### 1.1 改造目标

| 序号 | 目标 | 痛点 |
|------|------|------|
| 1 | SQLite 持久化存储 | 服务重启数据全部丢失 |
| 2 | 对接 Core TestRunner | 只有模拟执行，无法真正运行测试 |
| 3 | SSE 实时推送 | 需手动点刷新才能看到状态变化 |
| 4 | AI 模型配置模块 | 模型配置分散，无统一管理与校验 |

---

## 2. 当前状态

当前代码基线与最初计划相比，已经有四处重要演进：

1. 执行入口已从“单测试用例执行”升级为“测试套件执行”，后端同时维护 `test_runs` 与 `test_run_items` 两层执行记录。
2. 执行模型已从“立即执行”升级为“先入 `queued`，再由调度器按资源策略异步出队执行”。
3. 报告已从单记录展示扩展为“套件总报告 + 子用例报告 + 站内详情页”。
4. 工程脚本已开始从“全部测试一把跑”转向“单元测试 / 活环境测试分层”，并引入 readiness 诊断能力。
5. 队列状态已经具备基础可观测性，前端可看到同资源排队顺位与阻塞原因。
6. `test-runs.ts` 已完成第一轮瘦身，读模型与执行编排开始迁移到独立 service。
7. 数据库初始化已切换到显式 migration 体系，`queued_at / dispatched_at` 不再依赖 `started_at` 兼容解释。

第一阶段 Phase 1-3 已完成并在主分支生效，本计划以下方内容保留其实施历史。

---

## 3. 开发阶段

### Phase 1: SQLite 数据库持久化

**目标**: 所有测试用例和执行记录持久化到 SQLite，服务重启不丢数据。

#### 任务清单

| 序号 | 任务 | 涉及文件 | 状态 |
|------|------|----------|------|
| 1.1 | 安装 better-sqlite3 依赖 | `server/package.json` | ✅ 已完成 |
| 1.2 | 创建数据库模块（初始化、建表、WAL、映射函数） | `server/src/db/index.ts` | ✅ 已完成 |
| 1.3 | 修改服务入口，启动时初始化 DB | `server/src/index.ts` | ✅ 已完成 |
| 1.4 | 重写 test-cases 路由，全部 CRUD 改用 prepared statements | `server/src/routes/test-cases.ts` | ✅ 已完成 |
| 1.5 | 重写 test-runs 路由 GET 部分，使用 DB 查询 | `server/src/routes/test-runs.ts` | ✅ 已完成 |
| 1.6 | 更新环境变量模板和 gitignore | `.env.example`, `.gitignore` | ✅ 已完成 |

#### 新增依赖

```json
{
  "dependencies": { "better-sqlite3": "^12.6.2" },
  "devDependencies": { "@types/better-sqlite3": "^7.6.13" }
}
```

#### 验证方法

1. 启动服务 → 创建测试用例 → 重启服务 → 确认数据仍在
2. 检查 `server/data/app.db` 文件已创建

---

### Phase 2: 对接 TestRunner + AI 配置

**目标**: 替换模拟执行逻辑，调用真实 Midscene.js Agent；集中管理 AI 模型配置。

#### 任务清单

| 序号 | 任务 | 涉及文件 | 状态 |
|------|------|----------|------|
| 2.1 | 创建 AI 配置模块（读取、校验、Provider 预设） | `core/src/config/ai-config.ts` | ✅ 已完成 |
| 2.2 | 更新 core 包导出 | `core/src/index.ts` | ✅ 已完成 |
| 2.3 | 重写 test-runs POST：查询用例 → 构造 TestCaseInput → TestRunner.run() | `server/src/routes/test-runs.ts` | ✅ 已完成 |
| 2.4 | 服务启动时校验 AI 配置（仅警告不阻断） | `server/src/index.ts` | ✅ 已完成 |

#### 关键代码路径

```
POST /api/test-runs
  → DB 查询 test_cases 获取用例
  → 构造 TestCaseInput { id, name, platform, steps, deviceUdid }
  → new TestRunner().run(testCaseInput)
  → TestRunner 根据 platform 分发至对应 Agent
  → Agent 逐步执行 aiAction() / aiAssert()
  → 返回 TestResult { status, finishedAt, errorMessage?, reportPath? }
```

#### 验证方法

1. 在 `.env` 中配置有效的 AI API Key
2. 创建一个 Web 用例（例如："打开百度首页 → 断言页面标题包含百度"）
3. 执行测试 → 确认 Playwright 启动并执行操作
4. 不配置 Key 启动服务 → 确认终端输出警告，服务正常运行

---

### Phase 3: SSE 实时推送

**目标**: 测试执行状态变更实时推送到所有已连接的浏览器。

#### 任务清单

| 序号 | 任务 | 涉及文件 | 状态 |
|------|------|----------|------|
| 3.1 | 创建 SSE 事件总线（连接池 + 广播 + 心跳） | `server/src/sse/event-bus.ts` | ✅ 已完成 |
| 3.2 | 创建 SSE 端点路由 | `server/src/routes/events.ts` | ✅ 已完成 |
| 3.3 | 挂载 SSE 路由（在 test-runs 之前） | `server/src/index.ts` | ✅ 已完成 |
| 3.4 | test-runs POST 中添加 SSE 广播 | `server/src/routes/test-runs.ts` | ✅ 已完成 |
| 3.5 | 创建 useSSE React Hook | `client/src/hooks/useSSE.ts` | ✅ 已完成 |
| 3.6 | TestRun 页面集成 SSE | `client/src/pages/TestRun.tsx` | ✅ 已完成 |
| 3.7 | Dashboard 页面集成 SSE | `client/src/pages/Dashboard.tsx` | ✅ 已完成 |
| 3.8 | Reports 页面集成 SSE | `client/src/pages/Reports.tsx` | ✅ 已完成 |

#### SSE 事件流

```
 test-run:created  → 新执行记录创建（queued）
 test-run:updated  → 状态变更（queued → running → passed/failed/error）
心跳注释帧        → 每 30 秒
```

#### 验证方法

1. 打开两个浏览器 Tab，分别在 Dashboard 和 TestRun 页面
2. 在 TestRun 页面执行测试
3. 观察 Dashboard 页面无需刷新即可看到新记录和状态变化

---

### Phase 4: 执行编排、报告与工程化收口

**目标**: 降低运行时冲突和状态歧义，保证报告绑定更稳定，并让仓库文档与当前代码模型一致。

#### 任务清单

| 序号 | 任务 | 涉及文件 | 状态 |
|------|------|----------|------|
| 4.1 | 增加运行协调器，定义 Web 全局单槽位与移动端按设备单槽位 | `server/src/services/run-coordinator.ts`, `server/src/routes/test-runs.ts` | ✅ 已完成 |
| 4.2 | 引入 `queued` 状态与异步调度器，支持“可运行优先 FIFO” | `server/src/routes/test-runs.ts`, `server/src/services/run-status.ts`, `server/src/db/index.ts` | ✅ 已完成 |
| 4.3 | 服务启动时恢复中断执行，并让遗留 `queued` 任务自动继续调度 | `server/src/index.ts`, `server/src/routes/test-runs.ts` | ✅ 已完成 |
| 4.4 | 启动执行前强制刷新设备状态，前端展示设备占用反馈 | `server/src/routes/test-runs.ts`, `client/src/pages/TestRun.tsx` | ✅ 已完成 |
| 4.5 | 区分 `failed` 与 `error` 语义，修正套件状态聚合优先级 | `core/src/runner/test-runner.ts`, `server/src/routes/test-runs.ts`, `server/src/services/run-status.ts` | ✅ 已完成 |
| 4.6 | 用“执行前快照 + 绑定固定文件名”替代纯时间窗口猜测报告 | `server/src/services/report-binding.ts`, `server/src/routes/test-runs.ts` | ✅ 已完成 |
| 4.7 | 增加站内测试报告详情页，支持套件/子用例报告切换 | `client/src/App.tsx`, `client/src/pages/Reports.tsx`, `client/src/pages/ReportDetail.tsx` | ✅ 已完成 |
| 4.8 | 引入运行环境 readiness 检查与仪表盘摘要 | `core/src/config/*`, `server/src/routes/readiness.ts`, `client/src/pages/Dashboard.tsx` | ✅ 已完成 |
| 4.9 | 将根测试脚本拆分为 `test:unit` 与 `test:live` | `package.json`, `README*` | ✅ 已完成 |
| 4.10 | 固定 package manager 元数据并持续同步文档 | `package.json`, `docs/*` | ✅ 已完成 |
| 4.11 | 增加队列可观测性，展示同资源排队顺位与阻塞原因 | `server/src/services/run-coordinator.ts`, `server/src/services/run-read-service.ts`, `client/src/pages/TestRun.tsx` | ✅ 已完成 |
| 4.12 | 继续拆分 `test-runs.ts`，将读模型与执行编排迁移到 service | `server/src/routes/test-runs.ts`, `server/src/services/run-read-service.ts`, `server/src/services/run-execution-service.ts` | ✅ 已完成 |
| 4.13 | 引入显式 schema migrations，并新增 `queued_at / dispatched_at` 生命周期字段 | `server/src/db/*`, `server/src/services/run-read-service.ts`, `server/src/services/run-execution-service.ts` | ✅ 已完成 |

#### 本阶段说明

- 队列状态已持久化到 SQLite，调度本身仍由当前服务实例在内存中负责。
- `started_at` 不再承担“既是入队时间又是实际开始时间”的兼容语义；运行记录额外持久化了 `queued_at` 与 `dispatched_at`。
- 队列信息不再只有 `queued` 状态本身；API 还会返回同资源 `queuePosition` 与 `blockedReason`，用于前端解释等待原因。
- 报告绑定已不再依赖单纯的时间窗口扫描，而是基于执行前快照查找新增报告，并固化为可预测文件名。
- readiness 已覆盖 AI、Chromium、Android SDK、iOS/WDA 四类关键信号，但“真实业务站点可用性”仍需活环境测试补足。

---

## 4. 文件变更总览

### 新增文件 (5个)

| 文件 | 模块 | 用途 |
|------|------|------|
| `server/src/db/index.ts` | 数据库 | SQLite 初始化、建表、camelCase 映射工具 |
| `server/src/sse/event-bus.ts` | 实时推送 | SSE 事件总线（连接管理 + 广播 + 心跳） |
| `server/src/routes/events.ts` | 实时推送 | SSE 端点 `GET /api/test-runs/events` |
| `core/src/config/ai-config.ts` | AI 配置 | 模型配置读取、校验、Provider 预设 |
| `client/src/hooks/useSSE.ts` | 前端 | React Hook 封装 EventSource |

### 修改文件 (10个)

| 文件 | 改动内容 |
|------|---------|
| `server/package.json` | 新增 `better-sqlite3` + 类型定义依赖 |
| `server/src/index.ts` | 启动时初始化 DB、挂载 SSE 路由、校验 AI 配置 |
| `server/src/routes/test-cases.ts` | 全部 CRUD 改用 SQLite prepared statements |
| `server/src/routes/test-runs.ts` | DB 持久化 + 队列调度 + 真实 TestRunner 调用 + SSE 广播 |
| `core/src/index.ts` | 新增 ai-config、TestCaseInput、TestResult 导出 |
| `client/src/pages/TestRun.tsx` | 添加 useSSE 订阅，实时更新执行列表 |
| `client/src/pages/Dashboard.tsx` | 添加 useSSE 订阅，实时更新统计和最近记录 |
| `client/src/pages/Reports.tsx` | 添加 useSSE 订阅，并统一跳转站内报告详情页 |
| `.env.example` | 新增 DATABASE_PATH 变量 |
| `.gitignore` | 新增 *.db、*.db-wal、*.db-shm |

### 不修改的文件

| 文件 | 原因 |
|------|------|
| `server/src/routes/devices.ts` | 设备是运行时发现的，不需要持久化 |
| `client/src/services/api.ts` | API 接口形状不变，无需修改 |
| `client/src/App.tsx` | 已增加 `/reports/:runId` 报告详情页路由 |
| `client/src/components/*` | 组件不受影响 |

---

## 5. 技术风险与应对

| 风险 | 影响 | 应对措施 |
|------|------|----------|
| better-sqlite3 原生编译失败 | 服务无法启动 | 使用 prebuild 二进制包；root package.json 已配置 onlyBuiltDependencies |
| SQLite schema 演进缺少规范入口 | 后续新增字段时容易堆积兼容补丁 | 使用 `schema_migrations` + 显式 migration 列表管理结构变更 |
| AI 配置与 Midscene 运行时不一致 | 测试执行失败、ready 与实际行为不一致 | 启动时统一补齐默认 Midscene 环境变量，并提供 `/api/readiness` 诊断 |
| SSE 连接被代理中断 | 前端收不到更新 | 30s 心跳保活；useSSE Hook 指数退避重连 |
| 设备被重复占用 | 同一移动设备上的多个执行互相干扰 | 运行时设备占用锁 + 启动前强制刷新设备状态 |
| 报告路径误绑定 | 执行记录打开错误报告 | 执行前快照查找新增报告，并绑定为固定文件名 |
| 并发写入 SQLite 竞争 | 数据不一致 | WAL 模式 + better-sqlite3 同步 API 避免竞争条件 |

---

## 6. 后续规划

以下功能不在本次开发范围内，列为后续迭代方向：

| 功能 | 优先级 | 说明 |
|------|--------|------|
| 队列等待时间估算 | P1 | 在已有排队顺位/阻塞原因基础上增加更可解释的等待预估 |
| 执行 service 深度拆分 | P1 | 继续把删除、创建、读模型仓储、调度器恢复逻辑分层，压缩路由文件职责 |
| 运行项时间语义收口 | P1 | 为 `test_run_items` 也补齐更明确的排队/开始时间模型，减少 pending 项时间歧义 |
| 测试用例标签/分组 | P2 | 支持按标签筛选和批量执行 |
| 定时执行 | P2 | Cron 表达式定时触发测试 |
| 运行中取消 / 重试 | P2 | 支持取消执行与失败后重试 |
| 用户认证 | P3 | 登录、角色权限 |
| PostgreSQL 迁移 | P3 | 多实例部署场景 |
| 测试覆盖率统计 | P3 | 集成覆盖率工具 |
