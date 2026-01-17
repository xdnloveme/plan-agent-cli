import type { CoreMessage } from 'ai';
import type { ModelAdapter } from '../core/model/ModelAdapter';
import type { ToolRegistry } from '../core/tools/ToolRegistry';
import type { Memory } from '../core/memory/Memory';
import type { EventBus } from '../utils/event-bus';
import type { Logger } from '../utils/logger';
import type { AgentConfig, AgentContext, AgentResult, Message, GenerateOptions } from './types';

/**
 * Base agent dependencies - injected via constructor
 */
export interface AgentDependencies {
  model: ModelAdapter;
  tools: ToolRegistry;
  memory: Memory;
  eventBus: EventBus;
  logger?: Logger;
}

/**
 * Abstract base class for all agents
 *
 * Provides core agent functionality with dependency injection
 * for model, tools, memory, and event bus.
 */
export abstract class BaseAgent {
  protected readonly model: ModelAdapter;
  protected readonly tools: ToolRegistry;
  protected readonly memory: Memory;
  protected readonly eventBus: EventBus;
  protected readonly logger?: Logger;
  protected readonly config: AgentConfig;

  constructor(dependencies: AgentDependencies, config: AgentConfig) {
    this.model = dependencies.model;
    this.tools = dependencies.tools;
    this.memory = dependencies.memory;
    this.eventBus = dependencies.eventBus;
    this.logger = dependencies.logger;
    this.config = config;
  }

  /**
   * Get agent ID
   */
  get id(): string {
    return this.config.id;
  }

  /**
   * Get agent name
   */
  get name(): string {
    return this.config.name;
  }

  /**
   * Execute a task
   */
  abstract execute(task: string, context?: AgentContext): Promise<AgentResult>;

  /**
   * Generate a response using the model
   */
  protected async generate(
    messages: CoreMessage[],
    options: Partial<GenerateOptions> = {}
  ): Promise<AgentResult> {
    try {
      const result = await this.model.generate({
        messages,
        systemPrompt: options.systemPrompt ?? this.config.systemPrompt,
        tools: options.tools ?? this.tools.toCoreTools(this.id),
        maxTokens: options.maxTokens,
        temperature: options.temperature,
      });

      return {
        success: true,
        content: result.text,
        toolCalls: result.toolCalls?.map((call) => ({
          toolName: call.toolName,
          toolCallId: call.toolCallId,
          args: call.args,
          result: undefined, // Will be filled if tools are executed
        })),
        metadata: {
          usage: result.usage,
          finishReason: result.finishReason,
        },
      };
    } catch (error) {
      this.logger?.error('Generation failed', { error });
      return {
        success: false,
        content: '',
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  /**
   * Generate a response with automatic tool execution
   */
  protected async generateWithTools(
    messages: CoreMessage[],
    options: Partial<GenerateOptions> & { maxSteps?: number } = {}
  ): Promise<AgentResult> {
    try {
      const result = await this.model.generateWithTools({
        messages,
        systemPrompt: options.systemPrompt ?? this.config.systemPrompt,
        tools: options.tools ?? this.tools.toCoreTools(this.id),
        maxTokens: options.maxTokens,
        temperature: options.temperature,
        maxSteps: options.maxSteps ?? 5,
        onToolCall: (call) => {
          this.eventBus.emit('tool:call', {
            toolName: call.toolName,
            args: call.args,
            agentId: this.id,
          });
        },
      });

      return {
        success: true,
        content: result.text,
        toolCalls: result.toolCalls?.map((call) => ({
          toolName: call.toolName,
          toolCallId: call.toolCallId,
          args: call.args,
          result: undefined,
        })),
        metadata: {
          usage: result.usage,
          finishReason: result.finishReason,
        },
      };
    } catch (error) {
      this.logger?.error('Generation with tools failed', { error });
      return {
        success: false,
        content: '',
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  /**
   * Create or get agent context
   */
  protected createContext(existingContext?: AgentContext): AgentContext {
    if (existingContext) {
      return {
        ...existingContext,
        currentDepth: (existingContext.currentDepth ?? 0) + 1,
      };
    }

    const conversationId = `conv-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    return {
      conversationId,
      history: [],
      variables: new Map(),
      maxDepth: this.config.maxDepth ?? 3,
      currentDepth: 0,
    };
  }

  /**
   * Convert Message to CoreMessage format
   */
  protected toCoreMesages(messages: Message[]): CoreMessage[] {
    return messages.map((msg) => ({
      role: msg.role as 'user' | 'assistant' | 'system',
      content: msg.content,
    }));
  }

  /**
   * Add a message to memory
   */
  protected addToMemory(conversationId: string, role: Message['role'], content: string): void {
    this.memory.addMessage(conversationId, {
      role,
      content,
      timestamp: new Date(),
    });
  }

  /**
   * Emit task start event
   */
  protected emitTaskStart(taskId: string, task: string): void {
    this.eventBus.emit('task:start', {
      taskId,
      task,
      agentId: this.id,
    });
  }

  /**
   * Emit task complete event
   */
  protected emitTaskComplete(taskId: string, result: AgentResult): void {
    this.eventBus.emit('task:complete', {
      taskId,
      result,
      agentId: this.id,
    });
  }

  /**
   * Emit task error event
   */
  protected emitTaskError(taskId: string, error: Error): void {
    this.eventBus.emit('task:error', {
      taskId,
      error,
      agentId: this.id,
    });
  }

  /**
   * Generate a unique task ID
   */
  protected generateTaskId(): string {
    return `task-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  /**
   * Check if we've exceeded max depth
   */
  protected isMaxDepthExceeded(context: AgentContext): boolean {
    const maxDepth = context.maxDepth ?? this.config.maxDepth ?? 3;
    const currentDepth = context.currentDepth ?? 0;
    return currentDepth >= maxDepth;
  }

  /**
   * Get configuration value with default
   */
  protected getConfigValue<K extends keyof AgentConfig>(
    key: K,
    defaultValue: NonNullable<AgentConfig[K]>
  ): NonNullable<AgentConfig[K]> {
    return (this.config[key] ?? defaultValue) as NonNullable<AgentConfig[K]>;
  }
}
