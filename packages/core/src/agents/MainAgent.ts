import { BaseAgent, type AgentDependencies } from './BaseAgent';
import { AgentCoordinator, type CoordinatorDependencies } from './AgentCoordinator';
import { SubAgent, ToolSubAgent } from './SubAgent';
import type { AgentConfig, AgentContext, AgentResult, SubAgentConfig } from './types';
import type { TaskQueue } from '../utils/task-queue';
import type { Config } from '../config/schema';

/**
 * Main agent dependencies
 */
export interface MainAgentDependencies extends AgentDependencies {
  taskQueue: TaskQueue;
}

/**
 * Main agent - the primary entry point for task execution
 *
 * Orchestrates task execution, delegates to sub-agents when appropriate,
 * and handles direct task processing.
 */
export class MainAgent extends BaseAgent {
  private coordinator: AgentCoordinator;

  constructor(dependencies: MainAgentDependencies, config: AgentConfig) {
    super(dependencies, config);

    // Initialize coordinator
    const coordinatorDeps: CoordinatorDependencies = {
      taskQueue: dependencies.taskQueue,
      eventBus: dependencies.eventBus,
      logger: dependencies.logger,
    };

    this.coordinator = new AgentCoordinator(coordinatorDeps, {
      maxConcurrent: config.maxConcurrent ?? 3,
      timeout: config.timeout ?? 30000,
      retryAttempts: config.retryAttempts ?? 2,
    });
  }

  /**
   * Register a sub-agent
   */
  registerSubAgent(agent: SubAgent): void {
    this.coordinator.registerSubAgent(agent);
  }

  /**
   * Create and register a sub-agent from config
   */
  createSubAgent(config: SubAgentConfig & { toolNames?: string[]; keywords?: string[] }): SubAgent {
    const subAgentDeps: AgentDependencies = {
      model: this.model,
      tools: this.tools,
      memory: this.memory,
      eventBus: this.eventBus,
      logger: this.logger,
    };

    const agent = new ToolSubAgent(subAgentDeps, config);
    this.registerSubAgent(agent);
    return agent;
  }

  /**
   * Get the coordinator
   */
  getCoordinator(): AgentCoordinator {
    return this.coordinator;
  }

  /**
   * Execute a task
   */
  async execute(task: string, context?: AgentContext): Promise<AgentResult> {
    const ctx = this.createContext(context);
    const taskId = this.generateTaskId();

    this.emitTaskStart(taskId, task);
    this.logger?.info('MainAgent executing task', { taskId, task });

    try {
      // Check depth limit
      if (this.isMaxDepthExceeded(ctx)) {
        const result: AgentResult = {
          success: false,
          content: 'Maximum recursion depth exceeded',
          error: new Error('Max depth exceeded'),
        };
        this.emitTaskComplete(taskId, result);
        return result;
      }

      // Add task to memory
      this.addToMemory(ctx.conversationId, 'user', task);

      // Determine if task should be delegated
      const subAgent = this.coordinator.selectSubAgent(task, ctx);

      let result: AgentResult;
      if (subAgent) {
        // Delegate to sub-agent
        this.logger?.debug('Delegating to sub-agent', {
          subAgentId: subAgent.id,
          subAgentName: subAgent.name,
        });
        result = await this.coordinator.executeTask(task, {
          ...ctx,
          parentTaskId: taskId,
        });
      } else {
        // Handle directly
        this.logger?.debug('Handling task directly');
        result = await this.handleDirectly(task, ctx);
      }

      // Add response to memory
      if (result.success) {
        this.addToMemory(ctx.conversationId, 'assistant', result.content);
      }

      this.emitTaskComplete(taskId, result);
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.emitTaskError(taskId, err);
      this.logger?.error('MainAgent failed', { taskId, error });

      return {
        success: false,
        content: '',
        error: err,
      };
    }
  }

  /**
   * Handle task directly without delegation
   */
  private async handleDirectly(_task: string, context: AgentContext): Promise<AgentResult> {
    // Get conversation history (task is already in history from execute())
    const history = this.memory.getRecentMessages(context.conversationId);
    const messages = this.toCoreMessages(history);

    // Generate response with tools
    return this.generateWithTools(messages);
  }

  /**
   * Execute multiple tasks in parallel
   */
  async executeParallel(tasks: string[], context?: AgentContext): Promise<AgentResult[]> {
    const ctx = this.createContext(context);

    return this.coordinator.executeParallel(tasks.map((task) => ({ task, context: ctx })));
  }

  /**
   * Execute multiple tasks sequentially
   */
  async executeSequential(tasks: string[], context?: AgentContext): Promise<AgentResult[]> {
    const ctx = this.createContext(context);

    return this.coordinator.executeSequential(tasks.map((task) => ({ task, context: ctx })));
  }

  /**
   * Chat-style interaction
   */
  async chat(message: string, conversationId?: string): Promise<string> {
    const context: AgentContext = {
      conversationId: conversationId ?? `chat-${Date.now()}`,
      history: [],
      variables: new Map(),
      maxDepth: this.config.maxDepth ?? 3,
      currentDepth: 0,
    };

    // Load existing history if conversation exists
    const existingHistory = this.memory.getHistory(context.conversationId);
    if (existingHistory.length > 0) {
      context.history = existingHistory;
    }

    const result = await this.execute(message, context);
    return result.content;
  }

  /**
   * Get agent statistics
   */
  getStats() {
    return {
      agentId: this.id,
      agentName: this.name,
      coordinator: this.coordinator.getStats(),
      memory: this.memory.getStats(),
      tools: this.tools.getStats(),
    };
  }
}

/**
 * Factory function to create a MainAgent from config
 */
export async function createMainAgent(
  dependencies: MainAgentDependencies,
  config: Config
): Promise<MainAgent> {
  const agentConfig: AgentConfig = {
    id: config.id,
    name: config.name,
    model: config.model,
    systemPrompt: config.systemPrompt,
    maxConcurrent: config.coordination.maxConcurrent,
    timeout: config.coordination.timeout,
    retryAttempts: config.coordination.retryAttempts,
    maxDepth: config.maxDepth,
  };

  const agent = new MainAgent(dependencies, agentConfig);

  // Register sub-agents from config
  for (const subConfig of config.subAgents) {
    if (subConfig.enabled) {
      agent.createSubAgent({
        id: subConfig.id,
        name: subConfig.name,
        model: subConfig.model ?? config.model,
        systemPrompt: subConfig.systemPrompt,
        specialization: subConfig.specialization,
        capabilities: subConfig.capabilities,
        priority: subConfig.priority,
      });
    }
  }

  return agent;
}
