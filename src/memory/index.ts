/**
 * Memory 模块 - 统一导出
 *
 * 该模块用于记录 CLI 访问 LLM 大模型的每次 prompt 记录
 * 采用代理模式实现，不侵入原有 Agent 代码
 *
 * Memory 开关由环境变量 ENABLE_MEMORY 控制，默认 false
 */

// 类型导出
export type {
  MemoryEntry,
  MemoryConfig,
  MemoryContext,
  LLMInvokeInput,
  LLMInvokeOutput,
  InvokableLLM,
  ProxiedLLM,
} from "./types";

// MemoryWriter 导出
export { MemoryWriter, memoryWriter } from "./MemoryWriter";
export type { PlanOverview } from "./MemoryWriter";

// MemoryProxy 导出
export {
  MemoryProxy,
  createMemoryProxy,
  createDefaultContext,
} from "./MemoryProxy";

// 装饰器和上下文管理导出
export {
  // 上下文管理器
  memoryContextManager,

  // Model 包装函数
  wrapModelWithMemory,

  // 会话管理
  startMemorySession,
  endMemorySession,
  setMemoryOutputDir,

  // 工具函数
  isMemoryEnabled,
  getCurrentPlanId,

  // Plan Overview 写入
  writePlanOverview,
} from "./memory.decorator";
