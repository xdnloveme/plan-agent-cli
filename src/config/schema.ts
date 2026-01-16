import { z } from 'zod';

/**
 * Model provider configuration schema
 */
export const modelConfigSchema = z.object({
  /** Model provider */
  provider: z.enum(['openai', 'anthropic', 'google', 'custom']),
  /** Model name */
  name: z.string().min(1),
  /** Custom base URL */
  baseURL: z.string().url().optional(),
  /** API key (optional, defaults to env var) */
  apiKey: z.string().optional(),
  /** Additional options */
  options: z.record(z.unknown()).optional(),
});

/**
 * Sub-agent configuration schema
 */
export const subAgentConfigSchema = z.object({
  /** Agent identifier */
  id: z.string().min(1),
  /** Agent name */
  name: z.string().min(1),
  /** Specialization domain */
  specialization: z.string().min(1),
  /** Capabilities */
  capabilities: z.array(z.string()),
  /** Priority (1-10, higher = preferred) */
  priority: z.number().min(1).max(10).default(5),
  /** Whether this agent is enabled */
  enabled: z.boolean().default(true),
  /** Model configuration (optional, inherits from parent) */
  model: modelConfigSchema.optional(),
  /** System prompt override */
  systemPrompt: z.string().optional(),
});

/**
 * Coordination configuration schema
 */
export const coordinationConfigSchema = z.object({
  /** Maximum concurrent executions */
  maxConcurrent: z.number().min(1).max(10).default(3),
  /** Timeout in milliseconds */
  timeout: z.number().min(1000).default(30000),
  /** Retry attempts */
  retryAttempts: z.number().min(0).max(5).default(2),
  /** Selection strategy */
  selectionStrategy: z
    .enum(['priority', 'capability-match', 'round-robin'])
    .default('capability-match'),
});

/**
 * Main configuration schema
 */
export const configSchema = z.object({
  /** Agent identifier */
  id: z.string().min(1).default('main-agent'),
  /** Agent name */
  name: z.string().min(1).default('Main Agent'),
  /** Model configuration */
  model: modelConfigSchema,
  /** System prompt */
  systemPrompt: z.string().optional(),
  /** Sub-agents configuration */
  subAgents: z.array(subAgentConfigSchema).default([]),
  /** Coordination settings */
  coordination: coordinationConfigSchema.default({}),
  /** Maximum recursion depth */
  maxDepth: z.number().min(1).max(10).default(3),
  /** Enable debug logging */
  debug: z.boolean().default(false),
});

/**
 * Inferred configuration type
 */
export type Config = z.infer<typeof configSchema>;

/**
 * Inferred model configuration type
 */
export type ModelConfigType = z.infer<typeof modelConfigSchema>;

/**
 * Inferred sub-agent configuration type
 */
export type SubAgentConfigType = z.infer<typeof subAgentConfigSchema>;

/**
 * Inferred coordination configuration type
 */
export type CoordinationConfigType = z.infer<typeof coordinationConfigSchema>;

/**
 * Validate and parse configuration
 */
export function parseConfig(config: unknown): Config {
  return configSchema.parse(config);
}

/**
 * Validate configuration without throwing
 */
export function validateConfig(config: unknown): { success: true; data: Config } | { success: false; error: z.ZodError } {
  const result = configSchema.safeParse(config);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}
