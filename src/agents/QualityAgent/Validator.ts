import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
import { Task, ExecutionResult, ValidationResult } from '../../core/types';
import { createLogger } from '../../utils/logger';

const logger = createLogger('Validator');

/**
 * 验证结果的 Zod Schema
 */
const validationSchema = z.object({
  valid: z.boolean().describe('任务执行结果是否有效'),
  score: z.number().min(0).max(100).describe('质量评分（0-100）'),
  issues: z.array(z.string()).describe('发现的问题列表'),
  suggestions: z.array(z.string()).describe('改进建议'),
  reasoning: z.string().describe('验证推理过程'),
});

/**
 * 验证器
 * 负责验证任务执行结果的正确性和质量
 */
export class Validator {
  private model: ChatOpenAI;
  private validationThreshold: number;

  constructor(model: ChatOpenAI, validationThreshold: number = 70) {
    this.model = model;
    this.validationThreshold = validationThreshold;
  }

  /**
   * 验证任务执行结果
   */
  async validate(task: Task, result: ExecutionResult): Promise<ValidationResult> {
    logger.info(`Validating task: ${task.id}`);

    // 如果执行失败，直接返回无效结果
    if (!result.success) {
      return {
        valid: false,
        score: 0,
        issues: [result.error || 'Task execution failed'],
        suggestions: ['Fix the execution error and retry'],
        timestamp: new Date(),
      };
    }

    const structuredLlm = this.model.withStructuredOutput(validationSchema);

    const prompt = `你是一个质量验证专家。请验证以下任务的执行结果。

任务信息：
- 任务ID: ${task.id}
- 任务描述: ${task.description}
- 步骤数: ${task.steps.length}
- 预期结果: ${task.steps.map((s) => s.expectedResult).filter(Boolean).join(', ')}

执行结果：
${JSON.stringify(result.output, null, 2)}

请验证：
1. 执行结果是否满足任务要求
2. 每个步骤是否都正确执行
3. 输出质量如何（0-100分）
4. 存在哪些问题
5. 有什么改进建议

验证标准：
- 完整性：所有步骤都已执行
- 正确性：结果符合预期
- 质量：输出质量是否令人满意`;

    try {
      const validationResult = await structuredLlm.invoke(prompt);
      const typedResult = validationResult as {
        valid: boolean;
        score: number;
        issues: string[];
        suggestions: string[];
        reasoning: string;
      };

      // 根据阈值调整有效性判断
      const isValid = typedResult.score >= this.validationThreshold && typedResult.valid;

      const finalResult: ValidationResult = {
        valid: isValid,
        score: typedResult.score,
        issues: typedResult.issues,
        suggestions: typedResult.suggestions,
        timestamp: new Date(),
      };

      logger.info(`Validation completed for task ${task.id}`, {
        valid: finalResult.valid,
        score: finalResult.score,
      });

      return finalResult;
    } catch (error) {
      logger.error(`Validation error for task ${task.id}`, error);
      return {
        valid: false,
        score: 0,
        issues: [`Validation error: ${error}`],
        suggestions: ['Retry validation'],
        timestamp: new Date(),
      };
    }
  }

  /**
   * 批量验证任务
   */
  async validateBatch(
    taskResults: Array<{ task: Task; result: ExecutionResult }>
  ): Promise<ValidationResult[]> {
    logger.info(`Validating ${taskResults.length} tasks`);

    const results = await Promise.all(
      taskResults.map(({ task, result }) => this.validate(task, result))
    );

    const validCount = results.filter((r) => r.valid).length;
    logger.info(`Batch validation completed: ${validCount}/${results.length} valid`);

    return results;
  }

  /**
   * 计算总体质量评分
   */
  calculateOverallScore(validations: ValidationResult[]): number {
    if (validations.length === 0) {
      return 0;
    }

    const totalScore = validations.reduce((sum, v) => sum + v.score, 0);
    return Math.round(totalScore / validations.length);
  }

  /**
   * 设置验证阈值
   */
  setValidationThreshold(threshold: number): void {
    this.validationThreshold = Math.max(0, Math.min(100, threshold));
    logger.info(`Validation threshold set to ${this.validationThreshold}`);
  }

  /**
   * 获取验证阈值
   */
  getValidationThreshold(): number {
    return this.validationThreshold;
  }
}
