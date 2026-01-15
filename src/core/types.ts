/**
 * 核心类型定义
 * 定义系统中使用的所有核心接口和类型
 */

/**
 * 任务状态枚举
 */
export enum TaskStatus {
  PENDING = 'pending',
  EXECUTING = 'executing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  RETRYING = 'retrying',
  CANCELLED = 'cancelled',
}

/**
 * 任务优先级枚举
 */
export enum TaskPriority {
  LOW = 1,
  MEDIUM = 2,
  HIGH = 3,
  CRITICAL = 4,
}

/**
 * 任务步骤接口
 */
export interface Step {
  id: string;
  action: string;
  parameters: Record<string, unknown>;
  expectedResult?: string;
  order: number;
}

/**
 * 任务接口
 */
export interface Task {
  id: string;
  description: string;
  steps: Step[];
  dependencies: string[];
  status: TaskStatus;
  priority: TaskPriority;
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, unknown>;
}

/**
 * 任务计划接口
 */
export interface TaskPlan {
  id: string;
  originalInput: string;
  tasks: Task[];
  createdAt: Date;
  summary: string;
}

/**
 * 执行结果接口
 */
export interface ExecutionResult {
  taskId: string;
  stepId?: string;
  success: boolean;
  output: unknown;
  error?: string;
  timestamp: Date;
  duration?: number;
}

/**
 * 验证结果接口
 */
export interface ValidationResult {
  valid: boolean;
  score: number;
  issues: string[];
  suggestions: string[];
  timestamp: Date;
}

/**
 * 修复计划接口
 */
export interface RepairPlan {
  taskId: string;
  originalIssues: string[];
  suggestions: string[];
  repairedTask?: Task;
}

/**
 * 执行摘要接口
 */
export interface ExecutionSummary {
  planId: string;
  success: boolean;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  results: ExecutionResult[];
  startTime: Date;
  endTime: Date;
  duration: number;
}

/**
 * Agent 类型枚举
 */
export enum AgentType {
  PLAN = 'plan',
  RUN = 'run',
  QUALITY = 'quality',
  ORCHESTRATOR = 'orchestrator',
}

/**
 * Agent 配置接口
 */
export interface AgentConfig {
  type: AgentType;
  modelName: string;
  temperature: number;
  maxTokens: number;
  systemPrompt?: string;
}

/**
 * PlanAgent 配置接口
 */
export interface PlanAgentConfig extends AgentConfig {
  type: AgentType.PLAN;
  maxTasksPerPlan?: number;
  enableDependencyAnalysis?: boolean;
}

/**
 * RunAgent 配置接口
 */
export interface RunAgentConfig extends AgentConfig {
  type: AgentType.RUN;
  maxConcurrentTasks?: number;
  resourcePoolSize?: number;
}

/**
 * QualityAgent 配置接口
 */
export interface QualityAgentConfig extends AgentConfig {
  type: AgentType.QUALITY;
  validationThreshold?: number;
  maxRepairAttempts?: number;
}

/**
 * 创建任务的工厂函数
 */
export function createTask(params: {
  id: string;
  description: string;
  steps?: Step[];
  dependencies?: string[];
  priority?: TaskPriority;
}): Task {
  const now = new Date();
  return {
    id: params.id,
    description: params.description,
    steps: params.steps || [],
    dependencies: params.dependencies || [],
    status: TaskStatus.PENDING,
    priority: params.priority || TaskPriority.MEDIUM,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * 创建步骤的工厂函数
 */
export function createStep(params: {
  id: string;
  action: string;
  parameters?: Record<string, unknown>;
  expectedResult?: string;
  order: number;
}): Step {
  return {
    id: params.id,
    action: params.action,
    parameters: params.parameters || {},
    expectedResult: params.expectedResult,
    order: params.order,
  };
}
