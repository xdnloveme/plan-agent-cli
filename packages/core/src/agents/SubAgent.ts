import { BaseAgent, type AgentDependencies } from './BaseAgent';
import type { AgentContext, AgentResult, SubAgentConfig } from './types';

/**
 * Abstract base class for sub-agents
 *
 * Sub-agents are specialized agents that handle specific types of tasks.
 * They are managed by a coordinator and can be selected based on their
 * capabilities and priority.
 */
export abstract class SubAgent extends BaseAgent {
  /** Domain specialization */
  abstract readonly specialization: string;

  /** List of capabilities this agent provides */
  abstract readonly capabilities: string[];

  /** Priority for selection (higher = preferred) */
  readonly priority: number;

  protected readonly subAgentConfig: SubAgentConfig;

  constructor(dependencies: AgentDependencies, config: SubAgentConfig) {
    super(dependencies, config);
    this.subAgentConfig = config;
    this.priority = config.priority ?? 5;
  }

  /**
   * Check if this agent can handle the given task
   */
  abstract canHandle(task: string, context?: AgentContext): boolean;

  /**
   * Get a score indicating how well this agent can handle a task
   * Higher score = better fit (0-100)
   */
  getCapabilityScore(task: string, _context?: AgentContext): number {
    // Default implementation: simple keyword matching
    const taskLower = task.toLowerCase();
    let score = 0;

    // Check specialization match
    if (taskLower.includes(this.specialization.toLowerCase())) {
      score += 50;
    }

    // Check capability matches
    for (const capability of this.capabilities) {
      if (taskLower.includes(capability.toLowerCase())) {
        score += 20;
      }
    }

    // Normalize to 0-100
    return Math.min(100, score);
  }

  /**
   * Get agent description for prompt generation
   */
  getDescription(): string {
    return `${this.name} (${this.specialization}): Capabilities - ${this.capabilities.join(', ')}`;
  }
}

/**
 * Simple sub-agent that uses tool-based execution
 */
export class ToolSubAgent extends SubAgent {
  readonly specialization: string;
  readonly capabilities: string[];

  private toolNames: string[];
  private keywords: string[];

  constructor(
    dependencies: AgentDependencies,
    config: SubAgentConfig & {
      toolNames?: string[];
      keywords?: string[];
    }
  ) {
    super(dependencies, config);
    this.specialization = config.specialization;
    this.capabilities = config.capabilities;
    this.toolNames = config.toolNames ?? [];
    this.keywords = config.keywords ?? [];
  }

  canHandle(task: string, _context?: AgentContext): boolean {
    const taskLower = task.toLowerCase();

    // Check if task contains any of our keywords
    for (const keyword of this.keywords) {
      if (taskLower.includes(keyword.toLowerCase())) {
        return true;
      }
    }

    // Check if task mentions any of our capabilities
    for (const capability of this.capabilities) {
      if (taskLower.includes(capability.toLowerCase())) {
        return true;
      }
    }

    return false;
  }

  async execute(task: string, context?: AgentContext): Promise<AgentResult> {
    const ctx = this.createContext(context);
    const taskId = this.generateTaskId();

    this.emitTaskStart(taskId, task);
    this.logger?.info(`SubAgent ${this.name} executing task`, { taskId, task });

    try {
      // Check depth limit
      if (this.isMaxDepthExceeded(ctx)) {
        return {
          success: false,
          content: 'Maximum recursion depth exceeded',
          error: new Error('Max depth exceeded'),
        };
      }

      // Add task to memory
      this.addToMemory(ctx.conversationId, 'user', task);

      // Get history for context
      const history = this.memory.getRecentMessages(ctx.conversationId);
      const messages = this.toCoreMessages(history);

      // Build tools subset if specific tools are configured
      let tools = this.tools.toCoreTools(this.id);
      if (this.toolNames.length > 0) {
        tools = Object.fromEntries(
          Object.entries(tools).filter(([name]) => this.toolNames.includes(name))
        );
      }

      // Generate response with tools
      const result = await this.generateWithTools(messages, { tools });

      // Add response to memory
      if (result.success) {
        this.addToMemory(ctx.conversationId, 'assistant', result.content);
      }

      this.emitTaskComplete(taskId, result);
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.emitTaskError(taskId, err);
      this.logger?.error(`SubAgent ${this.name} failed`, { taskId, error });

      return {
        success: false,
        content: '',
        error: err,
      };
    }
  }
}

/**
 * Factory function to create a simple tool-based sub-agent
 */
export function createToolSubAgent(
  dependencies: AgentDependencies,
  config: SubAgentConfig & {
    toolNames?: string[];
    keywords?: string[];
  }
): ToolSubAgent {
  return new ToolSubAgent(dependencies, config);
}
