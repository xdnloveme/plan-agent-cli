import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

/**
 * 环境变量配置
 * 所有配置项从环境变量读取，提供合理的默认值
 */
export const config = {
  // OpenAI API 配置
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
  },

  // 各 Agent 使用的模型
  models: {
    planAgent: process.env.PLAN_AGENT_MODEL || 'gpt-4',
    runAgent: process.env.RUN_AGENT_MODEL || 'gpt-3.5-turbo',
    qualityAgent: process.env.QUALITY_AGENT_MODEL || 'gpt-4',
  },

  // 执行配置
  execution: {
    maxRetries: parseInt(process.env.MAX_RETRIES || '3', 10),
    timeoutMs: parseInt(process.env.TIMEOUT_MS || '30000', 10),
  },

  // 日志配置
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || './logs/agent.log',
  },

  // 调试模式
  debug: process.env.DEBUG === 'true',

  // Memory 配置 - 记录 LLM 交互
  memory: {
    enabled: process.env.ENABLE_MEMORY === 'true',
    outputDir: process.env.MEMORY_OUTPUT_DIR || process.cwd(),
  },
} as const;

/**
 * 验证必要的环境变量是否已配置
 */
export function validateConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config.openai.apiKey) {
    errors.push('OPENAI_API_KEY is required');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export type Config = typeof config;
