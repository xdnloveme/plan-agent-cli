import { config } from './env';

/**
 * LLM 模型配置接口
 */
export interface ModelConfig {
  modelName: string;
  temperature: number;
  maxTokens: number;
  timeout?: number;
}

/**
 * 各 Agent 的模型配置
 */
export const modelConfigs: Record<string, ModelConfig> = {
  /**
   * PlanAgent 模型配置
   * 使用低温度以获得更稳定、结构化的输出
   */
  planAgent: {
    modelName: config.models.planAgent,
    temperature: 0.1,
    maxTokens: 4000,
    timeout: config.execution.timeoutMs,
  },

  /**
   * RunAgent 模型配置
   * 执行层使用中等温度，平衡创造性和准确性
   */
  runAgent: {
    modelName: config.models.runAgent,
    temperature: 0.2,
    maxTokens: 2000,
    timeout: config.execution.timeoutMs,
  },

  /**
   * QualityAgent 模型配置
   * 质量层使用低温度以获得精确的验证结果
   */
  qualityAgent: {
    modelName: config.models.qualityAgent,
    temperature: 0.1,
    maxTokens: 3000,
    timeout: config.execution.timeoutMs,
  },
};

/**
 * 获取指定 Agent 的模型配置
 */
export function getModelConfig(agentType: string): ModelConfig {
  const modelConfig = modelConfigs[agentType];
  if (!modelConfig) {
    throw new Error(`Unknown agent type: ${agentType}`);
  }
  return modelConfig;
}
