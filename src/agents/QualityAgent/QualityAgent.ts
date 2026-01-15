import { ChatOpenAI } from '@langchain/openai';
import {
  Task,
  ExecutionResult,
  ValidationResult,
  RepairPlan,
  QualityAgentConfig,
  AgentType,
} from '../../core/types';
import { Validator } from './Validator';
import { RepairEngine } from './RepairEngine';
import { getModelConfig } from '../../../config/models';
import { config } from '../../../config/env';
import { createLogger } from '../../utils/logger';
import { wrapModelWithMemory } from '../../memory/index';

const logger = createLogger('QualityAgent');

/**
 * 质量报告接口
 */
export interface QualityReport {
  taskId: string;
  validation: ValidationResult;
  repairPlan?: RepairPlan;
  overallStatus: 'passed' | 'failed' | 'repaired' | 'unrepairable';
}

/**
 * QualityAgent - 质量层
 * 负责任务验证、质量评估和修复
 */
export class QualityAgent {
  private model: ChatOpenAI;
  private validator: Validator;
  private repairEngine: RepairEngine;
  private agentConfig: QualityAgentConfig;
  private qualityHistory: Map<string, QualityReport[]> = new Map();

  constructor(agentConfig?: Partial<QualityAgentConfig>) {
    const modelConfig = getModelConfig('qualityAgent');

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
    this.model = wrapModelWithMemory(baseModel, 'QualityAgent');

    // 合并配置
    this.agentConfig = {
      type: AgentType.QUALITY,
      modelName: modelConfig.modelName,
      temperature: modelConfig.temperature,
      maxTokens: modelConfig.maxTokens,
      validationThreshold: 70,
      maxRepairAttempts: 3,
      ...agentConfig,
    };

    // 初始化子组件（传入已包装的 model）
    this.validator = new Validator(this.model, this.agentConfig.validationThreshold);
    this.repairEngine = new RepairEngine(this.model, this.agentConfig.maxRepairAttempts);

    logger.info('QualityAgent initialized', {
      model: this.agentConfig.modelName,
      threshold: this.agentConfig.validationThreshold,
    });
  }

  /**
   * 验证任务执行结果
   */
  async validate(task: Task, result: ExecutionResult): Promise<ValidationResult> {
    logger.info(`Validating task: ${task.id}`);

    const validation = await this.validator.validate(task, result);

    // 保存到历史记录
    this.saveToHistory(task.id, {
      taskId: task.id,
      validation,
      overallStatus: validation.valid ? 'passed' : 'failed',
    });

    return validation;
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

    return await this.repairEngine.generateRepairPlan(task, result, issues);
  }

  /**
   * 修复任务
   */
  async repair(task: Task, issues: string[]): Promise<Task> {
    logger.info(`Repairing task: ${task.id}`);

    const repairedTask = await this.repairEngine.repair(task, issues);

    // 更新历史记录
    const history = this.qualityHistory.get(task.id) || [];
    if (history.length > 0) {
      const lastReport = history[history.length - 1];
      lastReport.overallStatus = repairedTask !== task ? 'repaired' : 'unrepairable';
    }

    return repairedTask;
  }

  /**
   * 完整的质量检查流程
   */
  async fullQualityCheck(
    task: Task,
    result: ExecutionResult
  ): Promise<QualityReport> {
    logger.info(`Starting full quality check for task: ${task.id}`);

    // 1. 验证
    const validation = await this.validate(task, result);

    const report: QualityReport = {
      taskId: task.id,
      validation,
      overallStatus: validation.valid ? 'passed' : 'failed',
    };

    // 2. 如果验证失败，尝试生成修复计划
    if (!validation.valid) {
      const repairPlan = await this.generateRepairPlan(
        task,
        result,
        validation.issues
      );
      report.repairPlan = repairPlan;

      // 判断是否可修复
      if (repairPlan.repairedTask) {
        report.overallStatus = 'repaired';
      } else {
        report.overallStatus = 'unrepairable';
      }
    }

    // 保存报告
    this.saveToHistory(task.id, report);

    logger.info(`Quality check completed for task ${task.id}`, {
      status: report.overallStatus,
      score: report.validation.score,
    });

    return report;
  }

  /**
   * 批量质量检查
   */
  async batchQualityCheck(
    taskResults: Array<{ task: Task; result: ExecutionResult }>
  ): Promise<QualityReport[]> {
    logger.info(`Starting batch quality check for ${taskResults.length} tasks`);

    const reports = await Promise.all(
      taskResults.map(({ task, result }) => this.fullQualityCheck(task, result))
    );

    const passed = reports.filter((r) => r.overallStatus === 'passed').length;
    const repaired = reports.filter((r) => r.overallStatus === 'repaired').length;
    const failed = reports.filter(
      (r) => r.overallStatus === 'failed' || r.overallStatus === 'unrepairable'
    ).length;

    logger.info(`Batch quality check completed`, { passed, repaired, failed });

    return reports;
  }

  /**
   * 获取整体质量评分
   */
  getOverallScore(reports: QualityReport[]): number {
    const validations = reports.map((r) => r.validation);
    return this.validator.calculateOverallScore(validations);
  }

  /**
   * 获取质量历史记录
   */
  getQualityHistory(taskId?: string): QualityReport[] | Map<string, QualityReport[]> {
    if (taskId) {
      return this.qualityHistory.get(taskId) || [];
    }
    return new Map(this.qualityHistory);
  }

  /**
   * 保存到历史记录
   */
  private saveToHistory(taskId: string, report: QualityReport): void {
    const history = this.qualityHistory.get(taskId) || [];
    history.push(report);
    this.qualityHistory.set(taskId, history);
  }

  /**
   * 获取 Agent 配置
   */
  getConfig(): QualityAgentConfig {
    return { ...this.agentConfig };
  }

  /**
   * 更新 Agent 配置
   */
  updateConfig(updates: Partial<QualityAgentConfig>): void {
    this.agentConfig = {
      ...this.agentConfig,
      ...updates,
    };

    // 更新验证阈值
    if (updates.validationThreshold !== undefined) {
      this.validator.setValidationThreshold(updates.validationThreshold);
    }

    // 更新最大修复尝试次数
    if (updates.maxRepairAttempts !== undefined) {
      this.repairEngine.setMaxRepairAttempts(updates.maxRepairAttempts);
    }

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
      this.model = wrapModelWithMemory(baseModel, 'QualityAgent');

      this.validator = new Validator(this.model, this.agentConfig.validationThreshold || 70);
      this.repairEngine = new RepairEngine(
        this.model,
        this.agentConfig.maxRepairAttempts || 3
      );

      logger.info('QualityAgent model updated', {
        model: this.agentConfig.modelName,
      });
    }
  }

  /**
   * 清除历史记录
   */
  clearHistory(): void {
    this.qualityHistory.clear();
    logger.info('Quality history cleared');
  }
}
