# BaseAgent Framework

A TypeScript AI agent framework with multi-agent collaboration support, built on top of Vercel AI SDK.

## Features

- **Multi-Agent Architecture**: Main agent with specialized sub-agents
- **Model Agnostic**: Support for OpenAI, Anthropic, Google, and custom providers via AI SDK
- **Tool System**: Extensible tool framework with built-in tools
- **Memory Management**: Conversation history with sliding window
- **Event-Driven**: Type-safe event bus for agent communication
- **Dependency Injection**: Loose coupling for easy testing and customization

## Installation

```bash
npm install base-agent-framework
```

### Install Model Providers (as needed)

```bash
# OpenAI
npm install @ai-sdk/openai

# Anthropic
npm install @ai-sdk/anthropic

# Google
npm install @ai-sdk/google
```

## Quick Start

```typescript
import {
  MainAgent,
  ModelFactory,
  ToolRegistry,
  Memory,
  EventBus,
  TaskQueue,
} from 'base-agent-framework';
import { registerBuiltinTools } from 'base-agent-framework/tools/builtin';

// Create dependencies
const model = await ModelFactory.create({
  provider: 'openai',
  name: 'gpt-4-turbo',
});

const tools = new ToolRegistry();
registerBuiltinTools(tools);

const memory = new Memory();
const eventBus = new EventBus();
const taskQueue = new TaskQueue();

// Create main agent
const agent = new MainAgent(
  { model, tools, memory, eventBus, taskQueue },
  {
    id: 'main-agent',
    name: 'My Assistant',
    model: { provider: 'openai', name: 'gpt-4-turbo' },
    systemPrompt: 'You are a helpful assistant.',
  }
);

// Execute tasks
const result = await agent.execute('Calculate 15% of 250');
console.log(result.content);

// Chat interaction
const response = await agent.chat('Hello!');
console.log(response);
```

## Creating Sub-Agents

```typescript
import { SubAgent } from 'base-agent-framework';

class MyCustomAgent extends SubAgent {
  readonly specialization = 'custom-task';
  readonly capabilities = ['custom', 'specialized'];

  canHandle(task: string): boolean {
    return task.toLowerCase().includes('custom');
  }

  async execute(task: string, context?: AgentContext): Promise<AgentResult> {
    // Custom implementation
    const result = await this.generate([{ role: 'user', content: task }]);
    return result;
  }
}

// Register with main agent
agent.registerSubAgent(new MyCustomAgent(dependencies, config));
```

## Built-in Tools

- **Calculator**: Mathematical expression evaluation
- **WebSearch**: Web search (requires provider implementation)
- **FileSystem**: File operations with path restrictions

### Creating Custom Tools

```typescript
import { BaseTool, createTool } from 'base-agent-framework';
import { z } from 'zod';

// Using class
class MyTool extends BaseTool {
  readonly name = 'my_tool';
  readonly description = 'Does something useful';
  readonly inputSchema = z.object({
    input: z.string(),
  });

  async execute(input) {
    return { success: true, data: `Processed: ${input.input}` };
  }
}

// Using factory
const myTool = createTool({
  name: 'my_tool',
  description: 'Does something useful',
  inputSchema: z.object({ input: z.string() }),
  execute: async (input) => `Processed: ${input.input}`,
});
```

## Configuration

```typescript
import { configSchema, parseConfig } from 'base-agent-framework';

const config = parseConfig({
  id: 'main-agent',
  name: 'Research Assistant',
  model: {
    provider: 'anthropic',
    name: 'claude-3-opus-20240229',
  },
  subAgents: [
    {
      id: 'search-agent',
      name: 'Search Specialist',
      specialization: 'web-search',
      capabilities: ['search', 'research'],
      priority: 8,
    },
  ],
  coordination: {
    maxConcurrent: 3,
    timeout: 30000,
    retryAttempts: 2,
    selectionStrategy: 'capability-match',
  },
  maxDepth: 3,
});
```

## Event Handling

```typescript
const eventBus = new EventBus();

eventBus.on('task:start', (data) => {
  console.log(`Task started: ${data.taskId}`);
});

eventBus.on('task:complete', (data) => {
  console.log(`Task completed: ${data.taskId}`);
});

eventBus.on('tool:call', (data) => {
  console.log(`Tool called: ${data.toolName}`);
});

eventBus.on('subagent:selected', (data) => {
  console.log(`Sub-agent selected: ${data.subAgentId}`);
});
```

## Architecture

```
┌─────────────────────────────────────────────┐
│                  MainAgent                   │
│  ┌─────────────────────────────────────┐   │
│  │         AgentCoordinator            │   │
│  │  ┌─────────┐ ┌─────────┐ ┌───────┐ │   │
│  │  │SubAgent1│ │SubAgent2│ │  ...  │ │   │
│  │  └─────────┘ └─────────┘ └───────┘ │   │
│  └─────────────────────────────────────┘   │
├─────────────────────────────────────────────┤
│  ModelAdapter  │  ToolRegistry  │  Memory   │
├─────────────────────────────────────────────┤
│      EventBus      │      TaskQueue         │
└─────────────────────────────────────────────┘
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Lint
npm run lint

# Format
npm run format
```

## License

MIT
