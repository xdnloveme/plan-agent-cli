import type { CoreMessage, CoreTool } from 'ai';

/**
 * Message in conversation history
 */
export interface Message {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: Date;
  toolCallId?: string;
  toolName?: string;
}

/**
 * Context passed through agent execution
 */
export interface AgentContext {
  /** Unique conversation identifier */
  conversationId: string;
  /** Parent task ID for sub-task tracking */
  parentTaskId?: string;
  /** Conversation history */
  history: Message[];
  /** Runtime variables */
  variables: Map<string, unknown>;
  /** Maximum recursion depth for sub-agents */
  maxDepth?: number;
  /** Current depth in sub-agent calls */
  currentDepth?: number;
}

/**
 * Result returned by agent execution
 */
export interface AgentResult {
  /** Whether the execution was successful */
  success: boolean;
  /** The main content/response */
  content: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
  /** Tool calls made during execution */
  toolCalls?: ToolCallResult[];
  /** Errors encountered */
  error?: Error;
}

/**
 * Result of a tool call
 */
export interface ToolCallResult {
  toolName: string;
  toolCallId: string;
  args: Record<string, unknown>;
  result: unknown;
}

/**
 * Model configuration
 */
export interface ModelConfig {
  /** Model provider: openai, anthropic, google, or custom */
  provider: 'openai' | 'anthropic' | 'google' | 'custom';
  /** Model name/identifier */
  name: string;
  /** Custom base URL for API */
  baseURL?: string;
  /** API key (defaults to environment variable) */
  apiKey?: string;
  /** Additional provider-specific options */
  options?: Record<string, unknown>;
}

/**
 * Agent configuration
 */
export interface AgentConfig {
  /** Unique agent identifier */
  id: string;
  /** Agent name */
  name: string;
  /** Model configuration */
  model: ModelConfig;
  /** System prompt */
  systemPrompt?: string;
  /** Maximum concurrent sub-tasks */
  maxConcurrent?: number;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Maximum retry attempts */
  retryAttempts?: number;
  /** Maximum recursion depth for sub-agents */
  maxDepth?: number;
}

/**
 * Sub-agent configuration
 */
export interface SubAgentConfig extends AgentConfig {
  /** Specialization domain */
  specialization: string;
  /** Capabilities this agent provides */
  capabilities: string[];
  /** Priority for agent selection (higher = preferred) */
  priority?: number;
}

/**
 * Options for model generation
 */
export interface GenerateOptions {
  /** Messages to send */
  messages: CoreMessage[];
  /** System prompt override */
  systemPrompt?: string;
  /** Tools available for the model */
  tools?: Record<string, CoreTool>;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Temperature for randomness */
  temperature?: number;
  /** Stop sequences */
  stopSequences?: string[];
}

/**
 * Result from model generation
 */
export interface GenerateResult {
  /** Generated text content */
  text: string;
  /** Tool calls made by the model */
  toolCalls?: Array<{
    toolCallId: string;
    toolName: string;
    args: Record<string, unknown>;
  }>;
  /** Token usage information */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  /** Finish reason */
  finishReason?: 'stop' | 'length' | 'tool-calls' | 'content-filter' | 'other';
}

/**
 * Event types for agent lifecycle
 */
export interface AgentEvents {
  'task:start': { taskId: string; task: string; agentId: string };
  'task:complete': { taskId: string; result: AgentResult; agentId: string };
  'task:error': { taskId: string; error: Error; agentId: string };
  'tool:call': { toolName: string; args: Record<string, unknown>; agentId: string };
  'tool:result': { toolName: string; result: unknown; agentId: string };
  'subagent:selected': { subAgentId: string; task: string; parentAgentId: string };
  'subagent:complete': { subAgentId: string; result: AgentResult; parentAgentId: string };
}

/**
 * Coordination configuration
 */
export interface CoordinationConfig {
  /** Maximum concurrent sub-agent executions */
  maxConcurrent: number;
  /** Timeout for each sub-agent in milliseconds */
  timeout: number;
  /** Number of retry attempts */
  retryAttempts: number;
  /** Strategy for selecting sub-agents */
  selectionStrategy: 'priority' | 'capability-match' | 'round-robin';
}
