# AI Test Platform 开发计划

> 版本: 1.0
> 更新日期: 2026-01-29

---

## 1. 项目背景

AI Test Platform 初始版本为脚手架状态：内存数组存储、模拟测试执行、手动刷新查看结果。本次开发将其升级为可运行的完整系统。

### 1.1 改造目标

| 序号 | 目标 | 痛点 |
|------|------|------|
| 1 | SQLite 持久化存储 | 服务重启数据全部丢失 |
| 2 | 对接 Core TestRunner | 只有模拟执行，无法真正运行测试 |
| 3 | SSE 实时推送 | 需手动点刷新才能看到状态变化 |
| 4 | AI 模型配置模块 | 模型配置分散，无统一管理与校验 |

---

## 2. 开发阶段

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
test-run:created  → 新执行记录创建（pending）
test-run:updated  → 状态变更（running → passed/failed/error）
心跳注释帧        → 每 30 秒
```

#### 验证方法

1. 打开两个浏览器 Tab，分别在 Dashboard 和 TestRun 页面
2. 在 TestRun 页面执行测试
3. 观察 Dashboard 页面无需刷新即可看到新记录和状态变化

---

## 3. 文件变更总览

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
| `server/src/routes/test-runs.ts` | DB 持久化 + 真实 TestRunner 调用 + SSE 广播 |
| `core/src/index.ts` | 新增 ai-config、TestCaseInput、TestResult 导出 |
| `client/src/pages/TestRun.tsx` | 添加 useSSE 订阅，实时更新执行列表 |
| `client/src/pages/Dashboard.tsx` | 添加 useSSE 订阅，实时更新统计和最近记录 |
| `client/src/pages/Reports.tsx` | 添加 useSSE 订阅，完成的测试自动出现在报告列表 |
| `.env.example` | 新增 DATABASE_PATH 变量 |
| `.gitignore` | 新增 *.db、*.db-wal、*.db-shm |

### 不修改的文件

| 文件 | 原因 |
|------|------|
| `server/src/routes/devices.ts` | 设备是运行时发现的，不需要持久化 |
| `client/src/services/api.ts` | API 接口形状不变，无需修改 |
| `client/src/App.tsx` | 路由配置不变 |
| `client/src/components/*` | 组件不受影响 |

---

## 4. 技术风险与应对

| 风险 | 影响 | 应对措施 |
|------|------|----------|
| better-sqlite3 原生编译失败 | 服务无法启动 | 使用 prebuild 二进制包；root package.json 已配置 onlyBuiltDependencies |
| AI API Key 未配置 | 测试执行失败 | 启动时输出警告但不阻断；用例管理功能可正常使用 |
| SSE 连接被代理中断 | 前端收不到更新 | 30s 心跳保活；useSSE Hook 指数退避重连 |
| 并发写入 SQLite 竞争 | 数据不一致 | WAL 模式 + better-sqlite3 同步 API 避免竞争条件 |

---

## 5. 后续规划

以下功能不在本次开发范围内，列为后续迭代方向：

| 功能 | 优先级 | 说明 |
|------|--------|------|
| 测试报告详情页 | P1 | 展示 Midscene 生成的 HTML 报告 |
| 测试用例标签/分组 | P2 | 支持按标签筛选和批量执行 |
| 定时执行 | P2 | Cron 表达式定时触发测试 |
| 并行执行 | P2 | 多用例并行执行，队列管理 |
| 用户认证 | P3 | 登录、角色权限 |
| PostgreSQL 迁移 | P3 | 多实例部署场景 |
| 测试覆盖率统计 | P3 | 集成覆盖率工具 |
