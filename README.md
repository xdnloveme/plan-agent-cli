# AI Agent CLI

基于 LangChainJS 的 CLI 智能体系统。

## 安装

### 环境要求

- Node.js >= 18.0.0
- npm >= 8.0.0

### 安装步骤

```bash
# 安装依赖
npm install

# 配置环境变量
cp .env
# 编辑 .env 文件，配置 OPENAI_API_KEY 等

# 构建项目
npm run build
```

## 配置

创建 `.env` 文件并配置以下环境变量：

```env
# OpenAI API 配置
OPENAI_API_KEY=your-openai-api-key-here
OPENAI_BASE_URL=https://api.openai.com/v1

# 模型配置
PLAN_AGENT_MODEL=gpt-4
RUN_AGENT_MODEL=gpt-3.5-turbo
QUALITY_AGENT_MODEL=gpt-4

# 执行配置
MAX_RETRIES=3
TIMEOUT_MS=30000

# 日志配置
LOG_LEVEL=info
```

## 使用方法

### 交互式模式

```bash
# 启动交互式 Shell
npm run dev

# 或使用编译后的版本
npm start
```

在交互式模式下，可用命令：

| 命令 | 说明 |
|------|------|
| `plan <description>` | 根据描述生成任务计划 |
| `execute [plan_id]` | 执行当前计划 |
| `run <description>` | 一键生成并执行计划 |
| `status` | 查看当前状态和进度 |
| `tasks` | 列出当前计划的所有任务 |
| `config` | 查看配置状态 |
| `reset` | 重置系统 |
| `help` | 显示帮助信息 |
| `exit` / `quit` | 退出 |

### 命令行模式

```bash
# 生成任务计划
npm start -- plan "开发一个用户登录系统"

# 一键执行
npm start -- run "创建一个 REST API 接口"

# 检查配置
npm start -- config
```

### 示例

```bash
ai-agent> plan "开发一个用户登录系统，包含注册、登录、密码重置功能"

📋 Generating task plan...

✓ Plan Created: plan_xxx

  Summary: 用户登录系统开发计划
  Tasks: 4

  task_1 - [P3] 设计数据库模型
    Steps: 3
  task_2 - [P3] 实现用户注册功能
    Steps: 4
    Dependencies: task_1
  task_3 - [P2] 实现用户登录功能
    Steps: 3
    Dependencies: task_1
  task_4 - [P2] 实现密码重置功能
    Steps: 4
    Dependencies: task_1, task_2

ai-agent> execute

🚀 Executing plan...
```

## 开发

```bash
# 开发模式运行
npm run dev

# 类型检查
npx tsc --noEmit

# 构建
npm run build

# 运行测试
npm test
```

## License

MIT
