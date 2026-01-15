import { PlanAgent } from '../agents/PlanAgent/index';
import { RunAgent } from '../agents/RunAgent/index';
import { QualityAgent } from '../agents/QualityAgent/index';
import { AgentOrchestrator } from './AgentOrchestrator';
import {
  PlanAgentConfig,
  RunAgentConfig,
  QualityAgentConfig,
  AgentType,
} from './types';
import { createLogger } from '../utils/logger';

const logger = createLogger('AgentBuilder');

/**
 * Agent 建造者模式实现
 * 用于灵活配置和构建完整的 Agent 系统
 */
export class AgentBuilder {
  private planAgent?: PlanAgent;
  private runAgent?: RunAgent;
  private qualityAgent?: QualityAgent;

  private planAgentConfig?: Partial<PlanAgentConfig>;
  private runAgentConfig?: Partial<RunAgentConfig>;
  private qualityAgentConfig?: Partial<QualityAgentConfig>;

  constructor() {
    logger.debug('AgentBuilder initialized');
  }

  /**
   * 配置 PlanAgent
   */
  withPlanAgent(config?: Partial<PlanAgentConfig>): AgentBuilder {
    this.planAgentConfig = config;
    return this;
  }

  /**
   * 配置 RunAgent
   */
  withRunAgent(config?: Partial<RunAgentConfig>): AgentBuilder {
    this.runAgentConfig = config;
    return this;
  }

  /**
   * 配置 QualityAgent
   */
  withQualityAgent(config?: Partial<QualityAgentConfig>): AgentBuilder {
    this.qualityAgentConfig = config;
    return this;
  }

  /**
   * 使用已有的 PlanAgent 实例
   */
  usePlanAgent(agent: PlanAgent): AgentBuilder {
    this.planAgent = agent;
    return this;
  }

  /**
   * 使用已有的 RunAgent 实例
   */
  useRunAgent(agent: RunAgent): AgentBuilder {
    this.runAgent = agent;
    return this;
  }

  /**
   * 使用已有的 QualityAgent 实例
   */
  useQualityAgent(agent: QualityAgent): AgentBuilder {
    this.qualityAgent = agent;
    return this;
  }

  /**
   * 使用默认配置
   */
  withDefaults(): AgentBuilder {
    this.planAgentConfig = {
      type: AgentType.PLAN,
      modelName: 'gpt-4',
      temperature: 0.1,
      maxTokens: 4000,
      maxTasksPerPlan: 10,
      enableDependencyAnalysis: true,
    };

    this.runAgentConfig = {
      type: AgentType.RUN,
      modelName: 'gpt-3.5-turbo',
      temperature: 0.2,
      maxTokens: 2000,
      maxConcurrentTasks: 5,
      resourcePoolSize: 10,
    };

    this.qualityAgentConfig = {
      type: AgentType.QUALITY,
      modelName: 'gpt-4',
      temperature: 0.1,
      maxTokens: 3000,
      validationThreshold: 70,
      maxRepairAttempts: 3,
    };

    return this;
  }

  /**
   * 构建 AgentOrchestrator
   */
  build(): AgentOrchestrator {
    logger.info('Building AgentOrchestrator');

    // 创建 Agents（如果没有提供实例）
    const planAgent = this.planAgent || new PlanAgent(this.planAgentConfig);
    const runAgent = this.runAgent || new RunAgent(this.runAgentConfig);
    const qualityAgent = this.qualityAgent || new QualityAgent(this.qualityAgentConfig);

    const orchestrator = new AgentOrchestrator(planAgent, runAgent, qualityAgent);

    logger.success('AgentOrchestrator built successfully');

    return orchestrator;
  }

  /**
   * 验证配置是否完整
   */
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // 至少需要配置或提供一个 Agent
    if (!this.planAgent && !this.planAgentConfig) {
      errors.push('PlanAgent is not configured');
    }

    if (!this.runAgent && !this.runAgentConfig) {
      errors.push('RunAgent is not configured');
    }

    if (!this.qualityAgent && !this.qualityAgentConfig) {
      errors.push('QualityAgent is not configured');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * 重置建造者状态
   */
  reset(): AgentBuilder {
    this.planAgent = undefined;
    this.runAgent = undefined;
    this.qualityAgent = undefined;
    this.planAgentConfig = undefined;
    this.runAgentConfig = undefined;
    this.qualityAgentConfig = undefined;

    logger.debug('AgentBuilder reset');
    return this;
  }
}

/**
 * 创建 AgentBuilder 的便捷函数
 */
export function createAgentBuilder(): AgentBuilder {
  return new AgentBuilder();
}
