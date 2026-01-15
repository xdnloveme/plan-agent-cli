import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
import { createLogger } from '../../utils/logger';

const logger = createLogger('TaskAnalyzer');

/**
 * 解析后的输入结构
 */
export interface ParsedInput {
  /** 主要目标 */
  mainGoal: string;
  /** 子目标列表 */
  subGoals: string[];
  /** 约束条件 */
  constraints: string[];
  /** 上下文信息 */
  context: string;
  /** 关键词 */
  keywords: string[];
}

/**
 * 分解后的任务结构
 */
export interface DecomposedTask {
  /** 任务 ID */
  id: string;
  /** 任务描述 */
  description: string;
  /** 任务类型 */
  type: string;
  /** 预估步骤数 */
  estimatedSteps: number;
  /** 依赖的任务 ID */
  dependencies: string[];
  /** 优先级 (1-4) */
  priority: number;
}

/**
 * 分解结果
 */
export interface DecompositionResult {
  tasks: DecomposedTask[];
  summary: string;
}

/**
 * 解析结果的 Zod Schema
 */
const parsedInputSchema = z.object({
  mainGoal: z.string().describe('用户的主要目标'),
  subGoals: z.array(z.string()).describe('子目标列表'),
  constraints: z.array(z.string()).describe('约束条件'),
  context: z.string().describe('上下文信息'),
  keywords: z.array(z.string()).describe('关键词'),
});

/**
 * 分解结果的 Zod Schema
 */
const decompositionSchema = z.object({
  tasks: z.array(
    z.object({
      id: z.string().describe('任务唯一标识符，格式如 task_1, task_2'),
      description: z.string().describe('任务的详细描述'),
      type: z.string().describe('任务类型，如 analysis, implementation, testing'),
      estimatedSteps: z.number().describe('预估执行步骤数'),
      dependencies: z.array(z.string()).describe('依赖的任务 ID 列表'),
      priority: z.number().min(1).max(4).describe('优先级，1-4，4最高'),
    })
  ).describe('分解后的任务列表'),
  summary: z.string().describe('任务分解的总结说明'),
});

/**
 * 任务分析器
 * 负责语义解析和任务分解
 */
export class TaskAnalyzer {
  private model: ChatOpenAI;

  constructor(model: ChatOpenAI) {
    this.model = model;
  }

  /**
   * 解析用户输入
   */
  async parse(input: string): Promise<ParsedInput> {
    logger.info('Parsing user input');
    logger.debug('Input:', input);

    const structuredLlm = this.model.withStructuredOutput(parsedInputSchema);

    const prompt = `你是一个任务分析专家。请分析以下用户输入，提取关键信息。

用户输入：
${input}

请提取：
1. 主要目标：用户想要实现的核心目标
2. 子目标：实现主要目标需要完成的子任务
3. 约束条件：任何限制或要求
4. 上下文信息：背景信息
5. 关键词：重要的技术术语或概念`;

    try {
      const result = await structuredLlm.invoke(prompt);
      logger.debug('Parsed result:', result);
      return result as ParsedInput;
    } catch (error) {
      logger.error('Failed to parse input', error);
      throw new Error(`Failed to parse input: ${error}`);
    }
  }

  /**
   * 分解任务
   */
  async decompose(parsed: ParsedInput): Promise<DecompositionResult> {
    logger.info('Decomposing tasks');

    const structuredLlm = this.model.withStructuredOutput(decompositionSchema);

    const prompt = `你是一个任务分解专家。根据以下分析结果，将任务分解为可执行的子任务。

分析结果：
- 主要目标：${parsed.mainGoal}
- 子目标：${parsed.subGoals.join(', ')}
- 约束条件：${parsed.constraints.join(', ')}
- 上下文：${parsed.context}
- 关键词：${parsed.keywords.join(', ')}

请将任务分解为具体的、可执行的子任务。每个任务应该：
1. 有明确的描述
2. 有合理的任务类型分类
3. 标注依赖关系（哪些任务必须在其他任务之后执行）
4. 设置优先级（1最低，4最高）

注意：
- 任务 ID 格式为 task_1, task_2 等
- 确保依赖关系不会形成循环
- 独立任务应该没有依赖
- 优先处理基础和核心任务`;

    try {
      const result = await structuredLlm.invoke(prompt);
      logger.debug('Decomposition result:', result);
      return result as DecompositionResult;
    } catch (error) {
      logger.error('Failed to decompose tasks', error);
      throw new Error(`Failed to decompose tasks: ${error}`);
    }
  }
}
