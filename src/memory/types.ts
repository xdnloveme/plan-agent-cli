/**
 * Memory 模块类型定义
 * 用于记录 CLI 访问 LLM 大模型的每次 prompt 记录
 */

/**
 * Memory 记录条目
 */
export interface MemoryEntry {
  /** 任务 Task 名称 */
  taskName: string;
  /** 任务时间戳 */
  timestamp: Date;
  /** 任务和 LLM 沟通的提示词内容 */
  prompt: string;
  /** 大模型返回的内容 */
  response: string;
}

/**
 * Memory 配置选项
 */
export interface MemoryConfig {
  /** Plan ID，用于创建子目录 */
  planId: string;
  /** 任务名称 */
  taskName: string;
  /** 是否启用 Memory 记录，默认 true */
  enabled?: boolean;
  /** 自定义输出目录，默认为当前工作目录下的 .memory */
  outputDir?: string;
}

/**
 * Memory 上下文
 * 用于在代理执行期间传递配置
 */
export interface MemoryContext {
  /** Plan ID */
  planId: string;
  /** 当前任务名称 */
  taskName: string;
  /** 是否启用 */
  enabled: boolean;
  /** 输出目录 */
  outputDir: string;
}

/**
 * LLM 调用参数类型
 */
export type LLMInvokeInput = string | Array<unknown> | Record<string, unknown>;

/**
 * LLM 调用结果类型
 */
export type LLMInvokeOutput = unknown;

/**
 * 可拦截的 LLM 方法
 */
export interface InvokableLLM {
  invoke(input: LLMInvokeInput, options?: Record<string, unknown>): Promise<LLMInvokeOutput>;
}

/**
 * Memory 代理包装后的 LLM 接口
 */
export interface ProxiedLLM extends InvokableLLM {
  /** 原始 LLM 实例 */
  readonly _originalLLM: InvokableLLM;
  /** Memory 上下文 */
  readonly _memoryContext: MemoryContext;
}
