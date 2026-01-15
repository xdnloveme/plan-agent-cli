import { ChatOpenAI } from '@langchain/openai';
import { Task, ExecutionResult, RunAgentConfig, AgentType } from '../../core/types';
import { TaskExecutor } from './TaskExecutor';
import { ResourceManager } from './ResourceManager';
import { getModelConfig } from '../../../config/models';
import { config } from '../../../config/env';
import { createLogger } from '../../utils/logger';
import { wrapModelWithMemory } from '../../memory/index';

const logger = createLogger('RunAgent');

/**
 * RunAgent - 执行层
 * 负责任务执行、资源管理和状态跟踪
 */
export class RunAgent {
  private model: ChatOpenAI;
  private taskExecutor: TaskExecutor;
  private resourceManager: ResourceManager;
  private agentConfig: RunAgentConfig;
  private executingTasks: Set<string> = new Set();

  constructor(agentConfig?: Partial<RunAgentConfig>) {
    const modelConfig = getModelConfig('runAgent');

    // 初始化 LLM
    const baseModel = new ChatOpenAI({
      modelName: modelConfig.modelName,
      temperature: modelConfig.temperature,
      maxTokens: modelConfig.maxTokens,
      openAIApiKey: config.openai.apiKey,
      configuration: {
        baseURL: config.openai.baseUrl,
      },
    });

    // 使用 Memory 代理包装 model
    this.model = wrapModelWithMemory(baseModel, 'RunAgent');

    // 初始化子组件（传入已包装的 model）
    this.taskExecutor = new TaskExecutor(this.model);
    this.resourceManager = new ResourceManager();

    // 合并配置
    this.agentConfig = {
      type: AgentType.RUN,
      modelName: modelConfig.modelName,
      temperature: modelConfig.temperature,
      maxTokens: modelConfig.maxTokens,
      maxConcurrentTasks: 5,
      resourcePoolSize: 10,
      ...agentConfig,
    };

    logger.info('RunAgent initialized', {
      model: this.agentConfig.modelName,
      maxConcurrent: this.agentConfig.maxConcurrentTasks,
    });
  }

  /**
   * 执行单个任务
   */
  async executeTask(task: Task): Promise<ExecutionResult> {
    logger.info(`Starting task execution: ${task.id}`);

    // 检查是否达到并发限制
    if (this.executingTasks.size >= (this.agentConfig.maxConcurrentTasks || 5)) {
      return {
        taskId: task.id,
        success: false,
        output: null,
        error: 'Max concurrent tasks reached',
        timestamp: new Date(),
      };
    }

    // 标记任务为执行中
    this.executingTasks.add(task.id);

    try {
      // 1. 检查依赖（假设依赖已在调度层处理）
      logger.debug('Checking dependencies');

      // 2. 分配资源
      logger.debug('Allocating resources');
      const resources = await this.resourceManager.allocate(task.id);

      if (!resources.success) {
        return {
          taskId: task.id,
          success: false,
          output: null,
          error: resources.message || 'Resource allocation failed',
          timestamp: new Date(),
        };
      }

      // 3. 执行任务
      logger.debug('Executing task');
      const result = await this.taskExecutor.execute(task, resources);

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Task ${task.id} execution error`, error);

      return {
        taskId: task.id,
        success: false,
        output: null,
        error: errorMessage,
        timestamp: new Date(),
      };
    } finally {
      // 释放资源
      this.resourceManager.release(task.id);
      this.executingTasks.delete(task.id);
    }
  }

  /**
   * 批量执行任务（并行）
   */
  async executeTasks(tasks: Task[]): Promise<ExecutionResult[]> {
    logger.info(`Executing ${tasks.length} tasks in parallel`);

    const results = await Promise.all(
      tasks.map((task) => this.executeTask(task))
    );

    const successCount = results.filter((r) => r.success).length;
    logger.info(`Batch execution completed: ${successCount}/${tasks.length} successful`);

    return results;
  }

  /**
   * 获取当前执行中的任务数
   */
  getExecutingTaskCount(): number {
    return this.executingTasks.size;
  }

  /**
   * 检查是否可以接受新任务
   */
  canAcceptTask(): boolean {
    return this.executingTasks.size < (this.agentConfig.maxConcurrentTasks || 5);
  }

  /**
   * 获取资源使用情况
   */
  getResourceStats(): Record<string, { capacity: number; used: number; available: number }> {
    return this.resourceManager.getUsageStats();
  }

  /**
   * 获取执行历史
   */
  getExecutionHistory(taskId?: string): ExecutionResult[] | Map<string, ExecutionResult[]> {
    if (taskId) {
      return this.taskExecutor.getExecutionHistory(taskId);
    }
    return this.taskExecutor.getAllExecutionHistory();
  }

  /**
   * 获取 Agent 配置
   */
  getConfig(): RunAgentConfig {
    return { ...this.agentConfig };
  }

  /**
   * 更新 Agent 配置
   */
  updateConfig(updates: Partial<RunAgentConfig>): void {
    this.agentConfig = {
      ...this.agentConfig,
      ...updates,
    };

    // 如果模型配置改变，重新初始化 LLM
    if (updates.modelName || updates.temperature || updates.maxTokens) {
      const baseModel = new ChatOpenAI({
        modelName: this.agentConfig.modelName,
        temperature: this.agentConfig.temperature,
        maxTokens: this.agentConfig.maxTokens,
        openAIApiKey: config.openai.apiKey,
        configuration: {
          baseURL: config.openai.baseUrl,
        },
      });

      // 使用 Memory 代理包装 model
      this.model = wrapModelWithMemory(baseModel, 'RunAgent');

      this.taskExecutor = new TaskExecutor(this.model);

      logger.info('RunAgent model updated', {
        model: this.agentConfig.modelName,
      });
    }
  }

  /**
   * 重置 Agent 状态
   */
  reset(): void {
    this.executingTasks.clear();
    this.resourceManager.reset();
    this.taskExecutor.clearHistory();
    logger.info('RunAgent reset');
  }
}
