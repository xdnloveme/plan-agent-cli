import type { SubAgent } from './SubAgent';
import type { AgentContext, AgentResult, CoordinationConfig } from './types';
import type { TaskQueue } from '../utils/task-queue';
import type { EventBus } from '../utils/event-bus';
import type { Logger } from '../utils/logger';

/**
 * Selection strategy interface
 */
export interface SelectionStrategy {
  select(task: string, candidates: SubAgent[], context?: AgentContext): SubAgent | null;
}

/**
 * Priority-based selection strategy
 */
export class PrioritySelectionStrategy implements SelectionStrategy {
  select(task: string, candidates: SubAgent[], context?: AgentContext): SubAgent | null {
    // Filter to agents that can handle the task
    const capable = candidates.filter((agent) => agent.canHandle(task, context));

    if (capable.length === 0) {
      return null;
    }

    // Sort by priority (descending) and return highest
    capable.sort((a, b) => b.priority - a.priority);
    return capable[0];
  }
}

/**
 * Capability-match selection strategy
 */
export class CapabilityMatchStrategy implements SelectionStrategy {
  select(task: string, candidates: SubAgent[], context?: AgentContext): SubAgent | null {
    // Filter to agents that can handle the task
    const capable = candidates.filter((agent) => agent.canHandle(task, context));

    if (capable.length === 0) {
      return null;
    }

    // Score each agent and sort by score (descending)
    const scored = capable.map((agent) => ({
      agent,
      score: agent.getCapabilityScore(task, context) + agent.priority * 2,
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored[0].agent;
  }
}

/**
 * Round-robin selection strategy
 */
export class RoundRobinStrategy implements SelectionStrategy {
  private lastIndex = -1;

  select(task: string, candidates: SubAgent[], context?: AgentContext): SubAgent | null {
    // Filter to agents that can handle the task
    const capable = candidates.filter((agent) => agent.canHandle(task, context));

    if (capable.length === 0) {
      return null;
    }

    // Move to next index
    this.lastIndex = (this.lastIndex + 1) % capable.length;
    return capable[this.lastIndex];
  }
}

/**
 * Coordinator dependencies
 */
export interface CoordinatorDependencies {
  taskQueue: TaskQueue;
  eventBus: EventBus;
  logger?: Logger;
}

/**
 * Agent coordinator for managing sub-agent selection and execution
 *
 * Handles task distribution, parallel execution, and result aggregation.
 */
export class AgentCoordinator {
  private subAgents: Map<string, SubAgent> = new Map();
  private selectionStrategy: SelectionStrategy;
  private taskQueue: TaskQueue;
  private eventBus: EventBus;
  private logger?: Logger;
  private config: CoordinationConfig;

  constructor(dependencies: CoordinatorDependencies, config: Partial<CoordinationConfig> = {}) {
    this.taskQueue = dependencies.taskQueue;
    this.eventBus = dependencies.eventBus;
    this.logger = dependencies.logger;

    this.config = {
      maxConcurrent: config.maxConcurrent ?? 3,
      timeout: config.timeout ?? 30000,
      retryAttempts: config.retryAttempts ?? 2,
      selectionStrategy: config.selectionStrategy ?? 'capability-match',
    };

    // Initialize selection strategy
    this.selectionStrategy = this.createStrategy(this.config.selectionStrategy);
  }

  /**
   * Register a sub-agent
   */
  registerSubAgent(agent: SubAgent): void {
    this.subAgents.set(agent.id, agent);
    this.logger?.info(`Registered sub-agent: ${agent.name}`, {
      id: agent.id,
      specialization: agent.specialization,
      capabilities: agent.capabilities,
    });
  }

  /**
   * Unregister a sub-agent
   */
  unregisterSubAgent(agentId: string): boolean {
    const result = this.subAgents.delete(agentId);
    if (result) {
      this.logger?.info(`Unregistered sub-agent: ${agentId}`);
    }
    return result;
  }

  /**
   * Get a sub-agent by ID
   */
  getSubAgent(agentId: string): SubAgent | undefined {
    return this.subAgents.get(agentId);
  }

  /**
   * Get all registered sub-agents
   */
  getAllSubAgents(): SubAgent[] {
    return Array.from(this.subAgents.values());
  }

  /**
   * Select a sub-agent for a task
   */
  selectSubAgent(task: string, context?: AgentContext): SubAgent | null {
    const candidates = Array.from(this.subAgents.values());
    const selected = this.selectionStrategy.select(task, candidates, context);

    if (selected) {
      this.eventBus.emit('subagent:selected', {
        subAgentId: selected.id,
        task,
        parentAgentId: context?.parentTaskId ?? 'main',
      });
      this.logger?.debug(`Selected sub-agent: ${selected.name}`, { task });
    }

    return selected;
  }

  /**
   * Execute a task using the best matching sub-agent
   */
  async executeTask(task: string, context?: AgentContext): Promise<AgentResult> {
    const agent = this.selectSubAgent(task, context);

    if (!agent) {
      return {
        success: false,
        content: 'No suitable sub-agent found for this task',
        error: new Error('No matching sub-agent'),
      };
    }

    return this.executeWithRetry(agent, task, context);
  }

  /**
   * Execute multiple tasks in parallel
   */
  async executeParallel(
    tasks: Array<{ task: string; context?: AgentContext }>
  ): Promise<AgentResult[]> {
    const taskPromises = tasks.map(({ task, context }) =>
      this.taskQueue.add(() => this.executeTask(task, context), {
        timeout: this.config.timeout,
        priority: 5,
      })
    );

    return Promise.all(taskPromises);
  }

  /**
   * Execute tasks sequentially
   */
  async executeSequential(
    tasks: Array<{ task: string; context?: AgentContext }>
  ): Promise<AgentResult[]> {
    const results: AgentResult[] = [];

    for (const { task, context } of tasks) {
      const result = await this.executeTask(task, context);
      results.push(result);

      // Stop on error if needed
      if (!result.success) {
        this.logger?.warn('Sequential execution stopped due to error', { task });
        break;
      }
    }

    return results;
  }

  /**
   * Execute with retry logic
   */
  private async executeWithRetry(
    agent: SubAgent,
    task: string,
    context?: AgentContext
  ): Promise<AgentResult> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.config.retryAttempts; attempt++) {
      try {
        if (attempt > 0) {
          this.logger?.info(`Retrying task (attempt ${attempt + 1})`, {
            agentId: agent.id,
            task,
          });
        }

        const result = await this.executeWithTimeout(agent, task, context);

        // Emit completion event
        this.eventBus.emit('subagent:complete', {
          subAgentId: agent.id,
          result,
          parentAgentId: context?.parentTaskId ?? 'main',
        });

        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.logger?.warn(`Task execution failed (attempt ${attempt + 1})`, {
          agentId: agent.id,
          error: lastError.message,
        });
      }
    }

    return {
      success: false,
      content: '',
      error: lastError ?? new Error('Unknown error'),
    };
  }

  /**
   * Execute with timeout
   */
  private async executeWithTimeout(
    agent: SubAgent,
    task: string,
    context?: AgentContext
  ): Promise<AgentResult> {
    return new Promise<AgentResult>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Task timed out after ${this.config.timeout}ms`));
      }, this.config.timeout);

      agent
        .execute(task, context)
        .then((result) => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  /**
   * Create selection strategy instance
   */
  private createStrategy(type: CoordinationConfig['selectionStrategy']): SelectionStrategy {
    switch (type) {
      case 'priority':
        return new PrioritySelectionStrategy();
      case 'round-robin':
        return new RoundRobinStrategy();
      case 'capability-match':
      default:
        return new CapabilityMatchStrategy();
    }
  }

  /**
   * Set selection strategy
   */
  setSelectionStrategy(strategy: SelectionStrategy | CoordinationConfig['selectionStrategy']): void {
    if (typeof strategy === 'string') {
      this.selectionStrategy = this.createStrategy(strategy);
    } else {
      this.selectionStrategy = strategy;
    }
  }

  /**
   * Get coordinator statistics
   */
  getStats(): {
    subAgentCount: number;
    subAgents: Array<{ id: string; name: string; specialization: string }>;
    queueStatus: ReturnType<TaskQueue['getStatus']>;
  } {
    return {
      subAgentCount: this.subAgents.size,
      subAgents: Array.from(this.subAgents.values()).map((agent) => ({
        id: agent.id,
        name: agent.name,
        specialization: agent.specialization,
      })),
      queueStatus: this.taskQueue.getStatus(),
    };
  }

  /**
   * Get sub-agent descriptions for prompt generation
   */
  getSubAgentDescriptions(): string {
    const agents = Array.from(this.subAgents.values());
    if (agents.length === 0) {
      return 'No sub-agents available.';
    }

    return agents.map((agent) => agent.getDescription()).join('\n');
  }
}
