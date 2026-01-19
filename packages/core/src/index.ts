/**
 * BaseAgent Framework
 *
 * A TypeScript AI agent framework with multi-agent collaboration support.
 * Built on top of Vercel AI SDK for model-agnostic LLM integration.
 */

// Agents
export { BaseAgent, type AgentDependencies } from './agents/BaseAgent';
export { SubAgent, ToolSubAgent, createToolSubAgent } from './agents/SubAgent';
export { MainAgent, createMainAgent, type MainAgentDependencies } from './agents/MainAgent';
export {
  AgentCoordinator,
  type SelectionStrategy,
  PrioritySelectionStrategy,
  CapabilityMatchStrategy,
  RoundRobinStrategy,
} from './agents/AgentCoordinator';
export type {
  AgentConfig,
  AgentContext,
  AgentResult,
  Message,
  SubAgentConfig,
  ModelConfig,
  GenerateOptions,
  GenerateResult,
  CoordinationConfig,
  AgentEvents,
  ToolCallResult,
} from './agents/types';

// Core - Model
export { ModelAdapter, type StreamChunk } from './core/model/ModelAdapter';
export {
  ModelFactory,
  ProviderNotAvailableError,
  InvalidModelConfigError,
  type ProviderType,
  type ModelProvider,
  type ProviderFactory,
  type ProviderConfig,
  type ProviderRegistration,
  type ProviderRegistry,
} from './core/model/ModelFactory';

// Core - Tools
export { BaseTool, createTool, type ToolContext, type ToolResult } from './core/tools/BaseTool';
export { ToolRegistry, type ToolPermission } from './core/tools/ToolRegistry';
export {
  CalculatorTool,
  createCalculatorTool,
  WebSearchTool,
  createWebSearchTool,
  FileSystemTool,
  createFileSystemTool,
  registerBuiltinTools,
  type SearchProvider,
  MockSearchProvider,
} from './core/tools/builtin';

// Core - Memory
export { Memory, createMemory, type MemoryOptions } from './core/memory/Memory';

// Utils
export { EventBus, getGlobalEventBus, resetGlobalEventBus } from './utils/event-bus';
export { TaskQueue } from './utils/task-queue';
export {
  Logger,
  createJsonLogger,
  getGlobalLogger,
  resetGlobalLogger,
  type LogLevel,
  type LogEntry,
  type LoggerOptions,
} from './utils/logger';

// Config
export {
  configSchema,
  modelConfigSchema,
  subAgentConfigSchema,
  coordinationConfigSchema,
  parseConfig,
  validateConfig,
  type Config,
  type ModelConfigType,
  type SubAgentConfigType,
  type CoordinationConfigType,
} from './config/schema';
