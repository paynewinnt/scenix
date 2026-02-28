# Scenix

基于 Midscene.js 和 Appium 的 AI 驱动 UI 自动化测试平台。支持 Web、Android、iOS 三端，使用自然语言描述测试步骤，AI 自动执行操作与断言。

---

## 功能特性

- **自然语言测试** — 用中文或英文描述测试步骤，AI 自动解析执行
- **多平台支持** — Web（Playwright）、Android（ADB）、iOS（XCTest）
- **持久化存储** — SQLite 数据库，服务重启不丢失数据
- **实时状态推送** — SSE 实时推送测试状态到浏览器，无需手动刷新
- **AI 模型配置** — 支持 OpenAI、Qwen、Anthropic 等多 Provider
- **设备管理** — 自动发现 Android/iOS 连接设备

---

## 技术栈

| 层 | 技术 |
|---|------|
| 前端 | React 18 + Ant Design + TypeScript + Vite |
| 后端 | Express.js + TypeScript + better-sqlite3 |
| 核心 | Midscene.js + Appium (WebDriverIO) |
| 构建 | pnpm workspace monorepo |

---

## 快速开始

### 环境要求

- Node.js >= 18
- pnpm >= 8

### 安装

```bash
# 克隆项目
git clone <repository-url>
cd scenix

# 安装依赖
pnpm install
```

### 配置

```bash
# 复制环境变量模板
cp .env.example .env
```

编辑 `.env` 文件，配置 AI 模型：

```bash
# 方式一: 使用 Qwen (通义千问)
MIDSCENE_MODEL_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
MIDSCENE_MODEL_API_KEY=sk-your-api-key
MIDSCENE_MODEL_NAME=qwen3-vl
MIDSCENE_MODEL_FAMILY=qwen-vl

# 方式二: 使用 OpenAI
MIDSCENE_MODEL_BASE_URL=https://api.openai.com/v1
MIDSCENE_MODEL_API_KEY=sk-your-openai-key
MIDSCENE_MODEL_NAME=gpt-4o
```

### 启动

```bash
# 同时启动前端和后端
pnpm dev

# 或者分别启动
pnpm dev:server  # 后端: http://localhost:3001
pnpm dev:client  # 前端: http://localhost:5173
```

启动后浏览器打开 `http://localhost:5173` 即可使用。

---

## 项目结构

```
scenix/
├── client/                 # 前端 React 应用
│   └── src/
│       ├── pages/          # 页面 (Dashboard, TestRun, Reports, ...)
│       ├── hooks/          # 自定义 Hooks (useSSE)
│       ├── services/       # API 调用层
│       └── components/     # 通用组件
├── server/                 # 后端 Express 服务
│   └── src/
│       ├── db/             # SQLite 数据库模块
│       ├── sse/            # SSE 事件总线
│       ├── routes/         # API 路由
│       └── index.ts        # 服务入口
├── core/                   # 测试执行核心库
│   └── src/
│       ├── agents/         # 平台 Agent (Web/Android/iOS)
│       ├── config/         # AI 模型配置
│       ├── runner/         # TestRunner 统一执行器
│       └── device/         # 设备管理
├── tests/                  # 测试用例示例
├── docs/                   # 文档
│   ├── design.md           # 技术设计文档
│   └── development-plan.md # 开发计划文档
└── .env.example            # 环境变量模板
```

---

## 使用指南

### 1. 创建测试用例

在「测试用例」页面创建用例，填写：

- **名称**: 用例名称
- **平台**: Web / Android / iOS
- **测试步骤**: 自然语言描述，每行一个步骤

示例步骤：

```
1. 打开 https://www.baidu.com
2. 在搜索框中输入 "Midscene.js"
3. 点击搜索按钮
4. 断言页面包含搜索结果
```

> 以「断言」或「assert」开头的步骤会调用 `aiAssert()`，其余调用 `aiAction()`。

### 2. 执行测试

在「执行测试」页面：

1. 选择要执行的测试用例
2. 如果是移动端测试，选择已连接的设备
3. 点击「开始执行」

测试启动后，状态会实时推送到所有打开的浏览器页面。

### 3. 查看报告

在「测试报告」页面查看已完成（通过/失败）的测试记录。点击「查看报告」可打开 Midscene 生成的详细 HTML 报告。

---

## API 接口

### 测试用例

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/test-cases` | 获取所有用例 |
| GET | `/api/test-cases/:id` | 获取单个用例 |
| POST | `/api/test-cases` | 创建用例 |
| PUT | `/api/test-cases/:id` | 更新用例 |
| DELETE | `/api/test-cases/:id` | 删除用例 |

### 测试执行

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/test-runs` | 获取所有执行记录 |
| GET | `/api/test-runs/:id` | 获取单条记录 |
| POST | `/api/test-runs` | 创建并启动执行 |
| GET | `/api/test-runs/events` | SSE 实时事件流 |

### 设备

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/devices` | 获取设备列表 |
| POST | `/api/devices/refresh` | 刷新设备列表 |

---

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `SERVER_PORT` | 后端服务端口 | `3001` |
| `DATABASE_PATH` | SQLite 数据库文件路径 | `./server/data/app.db` |
| `MIDSCENE_MODEL_BASE_URL` | AI 模型服务地址 | - |
| `MIDSCENE_MODEL_API_KEY` | AI 模型 API Key | - |
| `MIDSCENE_MODEL_NAME` | AI 模型名称 | - |
| `MIDSCENE_MODEL_FAMILY` | AI 模型家族标识 | - |
| `APPIUM_HOST` | Appium 服务地址 | `127.0.0.1` |
| `APPIUM_PORT` | Appium 服务端口 | `4723` |
| `MIDSCENE_RUN_DIR` | 报告输出目录 | `./reports/midscene` |

---

## 开发

```bash
# 安装依赖
pnpm install

# 启动开发服务
pnpm dev

# 构建
pnpm build

# 运行测试
pnpm test
```

---

## 许可证

私有项目，未经授权不得分发。
