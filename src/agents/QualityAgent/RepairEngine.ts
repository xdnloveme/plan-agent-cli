import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
import { Task, ExecutionResult, RepairPlan, Step, createStep } from '../../core/types';
import { createLogger } from '../../utils/logger';

const logger = createLogger('RepairEngine');

/**
 * 修复计划的 Zod Schema
 */
const repairPlanSchema = z.object({
  canRepair: z.boolean().describe('是否可以修复'),
  repairStrategy: z.string().describe('修复策略'),
  suggestions: z.array(z.string()).describe('修复建议'),
  modifiedSteps: z.array(
    z.object({
      id: z.string().describe('步骤ID'),
      action: z.string().describe('修改后的操作'),
      parameters: z.record(z.unknown()).describe('修改后的参数'),
      expectedResult: z.string().describe('修改后的预期结果'),
      order: z.number().describe('步骤顺序'),
    })
  ).describe('修改后的步骤列表'),
  reasoning: z.string().describe('修复推理过程'),
});

/**
 * 修复引擎
 * 负责分析失败原因并生成修复方案
 */
export class RepairEngine {
  private model: ChatOpenAI;
  private maxRepairAttempts: number;

  constructor(model: ChatOpenAI, maxRepairAttempts: number = 3) {
    this.model = model;
    this.maxRepairAttempts = maxRepairAttempts;
  }

  /**
   * 生成修复计划
   */
  async generateRepairPlan(
    task: Task,
    result: ExecutionResult,
    issues: string[]
  ): Promise<RepairPlan> {
    logger.info(`Generating repair plan for task: ${task.id}`);

    const structuredLlm = this.model.withStructuredOutput(repairPlanSchema);

    const prompt = `你是一个任务修复专家。请分析以下任务的执行问题并生成修复方案。

任务信息：
- 任务ID: ${task.id}
- 任务描述: ${task.description}
- 当前步骤:
${task.steps.map((s) => `  - ${s.id}: ${s.action}`).join('\n')}

执行结果：
${JSON.stringify(result.output, null, 2)}

发现的问题：
${issues.map((i) => `- ${i}`).join('\n')}

请分析：
1. 问题的根本原因
2. 是否可以通过修改任务来修复
3. 具体的修复策略
4. 修改后的步骤（如果需要）

修复原则：
- 保持任务的原始意图
- 最小化修改范围
- 确保修复后的可执行性`;

    try {
      const repairResult = await structuredLlm.invoke(prompt);
      const typedResult = repairResult as {
        canRepair: boolean;
        repairStrategy: string;
        suggestions: string[];
        modifiedSteps: Array<{
          id: string;
          action: string;
          parameters: Record<string, unknown>;
          expectedResult: string;
          order: number;
        }>;
        reasoning: string;
      };

      const repairPlan: RepairPlan = {
        taskId: task.id,
        originalIssues: issues,
        suggestions: typedResult.suggestions,
      };

      // 如果可以修复，创建修复后的任务
      if (typedResult.canRepair && typedResult.modifiedSteps.length > 0) {
        const repairedSteps: Step[] = typedResult.modifiedSteps.map((s) =>
          createStep({
            id: s.id,
            action: s.action,
            parameters: s.parameters,
            expectedResult: s.expectedResult,
            order: s.order,
          })
        );

        repairPlan.repairedTask = {
          ...task,
          steps: repairedSteps,
          updatedAt: new Date(),
        };
      }

      logger.info(`Repair plan generated for task ${task.id}`, {
        canRepair: typedResult.canRepair,
        suggestions: repairPlan.suggestions.length,
      });

      return repairPlan;
    } catch (error) {
      logger.error(`Failed to generate repair plan for task ${task.id}`, error);
      return {
        taskId: task.id,
        originalIssues: issues,
        suggestions: ['Unable to generate repair plan, manual intervention required'],
      };
    }
  }

  /**
   * 执行修复
   */
  async repair(task: Task, issues: string[]): Promise<Task> {
    logger.info(`Repairing task: ${task.id}`);

    // 创建一个模拟的执行结果用于修复分析
    const mockResult: ExecutionResult = {
      taskId: task.id,
      success: false,
      output: null,
      error: issues.join('; '),
      timestamp: new Date(),
    };

    const repairPlan = await this.generateRepairPlan(task, mockResult, issues);

    if (repairPlan.repairedTask) {
      logger.success(`Task ${task.id} repaired successfully`);
      return repairPlan.repairedTask;
    }

    // 如果无法修复，返回原任务并添加修复建议到元数据
    logger.warn(`Task ${task.id} could not be automatically repaired`);
    return {
      ...task,
      metadata: {
        ...task.metadata,
        repairAttempted: true,
        repairSuggestions: repairPlan.suggestions,
      },
      updatedAt: new Date(),
    };
  }

  /**
   * 分析失败原因
   */
  async analyzeFailure(
    task: Task,
    result: ExecutionResult
  ): Promise<{ causes: string[]; severity: 'low' | 'medium' | 'high' | 'critical' }> {
    logger.info(`Analyzing failure for task: ${task.id}`);

    const analysisSchema = z.object({
      causes: z.array(z.string()).describe('失败原因列表'),
      severity: z.enum(['low', 'medium', 'high', 'critical']).describe('严重程度'),
      reasoning: z.string().describe('分析推理'),
    });

    const structuredLlm = this.model.withStructuredOutput(analysisSchema);

    const prompt = `分析以下任务执行失败的原因：

任务: ${task.description}
错误: ${result.error || 'Unknown error'}
输出: ${JSON.stringify(result.output, null, 2)}

请分析：
1. 失败的具体原因
2. 严重程度（low/medium/high/critical）`;

    try {
      const analysis = await structuredLlm.invoke(prompt);
      return analysis as { causes: string[]; severity: 'low' | 'medium' | 'high' | 'critical' };
    } catch (error) {
      logger.error('Failure analysis error', error);
      return {
        causes: ['Unable to analyze failure'],
        severity: 'medium',
      };
    }
  }

  /**
   * 获取最大修复尝试次数
   */
  getMaxRepairAttempts(): number {
    return this.maxRepairAttempts;
  }

  /**
   * 设置最大修复尝试次数
   */
  setMaxRepairAttempts(attempts: number): void {
    this.maxRepairAttempts = Math.max(1, attempts);
    logger.info(`Max repair attempts set to ${this.maxRepairAttempts}`);
  }
}
