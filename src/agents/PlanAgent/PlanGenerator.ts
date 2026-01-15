import { ChatOpenAI } from '@langchain/openai';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import {
  Task,
  TaskPlan,
  Step,
  TaskStatus,
  TaskPriority,
  createStep,
} from '../../core/types';
import { DecomposedTask, DecompositionResult } from './TaskAnalyzer';
import { createLogger } from '../../utils/logger';

const logger = createLogger('PlanGenerator');

/**
 * 步骤生成结果的 Zod Schema
 */
const stepsSchema = z.object({
  steps: z.array(
    z.object({
      action: z.string().describe('步骤的具体操作'),
      parameters: z.record(z.unknown()).describe('步骤参数'),
      expectedResult: z.string().describe('预期结果'),
    })
  ).describe('任务的执行步骤'),
});

/**
 * 计划生成器
 * 负责生成结构化的任务计划
 */
export class PlanGenerator {
  private model: ChatOpenAI;

  constructor(model: ChatOpenAI) {
    this.model = model;
  }

  /**
   * 根据分解结果生成完整的任务计划
   */
  async generate(
    decomposition: DecompositionResult,
    originalInput: string
  ): Promise<TaskPlan> {
    logger.info('Generating task plan');

    const tasks: Task[] = [];

    // 为每个分解的任务生成详细步骤
    for (const decomposedTask of decomposition.tasks) {
      const steps = await this.generateSteps(decomposedTask);
      const task = this.createTaskFromDecomposed(decomposedTask, steps);
      tasks.push(task);
    }

    const plan: TaskPlan = {
      id: `plan_${uuidv4()}`,
      originalInput,
      tasks,
      createdAt: new Date(),
      summary: decomposition.summary,
    };

    logger.info(`Generated plan with ${tasks.length} tasks`);
    return plan;
  }

  /**
   * 为任务生成详细步骤
   */
  private async generateSteps(task: DecomposedTask): Promise<Step[]> {
    logger.debug(`Generating steps for task: ${task.id}`);

    const structuredLlm = this.model.withStructuredOutput(stepsSchema);

    const prompt = `为以下任务生成具体的执行步骤：

任务ID：${task.id}
任务描述：${task.description}
任务类型：${task.type}
预估步骤数：${task.estimatedSteps}

请生成 ${task.estimatedSteps} 个具体的执行步骤。每个步骤应包含：
1. action: 具体要执行的操作
2. parameters: 执行所需的参数（JSON 对象）
3. expectedResult: 步骤完成后的预期结果

步骤应该：
- 具体且可执行
- 有明确的输入输出
- 按逻辑顺序排列`;

    try {
      const result = await structuredLlm.invoke(prompt);
      const stepsResult = result as { steps: Array<{ action: string; parameters: Record<string, unknown>; expectedResult: string }> };

      return stepsResult.steps.map((step, index) =>
        createStep({
          id: `${task.id}_step_${index + 1}`,
          action: step.action,
          parameters: step.parameters,
          expectedResult: step.expectedResult,
          order: index + 1,
        })
      );
    } catch (error) {
      logger.error(`Failed to generate steps for task ${task.id}`, error);
      // 返回默认步骤
      return [
        createStep({
          id: `${task.id}_step_1`,
          action: task.description,
          parameters: {},
          expectedResult: '任务完成',
          order: 1,
        }),
      ];
    }
  }

  /**
   * 从分解的任务创建完整的 Task 对象
   */
  private createTaskFromDecomposed(
    decomposed: DecomposedTask,
    steps: Step[]
  ): Task {
    const priorityMap: Record<number, TaskPriority> = {
      1: TaskPriority.LOW,
      2: TaskPriority.MEDIUM,
      3: TaskPriority.HIGH,
      4: TaskPriority.CRITICAL,
    };

    const now = new Date();

    return {
      id: decomposed.id,
      description: decomposed.description,
      steps,
      dependencies: decomposed.dependencies,
      status: TaskStatus.PENDING,
      priority: priorityMap[decomposed.priority] || TaskPriority.MEDIUM,
      createdAt: now,
      updatedAt: now,
      metadata: {
        type: decomposed.type,
        estimatedSteps: decomposed.estimatedSteps,
      },
    };
  }

  /**
   * 分析任务间的依赖关系
   */
  async analyzeDependencies(tasks: DecomposedTask[]): Promise<Map<string, string[]>> {
    logger.info('Analyzing task dependencies');

    const dependencies = new Map<string, string[]>();

    // 首先使用已有的依赖关系
    for (const task of tasks) {
      dependencies.set(task.id, [...task.dependencies]);
    }

    // 可以在这里添加更复杂的依赖分析逻辑
    // 例如通过 LLM 分析隐式依赖

    return dependencies;
  }
}
