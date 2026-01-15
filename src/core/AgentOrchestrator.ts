import { PlanAgent } from "../agents/PlanAgent/index";
import { RunAgent } from "../agents/RunAgent/index";
import { QualityAgent } from "../agents/QualityAgent/index";
import { TaskScheduler } from "../scheduler/index";
import {
  Task,
  TaskPlan,
  ExecutionResult,
  ExecutionSummary,
  AgentType,
} from "./types";
import { getA2AProtocol } from "../protocols/index";
import { config } from "../../config/env";
import { createLogger } from "../utils/logger";
import {
  startMemorySession,
  endMemorySession,
  isMemoryEnabled,
  writePlanOverview,
} from "../memory/index";

const logger = createLogger("AgentOrchestrator");

/**
 * 编排器状态
 */
export enum OrchestratorStatus {
  IDLE = "idle",
  PLANNING = "planning",
  EXECUTING = "executing",
  VALIDATING = "validating",
  REPAIRING = "repairing",
  COMPLETED = "completed",
  FAILED = "failed",
}

/**
 * 编排器事件
 */
export interface OrchestratorEvent {
  type:
    | "plan_created"
    | "task_started"
    | "task_completed"
    | "task_failed"
    | "validation_complete"
    | "repair_attempt";
  timestamp: Date;
  data: unknown;
}

/**
 * AgentOrchestrator - 核心编排器
 * 整合三层 Agent 和调度器，实现完整的任务执行流程
 */
export class AgentOrchestrator {
  private planAgent: PlanAgent;
  private runAgent: RunAgent;
  private qualityAgent: QualityAgent;
  private scheduler: TaskScheduler;

  private status: OrchestratorStatus = OrchestratorStatus.IDLE;
  private currentPlan?: TaskPlan;
  private events: OrchestratorEvent[] = [];
  private maxRetries: number;

  constructor(
    planAgent: PlanAgent,
    runAgent: RunAgent,
    qualityAgent: QualityAgent
  ) {
    this.planAgent = planAgent;
    this.runAgent = runAgent;
    this.qualityAgent = qualityAgent;
    this.scheduler = new TaskScheduler();
    this.maxRetries = config.execution.maxRetries;

    // 注册 A2A 协议监听器
    this.registerProtocolListeners();

    logger.info("AgentOrchestrator initialized");
  }

  /**
   * 注册协议监听器
   */
  private registerProtocolListeners(): void {
    const protocol = getA2AProtocol();

    // Orchestrator 监听器
    protocol.registerListener({
      agentType: AgentType.ORCHESTRATOR,
      handler: async (message) => {
        logger.debug("Orchestrator received message", { type: message.type });
        return { received: true, status: this.status };
      },
    });
  }

  /**
   * 创建任务计划
   */
  async createPlan(input: string): Promise<TaskPlan> {
    logger.info("Creating task plan");
    this.status = OrchestratorStatus.PLANNING;

    try {
      const plan = await this.planAgent.analyze(input);
      this.currentPlan = plan;

      // 启动 Memory 会话（如果已启用）
      if (isMemoryEnabled()) {
        startMemorySession(plan.id);
        logger.debug(`Memory session started for plan: ${plan.id}`);

        // 写入 Plan Overview
        await writePlanOverview({
          id: plan.id,
          originalInput: plan.originalInput,
          summary: plan.summary,
          createdAt: plan.createdAt,
          tasks: plan.tasks.map((task) => ({
            id: task.id,
            description: task.description,
            priority: task.priority,
            dependencies: task.dependencies,
            steps: task.steps.map((step) => ({
              id: step.id,
              action: step.action,
              expectedResult: step.expectedResult,
            })),
          })),
        });
        logger.debug(`Plan overview written for plan: ${plan.id}`);
      }

      this.emitEvent("plan_created", {
        planId: plan.id,
        taskCount: plan.tasks.length,
      });
      logger.success(`Plan created: ${plan.id}`);

      return plan;
    } catch (error) {
      this.status = OrchestratorStatus.FAILED;
      throw error;
    }
  }

  /**
   * 执行完整流程
   */
  async execute(input: string): Promise<ExecutionSummary> {
    const startTime = new Date();
    logger.info("Starting execution pipeline");

    try {
      // 1. 生成计划
      const plan = await this.createPlan(input);

      // 2. 初始化调度器
      this.scheduler.reset();
      this.scheduler.addTasksFromArray(plan.tasks);
      this.scheduler.buildGraph();

      // 3. 获取执行计划
      const schedule = this.scheduler.getExecutionPlan();

      if (schedule.hasCycle) {
        throw new Error(
          `Circular dependency detected: ${schedule.cycleNodes?.join(", ")}`
        );
      }

      // 4. 按层级执行
      this.status = OrchestratorStatus.EXECUTING;
      const results: ExecutionResult[] = [];

      for (const layer of schedule.executionOrder) {
        logger.info(`Executing layer with ${layer.length} tasks`);

        // 并行执行同一层的任务
        const layerResults = await this.executeLayer(layer, plan);
        results.push(...layerResults);
      }

      // 5. 生成执行摘要
      const endTime = new Date();
      const summary = this.createExecutionSummary(
        plan,
        results,
        startTime,
        endTime
      );

      this.status = OrchestratorStatus.COMPLETED;
      logger.success("Execution pipeline completed", {
        success: summary.success,
        completed: summary.completedTasks,
        failed: summary.failedTasks,
      });

      // 结束 Memory 会话
      if (isMemoryEnabled()) {
        endMemorySession();
        logger.debug("Memory session ended");
      }

      return summary;
    } catch (error) {
      this.status = OrchestratorStatus.FAILED;
      logger.error("Execution pipeline failed", error);

      // 即使失败也要结束 Memory 会话
      if (isMemoryEnabled()) {
        endMemorySession();
      }

      throw error;
    }
  }

  /**
   * 执行一层任务
   */
  private async executeLayer(
    taskIds: string[],
    plan: TaskPlan
  ): Promise<ExecutionResult[]> {
    const tasks = taskIds
      .map((id) => plan.tasks.find((t) => t.id === id))
      .filter((t): t is Task => t !== undefined);

    const results: ExecutionResult[] = [];

    // 并行执行所有任务
    await Promise.all(
      tasks.map(async (task) => {
        const result = await this.executeTaskWithRetry(task);
        results.push(result);
      })
    );

    return results;
  }

  /**
   * 执行任务（带重试和修复）
   */
  private async executeTaskWithRetry(task: Task): Promise<ExecutionResult> {
    let currentTask = task;
    let retryCount = 0;
    let lastResult: ExecutionResult | null = null;

    this.emitEvent("task_started", { taskId: task.id });
    this.scheduler.markExecuting(task.id);

    while (retryCount <= this.maxRetries) {
      // 1. 执行任务
      const result = await this.runAgent.executeTask(currentTask);
      lastResult = result;

      // 2. 验证结果
      this.status = OrchestratorStatus.VALIDATING;
      const qualityReport = await this.qualityAgent.fullQualityCheck(
        currentTask,
        result
      );

      // 3. 如果验证通过，完成任务
      if (qualityReport.validation.valid) {
        this.scheduler.markCompleted(task.id);
        this.emitEvent("task_completed", { taskId: task.id, result });
        return result;
      }

      // 4. 如果验证失败，尝试修复
      logger.warn(
        `Task ${task.id} validation failed, attempting repair (${
          retryCount + 1
        }/${this.maxRetries})`
      );
      this.status = OrchestratorStatus.REPAIRING;

      if (qualityReport.repairPlan?.repairedTask) {
        this.emitEvent("repair_attempt", {
          taskId: task.id,
          attempt: retryCount + 1,
        });
        currentTask = qualityReport.repairPlan.repairedTask;
        this.scheduler.markRetrying(task.id);
      } else {
        // 无法修复，直接失败
        break;
      }

      retryCount++;
    }

    // 所有重试都失败
    this.scheduler.markFailed(task.id);
    this.emitEvent("task_failed", { taskId: task.id, result: lastResult });

    return (
      lastResult || {
        taskId: task.id,
        success: false,
        output: null,
        error: "Max retries exceeded",
        timestamp: new Date(),
      }
    );
  }

  /**
   * 创建执行摘要
   */
  private createExecutionSummary(
    plan: TaskPlan,
    results: ExecutionResult[],
    startTime: Date,
    endTime: Date
  ): ExecutionSummary {
    const completedTasks = results.filter((r) => r.success).length;
    const failedTasks = results.length - completedTasks;

    return {
      planId: plan.id,
      success: failedTasks === 0,
      totalTasks: plan.tasks.length,
      completedTasks,
      failedTasks,
      results,
      startTime,
      endTime,
      duration: endTime.getTime() - startTime.getTime(),
    };
  }

  /**
   * 发出事件
   */
  private emitEvent(type: OrchestratorEvent["type"], data: unknown): void {
    const event: OrchestratorEvent = {
      type,
      timestamp: new Date(),
      data,
    };
    this.events.push(event);
    logger.debug(`Event emitted: ${type}`);
  }

  /**
   * 获取当前状态
   */
  getStatus(): OrchestratorStatus {
    return this.status;
  }

  /**
   * 获取当前计划
   */
  getCurrentPlan(): TaskPlan | undefined {
    return this.currentPlan;
  }

  /**
   * 获取事件历史
   */
  getEvents(): OrchestratorEvent[] {
    return [...this.events];
  }

  /**
   * 获取调度器
   */
  getScheduler(): TaskScheduler {
    return this.scheduler;
  }

  /**
   * 获取进度信息
   */
  getProgress(): {
    total: number;
    completed: number;
    failed: number;
    percentage: number;
  } {
    const total = this.scheduler.getTotalCount();
    const completed = this.scheduler.getCompletedCount();
    const failed = this.scheduler.getFailedCount();
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

    return { total, completed, failed, percentage };
  }

  /**
   * 重置编排器
   */
  reset(): void {
    this.status = OrchestratorStatus.IDLE;
    this.currentPlan = undefined;
    this.events = [];
    this.scheduler.reset();
    this.runAgent.reset();
    this.qualityAgent.clearHistory();

    logger.info("AgentOrchestrator reset");
  }
}
