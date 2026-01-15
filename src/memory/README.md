# Memory 模块

## 概述

Memory 模块用于记录 CLI 访问 LLM 大模型的每次 prompt 记录。采用**代理模式（Proxy Pattern）**实现，在不侵入原有 Agent 代码的情况下，自动拦截和记录所有与 LLM 的交互。

## 目录说明

**重要区分**：
- `src/memory/` - **源码目录**，包含 Memory 模块的实现代码
- `.memory/` - **输出目录**，包含运行时生成的记录文件

## 目录结构

```
src/memory/
├── index.ts              # 统一导出入口
├── types.ts              # 类型定义
├── MemoryWriter.ts       # 文件写入器
├── MemoryProxy.ts        # LLM 代理类
├── memory.decorator.ts   # 装饰器和上下文管理
└── README.md             # 本文档
```

## 启用方式

Memory 功能通过环境变量控制，默认**关闭**。

### 环境变量配置

在 `.env` 文件中设置：

```bash
# 启用 Memory 记录（默认 false）
ENABLE_MEMORY=true

# 可选：自定义输出目录（默认为当前工作目录）
MEMORY_OUTPUT_DIR=/path/to/output
```

## 工作原理

### 1. 代理模式

Memory 模块使用 JavaScript Proxy 包装各个 Agent 的 `ChatOpenAI` 实例，拦截 `invoke` 和 `withStructuredOutput` 方法的调用，在不修改原有代码逻辑的情况下记录所有 LLM 交互。

### 2. Plan ID 管理

- **Plan ID 来源**：由 `PlanAgent` 在生成任务计划时创建（格式：`plan_<uuid>`）
- **会话管理**：`AgentOrchestrator` 在创建 Plan 后自动调用 `startMemorySession(planId)` 开始记录，执行完成后调用 `endMemorySession()` 结束记录

### 3. 输出结构

Memory 记录输出到命令执行目录下的 `.memory` 目录：

```
.memory/
└── plan_<uuid>/          # 以 Plan ID 为目录名
    ├── overview.md       # 任务计划概览（Plan 内容）
    └── plan.md           # LLM 交互记录
```

- **overview.md** - 记录 PlanAgent 生成的任务计划内容，包括：
  - Plan 基本信息（ID、创建时间、任务数量）
  - 原始用户输入
  - 计划摘要
  - 任务列表（每个任务的描述、优先级、依赖、执行步骤）

- **plan.md** - 记录所有 Agent 与 LLM 的交互（prompt 和 response）

### 4. 记录格式

每条记录包含以下信息：

```markdown
# 任务时间戳：2024-01-15 10:30:00

## 任务Task名称：TaskAnalyzer

## 任务提示词内容：
```
你是一个任务分析专家...
```

## 大模型返回的内容：
```
{
  "mainGoal": "...",
  ...
}
```

---
```

## 集成方式

Memory 功能已自动集成到以下 Agent 中：

- **PlanAgent** - 感知层（任务名称：`PlanAgent`）
- **RunAgent** - 执行层（任务名称：`RunAgent`）
- **QualityAgent** - 质量层（任务名称：`QualityAgent`）

每个 Agent 的 `ChatOpenAI` 模型都已通过 `wrapModelWithMemory()` 函数包装，无需额外配置。

## 代码实现

### Agent 中的集成（已实现）

```typescript
// src/agents/PlanAgent/PlanAgent.ts
import { wrapModelWithMemory } from '../../memory/index';

constructor(agentConfig?: Partial<PlanAgentConfig>) {
  // 初始化 LLM
  const baseModel = new ChatOpenAI({ ... });

  // 使用 Memory 代理包装 model
  this.model = wrapModelWithMemory(baseModel, 'PlanAgent');

  // 子组件使用已包装的 model
  this.taskAnalyzer = new TaskAnalyzer(this.model);
  this.planGenerator = new PlanGenerator(this.model);
}
```

### Orchestrator 中的会话管理（已实现）

```typescript
// src/core/AgentOrchestrator.ts
import { startMemorySession, endMemorySession, isMemoryEnabled } from '../memory/index';

async createPlan(input: string): Promise<TaskPlan> {
  const plan = await this.planAgent.analyze(input);
  
  // 启动 Memory 会话
  if (isMemoryEnabled()) {
    startMemorySession(plan.id);
  }
  
  return plan;
}

async execute(input: string): Promise<ExecutionSummary> {
  // ... 执行逻辑 ...
  
  // 结束 Memory 会话
  if (isMemoryEnabled()) {
    endMemorySession();
  }
  
  return summary;
}
```

## API 参考

### 类型

```typescript
// Memory 配置
interface MemoryConfig {
  planId: string;        // Plan ID（从 Agent 传入）
  taskName: string;      // 任务名称
  enabled?: boolean;     // 是否启用
  outputDir?: string;    // 输出目录
}

// Memory 记录条目
interface MemoryEntry {
  taskName: string;      // 任务名称
  timestamp: Date;       // 时间戳
  prompt: string;        // 提示词内容
  response: string;      // 大模型返回内容
}
```

### 函数

| 函数 | 说明 |
|------|------|
| `wrapModelWithMemory(model, taskName)` | 为 Model 添加 Memory 代理包装 |
| `startMemorySession(planId)` | 开始 Memory 会话（传入 Plan ID） |
| `endMemorySession()` | 结束 Memory 会话 |
| `writePlanOverview(plan)` | 写入任务计划概览到 overview.md |
| `isMemoryEnabled()` | 检查 Memory 是否启用 |
| `getCurrentPlanId()` | 获取当前 Plan ID |
| `setMemoryOutputDir(dir)` | 设置输出目录 |

## 设计原则

- **代理模式**：通过 Proxy 拦截 LLM 调用，不侵入原有代码
- **低耦合**：Memory 功能与业务逻辑完全分离
- **高内聚**：所有 Memory 相关功能集中在 `src/memory` 模块
- **单一职责**：每个文件负责单一功能
- **环境变量控制**：通过 `ENABLE_MEMORY` 开关控制，默认关闭

## 注意事项

1. **目录区分**：
   - `src/memory/` - 源码目录，包含 Memory 模块的实现
   - `.memory/` - 输出目录，包含生成的记录文件，位于命令执行目录下

2. **Plan ID 来源**：Plan ID 由 `PlanAgent` 生成，不是 Memory 模块自动生成

3. **异步写入**：记录写入采用异步方式，不阻塞主流程

4. **错误处理**：写入失败不会影响主流程，错误会被记录到日志

5. **默认关闭**：Memory 功能默认关闭，需要在 `.env` 中设置 `ENABLE_MEMORY=true` 才会启用
