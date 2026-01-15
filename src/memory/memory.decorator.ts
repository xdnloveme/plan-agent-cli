/**
 * Memory 装饰器和全局上下文管理
 * 提供多种方式为 Agent 添加 Memory 功能，不侵入原有代码
 *
 * Memory 开关由环境变量 ENABLE_MEMORY 控制，默认 false
 */

import { ChatOpenAI } from "@langchain/openai";
import { MemoryContext } from "./types";
import { createMemoryProxy } from "./MemoryProxy";
import { config } from "../../config/env";
import { createLogger } from "../utils/logger";

const logger = createLogger("MemoryDecorator");

/**
 * 全局 Memory 上下文管理
 * 单例模式，管理当前执行会话的 Memory 状态
 */
class MemoryContextManager {
  private static instance: MemoryContextManager;
  private currentPlanId: string | null = null;
  private outputDir: string;

  private constructor() {
    this.outputDir = config.memory.outputDir;
  }

  static getInstance(): MemoryContextManager {
    if (!MemoryContextManager.instance) {
      MemoryContextManager.instance = new MemoryContextManager();
    }
    return MemoryContextManager.instance;
  }

  /**
   * 检查 Memory 是否启用
   */
  isEnabled(): boolean {
    return config.memory.enabled;
  }

  /**
   * 设置当前 Plan ID（由 Orchestrator 调用）
   */
  setPlanId(planId: string): void {
    this.currentPlanId = planId;
    if (this.isEnabled()) {
      logger.info(`Memory session started for plan: ${planId}`);
    }
  }

  /**
   * 获取当前 Plan ID
   */
  getPlanId(): string | null {
    return this.currentPlanId;
  }

  /**
   * 清除当前 Plan ID（会话结束时调用）
   */
  clearPlanId(): void {
    if (this.currentPlanId && this.isEnabled()) {
      logger.info(`Memory session ended for plan: ${this.currentPlanId}`);
    }
    this.currentPlanId = null;
  }

  /**
   * 设置输出目录
   */
  setOutputDir(dir: string): void {
    this.outputDir = dir;
  }

  /**
   * 获取输出目录
   */
  getOutputDir(): string {
    return this.outputDir;
  }

  /**
   * 创建当前上下文
   */
  createContext(taskName: string): MemoryContext {
    return {
      planId: this.currentPlanId || "unknown",
      taskName,
      enabled: this.isEnabled() && this.currentPlanId !== null,
      outputDir: this.outputDir,
    };
  }
}

// 导出全局实例
export const memoryContextManager = MemoryContextManager.getInstance();

/**
 * 为 ChatOpenAI 模型添加 Memory 代理
 * 如果 Memory 未启用或没有 Plan ID，则返回原始 model
 *
 * @param model - ChatOpenAI 实例
 * @param taskName - 任务名称，用于记录
 * @returns 代理后的 ChatOpenAI 实例（或原始实例）
 */
export function wrapModelWithMemory<T extends ChatOpenAI>(
  model: T,
  taskName: string
): T {
  const manager = memoryContextManager;

  // 如果 Memory 未启用，直接返回原始 model
  if (!manager.isEnabled()) {
    return model;
  }

  // 创建代理包装器，每次调用时检查当前上下文
  return createDynamicMemoryProxy(model, taskName);
}

/**
 * 创建动态 Memory 代理
 * 代理会在每次调用时检查当前 Plan ID
 */
function createDynamicMemoryProxy<T extends ChatOpenAI>(
  model: T,
  taskName: string
): T {
  const manager = memoryContextManager;

  return new Proxy(model, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);

      // 拦截 invoke 方法
      if (prop === "invoke" && typeof value === "function") {
        return async function (...args: unknown[]) {
          const context = manager.createContext(taskName);

          // 如果有有效的 Plan ID，使用 Memory 代理
          if (context.enabled && context.planId !== "unknown") {
            const proxiedModel = createMemoryProxy(target, context);
            return (
              proxiedModel.invoke as (...args: unknown[]) => Promise<unknown>
            )(...args);
          }

          // 否则直接调用原始方法
          return (value as (...args: unknown[]) => Promise<unknown>).apply(
            target,
            args
          );
        };
      }

      // 拦截 withStructuredOutput 方法
      if (prop === "withStructuredOutput" && typeof value === "function") {
        return function (...args: unknown[]) {
          const structuredLLM = (value as (...args: unknown[]) => object).apply(
            target,
            args
          );
          return wrapStructuredLLMWithMemory(structuredLLM, taskName);
        };
      }

      // 其他方法直接返回
      if (typeof value === "function") {
        return value.bind(target);
      }

      return value;
    },
  }) as T;
}

/**
 * 包装 withStructuredOutput 返回的对象
 */
function wrapStructuredLLMWithMemory(
  structuredLLM: object,
  taskName: string
): object {
  const manager = memoryContextManager;

  return new Proxy(structuredLLM, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);

      if (prop === "invoke" && typeof value === "function") {
        return async function (...args: unknown[]) {
          const context = manager.createContext(taskName);

          if (context.enabled && context.planId !== "unknown") {
            // 记录调用
            const { memoryWriter } = await import("./MemoryWriter");
            const startTime = Date.now();

            try {
              const result = await (
                value as (...args: unknown[]) => Promise<unknown>
              ).apply(target, args);

              // 写入记录
              memoryWriter.write(
                {
                  taskName,
                  timestamp: new Date(startTime),
                  prompt:
                    typeof args[0] === "string"
                      ? args[0]
                      : JSON.stringify(args[0], null, 2),
                  response:
                    typeof result === "string"
                      ? result
                      : JSON.stringify(result, null, 2),
                },
                context
              );

              return result;
            } catch (error) {
              // 记录错误
              memoryWriter.write(
                {
                  taskName,
                  timestamp: new Date(startTime),
                  prompt:
                    typeof args[0] === "string"
                      ? args[0]
                      : JSON.stringify(args[0], null, 2),
                  response: `[ERROR] ${
                    error instanceof Error ? error.message : String(error)
                  }`,
                },
                context
              );

              throw error;
            }
          }

          return (value as (...args: unknown[]) => Promise<unknown>).apply(
            target,
            args
          );
        };
      }

      if (typeof value === "function") {
        return value.bind(target);
      }

      return value;
    },
  });
}

/**
 * 开始 Memory 会话
 * 由 AgentOrchestrator 在创建 Plan 后调用
 *
 * @param planId - Plan ID
 */
export function startMemorySession(planId: string): void {
  memoryContextManager.setPlanId(planId);
}

/**
 * 结束 Memory 会话
 * 由 AgentOrchestrator 在执行完成后调用
 */
export function endMemorySession(): void {
  memoryContextManager.clearPlanId();
}

/**
 * 设置 Memory 输出目录
 */
export function setMemoryOutputDir(dir: string): void {
  memoryContextManager.setOutputDir(dir);
}

/**
 * 检查 Memory 是否启用
 */
export function isMemoryEnabled(): boolean {
  return memoryContextManager.isEnabled();
}

/**
 * 获取当前 Plan ID
 */
export function getCurrentPlanId(): string | null {
  return memoryContextManager.getPlanId();
}

/**
 * 写入 Plan Overview（任务计划概览）
 * 由 AgentOrchestrator 在创建 Plan 后调用
 *
 * @param plan - TaskPlan 对象
 */
export async function writePlanOverview(plan: {
  id: string;
  originalInput: string;
  summary: string;
  createdAt: Date;
  tasks: Array<{
    id: string;
    description: string;
    priority: number | string;
    dependencies: string[];
    steps: Array<{
      id: string;
      action: string;
      expectedResult?: string;
    }>;
  }>;
}): Promise<void> {
  const manager = memoryContextManager;

  if (!manager.isEnabled()) {
    return;
  }

  const context = manager.createContext("PlanOverview");

  if (!context.enabled || context.planId === "unknown") {
    return;
  }

  const { memoryWriter } = await import("./MemoryWriter");
  await memoryWriter.writeOverview(plan, context);
}
