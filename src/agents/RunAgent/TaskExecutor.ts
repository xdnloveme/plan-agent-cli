import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
import { Task, Step, ExecutionResult } from '../../core/types';
import { ResourceAllocation } from './ResourceManager';
import { createLogger } from '../../utils/logger';

const logger = createLogger('TaskExecutor');

/**
 * 步骤执行结果的 Zod Schema
 */
const stepExecutionSchema = z.object({
  success: z.boolean().describe('步骤是否执行成功'),
  output: z.string().describe('步骤执行的输出结果'),
  error: z.string().optional().describe('错误信息（如果有）'),
  nextAction: z.string().optional().describe('建议的下一步操作'),
});

/**
 * 步骤执行结果
 */
interface StepExecutionResult {
  success: boolean;
  output: string;
  error?: string;
  nextAction?: string;
}

/**
 * 任务执行器
 * 负责执行具体的任务和步骤
 */
export class TaskExecutor {
  private model: ChatOpenAI;
  private executionHistory: Map<string, ExecutionResult[]> = new Map();

  constructor(model: ChatOpenAI) {
    this.model = model;
  }

  /**
   * 执行任务
   */
  async execute(
    task: Task,
    resources: ResourceAllocation
  ): Promise<ExecutionResult> {
    logger.info(`Executing task: ${task.id}`);
    const startTime = Date.now();

    if (!resources.success) {
      return this.createFailureResult(task.id, 'Resource allocation failed', startTime);
    }

    try {
      // 按顺序执行每个步骤
      const stepResults: StepExecutionResult[] = [];
      let allStepsSuccessful = true;

      for (const step of task.steps.sort((a, b) => a.order - b.order)) {
        logger.debug(`Executing step: ${step.id}`);

        const stepResult = await this.executeStep(step, task, stepResults);
        stepResults.push(stepResult);

        if (!stepResult.success) {
          allStepsSuccessful = false;
          logger.warn(`Step ${step.id} failed: ${stepResult.error}`);
          break;
        }
      }

      const result: ExecutionResult = {
        taskId: task.id,
        success: allStepsSuccessful,
        output: {
          steps: stepResults,
          summary: this.generateExecutionSummary(stepResults),
        },
        timestamp: new Date(),
        duration: Date.now() - startTime,
      };

      if (!allStepsSuccessful) {
        const failedStep = stepResults.find((r) => !r.success);
        result.error = failedStep?.error || 'Unknown error';
      }

      // 保存执行历史
      this.saveToHistory(task.id, result);

      logger.info(`Task ${task.id} execution completed`, {
        success: result.success,
        duration: result.duration,
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Task ${task.id} execution error`, error);
      return this.createFailureResult(task.id, errorMessage, startTime);
    }
  }

  /**
   * 执行单个步骤
   */
  private async executeStep(
    step: Step,
    task: Task,
    previousResults: StepExecutionResult[]
  ): Promise<StepExecutionResult> {
    const structuredLlm = this.model.withStructuredOutput(stepExecutionSchema);

    const contextSummary = previousResults
      .map((r, i) => `步骤 ${i + 1}: ${r.success ? '成功' : '失败'} - ${r.output}`)
      .join('\n');

    const prompt = `你是一个任务执行专家。请模拟执行以下步骤并返回执行结果。

任务上下文：
- 任务ID: ${task.id}
- 任务描述: ${task.description}

当前步骤：
- 步骤ID: ${step.id}
- 操作: ${step.action}
- 参数: ${JSON.stringify(step.parameters)}
- 预期结果: ${step.expectedResult || '无特定要求'}

之前步骤的执行情况：
${contextSummary || '这是第一个步骤'}

请模拟执行这个步骤，并返回执行结果。包括：
1. 是否成功
2. 输出结果
3. 如果失败，错误信息
4. 建议的下一步操作（可选）`;

    try {
      const result = await structuredLlm.invoke(prompt);
      return result as StepExecutionResult;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        output: '',
        error: `Step execution error: ${errorMessage}`,
      };
    }
  }

  /**
   * 生成执行摘要
   */
  private generateExecutionSummary(results: StepExecutionResult[]): string {
    const total = results.length;
    const successful = results.filter((r) => r.success).length;
    const failed = total - successful;

    return `执行完成: ${successful}/${total} 步骤成功, ${failed} 步骤失败`;
  }

  /**
   * 创建失败结果
   */
  private createFailureResult(
    taskId: string,
    error: string,
    startTime: number
  ): ExecutionResult {
    return {
      taskId,
      success: false,
      output: null,
      error,
      timestamp: new Date(),
      duration: Date.now() - startTime,
    };
  }

  /**
   * 保存执行历史
   */
  private saveToHistory(taskId: string, result: ExecutionResult): void {
    const history = this.executionHistory.get(taskId) || [];
    history.push(result);
    this.executionHistory.set(taskId, history);
  }

  /**
   * 获取执行历史
   */
  getExecutionHistory(taskId: string): ExecutionResult[] {
    return this.executionHistory.get(taskId) || [];
  }

  /**
   * 获取所有执行历史
   */
  getAllExecutionHistory(): Map<string, ExecutionResult[]> {
    return new Map(this.executionHistory);
  }

  /**
   * 清除执行历史
   */
  clearHistory(): void {
    this.executionHistory.clear();
    logger.info('Execution history cleared');
  }
}
