/**
 * MemoryProxy - LLM 代理类
 * 使用代理模式拦截 LLM 的 invoke 调用，记录 prompt 和 response
 * 
 * 设计原则：
 * - 代理模式：不侵入原有 Agent 代码
 * - 低耦合：Memory 功能与业务逻辑分离
 * - 高内聚：所有 Memory 相关功能集中在此模块
 */

import { ChatOpenAI } from '@langchain/openai';
import { MemoryContext, MemoryEntry, LLMInvokeInput } from './types';
import { memoryWriter } from './MemoryWriter';
import { createLogger } from '../utils/logger';

const logger = createLogger('MemoryProxy');

/**
 * 将 LLM 输入转换为字符串
 */
function inputToString(input: LLMInvokeInput): string {
  if (typeof input === 'string') {
    return input;
  }
  return JSON.stringify(input, null, 2);
}

/**
 * 将 LLM 输出转换为字符串
 */
function outputToString(output: unknown): string {
  if (typeof output === 'string') {
    return output;
  }
  
  // 处理 LangChain 消息对象
  if (output && typeof output === 'object') {
    // AIMessage 对象
    if ('content' in output) {
      const content = (output as { content: unknown }).content;
      if (typeof content === 'string') {
        return content;
      }
      return JSON.stringify(content, null, 2);
    }
    // 其他对象
    return JSON.stringify(output, null, 2);
  }
  
  return String(output);
}

/**
 * MemoryProxy 类
 * 使用 JavaScript Proxy 包装 LLM 实例，拦截所有方法调用
 */
export class MemoryProxy<T extends ChatOpenAI> {
  private originalLLM: T;
  private context: MemoryContext;

  constructor(llm: T, context: MemoryContext) {
    this.originalLLM = llm;
    this.context = context;
  }

  /**
   * 创建代理后的 LLM 实例
   */
  createProxy(): T {
    const self = this;
    
    return new Proxy(this.originalLLM, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);
        
        // 如果是 invoke 方法，进行包装
        if (prop === 'invoke' && typeof value === 'function') {
          return self.wrapInvoke(value.bind(target));
        }
        
        // 如果是 withStructuredOutput 方法，返回包装后的对象
        if (prop === 'withStructuredOutput' && typeof value === 'function') {
          return (...args: unknown[]) => {
            const structuredLLM = value.apply(target, args);
            return self.wrapStructuredLLM(structuredLLM);
          };
        }
        
        // 其他方法直接返回
        if (typeof value === 'function') {
          return value.bind(target);
        }
        
        return value;
      }
    }) as T;
  }

  /**
   * 包装 invoke 方法
   */
  private wrapInvoke(originalInvoke: (input: LLMInvokeInput, options?: Record<string, unknown>) => Promise<unknown>) {
    const self = this;
    
    return async function(input: LLMInvokeInput, options?: Record<string, unknown>): Promise<unknown> {
      const startTime = Date.now();
      let response: unknown;
      let error: Error | null = null;

      try {
        response = await originalInvoke(input, options);
        return response;
      } catch (err) {
        error = err instanceof Error ? err : new Error(String(err));
        throw error;
      } finally {
        // 无论成功失败都记录
        self.recordInvocation(input, response, error, startTime);
      }
    };
  }

  /**
   * 包装 withStructuredOutput 返回的对象
   */
  private wrapStructuredLLM(structuredLLM: { invoke: (input: LLMInvokeInput, options?: Record<string, unknown>) => Promise<unknown> }) {
    const self = this;
    
    return new Proxy(structuredLLM, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);
        
        if (prop === 'invoke' && typeof value === 'function') {
          return self.wrapInvoke(value.bind(target));
        }
        
        if (typeof value === 'function') {
          return value.bind(target);
        }
        
        return value;
      }
    });
  }

  /**
   * 记录 LLM 调用
   */
  private recordInvocation(
    input: LLMInvokeInput,
    output: unknown,
    error: Error | null,
    startTime: number
  ): void {
    if (!this.context.enabled) {
      return;
    }

    try {
      const entry: MemoryEntry = {
        taskName: this.context.taskName,
        timestamp: new Date(startTime),
        prompt: inputToString(input),
        response: error 
          ? `[ERROR] ${error.message}` 
          : outputToString(output),
      };

      // 异步写入，不阻塞主流程
      memoryWriter.write(entry, this.context).catch((writeError) => {
        logger.error('Failed to write memory entry', writeError);
      });
    } catch (err) {
      logger.error('Failed to record invocation', err);
    }
  }

  /**
   * 更新上下文
   */
  updateContext(updates: Partial<MemoryContext>): void {
    this.context = {
      ...this.context,
      ...updates,
    };
  }

  /**
   * 获取当前上下文
   */
  getContext(): MemoryContext {
    return { ...this.context };
  }

  /**
   * 获取原始 LLM 实例
   */
  getOriginalLLM(): T {
    return this.originalLLM;
  }
}

/**
 * 创建带 Memory 功能的 LLM 代理
 * 
 * @param llm - 原始 ChatOpenAI 实例
 * @param context - Memory 上下文配置
 * @returns 代理后的 LLM 实例
 * 
 * @example
 * ```typescript
 * const model = new ChatOpenAI({ ... });
 * const proxiedModel = createMemoryProxy(model, {
 *   planId: 'plan_123',
 *   taskName: 'TaskAnalyzer',
 *   enabled: true,
 *   outputDir: process.cwd()
 * });
 * // 使用 proxiedModel 替代原始 model
 * const result = await proxiedModel.invoke('Hello');
 * ```
 */
export function createMemoryProxy<T extends ChatOpenAI>(
  llm: T,
  context: MemoryContext
): T {
  const proxy = new MemoryProxy(llm, context);
  return proxy.createProxy();
}

/**
 * 创建默认的 Memory 上下文
 */
export function createDefaultContext(
  planId: string,
  taskName: string,
  enabled: boolean = true
): MemoryContext {
  return {
    planId,
    taskName,
    enabled,
    outputDir: process.cwd(),
  };
}
