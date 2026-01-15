import { Task, TaskStatus } from '../core/types';
import { DAGraph } from './DAGraph';
import { DAGNode, ITaskScheduler, ScheduleResult } from './types';
import { createLogger } from '../utils/logger';

const logger = createLogger('TaskScheduler');

/**
 * 任务调度器
 * 基于 DAG 实现任务的依赖分析和执行调度
 */
export class TaskScheduler implements ITaskScheduler<Task> {
  private graph: DAGraph<Task>;
  private completedTasks: Set<string>;
  private failedTasks: Set<string>;
  private taskMap: Map<string, Task>;

  constructor() {
    this.graph = new DAGraph<Task>();
    this.completedTasks = new Set();
    this.failedTasks = new Set();
    this.taskMap = new Map();
  }

  /**
   * 添加单个任务
   */
  addTask(node: DAGNode<Task>): void {
    logger.debug(`Adding task: ${node.id}`);
    this.graph.addNode(node);
    this.taskMap.set(node.id, node.data);
  }

  /**
   * 批量添加任务
   */
  addTasks(nodes: DAGNode<Task>[]): void {
    logger.info(`Adding ${nodes.length} tasks to scheduler`);
    for (const node of nodes) {
      this.addTask(node);
    }
  }

  /**
   * 从 Task 数组构建调度器
   */
  addTasksFromArray(tasks: Task[]): void {
    const nodes: DAGNode<Task>[] = tasks.map((task) => ({
      id: task.id,
      data: task,
      dependencies: task.dependencies,
    }));
    this.addTasks(nodes);
  }

  /**
   * 构建依赖图
   */
  buildGraph(): void {
    logger.info('Building dependency graph');
    this.graph.buildFromDependencies();
    logger.debug(`Graph built with ${this.graph.getNodeCount()} nodes`);
  }

  /**
   * 获取执行计划
   */
  getExecutionPlan(): ScheduleResult<Task> {
    logger.info('Generating execution plan');

    // 检测循环依赖
    if (this.graph.hasCycle()) {
      const cycleNodes = this.graph.findCycleNodes();
      logger.error('Circular dependency detected', cycleNodes);
      return {
        executionOrder: [],
        hasCycle: true,
        cycleNodes,
        nodeMap: this.taskMap,
      };
    }

    // 执行拓扑排序
    const executionOrder = this.graph.topologicalSort();
    logger.info(`Execution plan generated with ${executionOrder.length} layers`);

    return {
      executionOrder,
      hasCycle: false,
      nodeMap: this.taskMap,
    };
  }

  /**
   * 获取下一批可执行的任务
   * 返回所有依赖已完成且尚未执行的任务
   */
  getNextExecutableTasks(): Task[] {
    const zeroInDegreeNodes = this.graph.getZeroInDegreeNodes();
    const executableTasks: Task[] = [];

    for (const nodeId of zeroInDegreeNodes) {
      if (!this.completedTasks.has(nodeId) && !this.failedTasks.has(nodeId)) {
        const task = this.taskMap.get(nodeId);
        if (task && task.status === TaskStatus.PENDING) {
          executableTasks.push(task);
        }
      }
    }

    logger.debug(`Found ${executableTasks.length} executable tasks`);
    return executableTasks;
  }

  /**
   * 标记任务完成
   */
  markCompleted(taskId: string): void {
    logger.info(`Marking task ${taskId} as completed`);
    this.completedTasks.add(taskId);

    const task = this.taskMap.get(taskId);
    if (task) {
      task.status = TaskStatus.COMPLETED;
      task.updatedAt = new Date();
    }

    // 从图中移除已完成的节点，更新后继节点的入度
    this.graph.removeNode(taskId);
  }

  /**
   * 标记任务失败
   */
  markFailed(taskId: string): void {
    logger.warn(`Marking task ${taskId} as failed`);
    this.failedTasks.add(taskId);

    const task = this.taskMap.get(taskId);
    if (task) {
      task.status = TaskStatus.FAILED;
      task.updatedAt = new Date();
    }
  }

  /**
   * 标记任务正在执行
   */
  markExecuting(taskId: string): void {
    const task = this.taskMap.get(taskId);
    if (task) {
      task.status = TaskStatus.EXECUTING;
      task.updatedAt = new Date();
    }
  }

  /**
   * 标记任务重试中
   */
  markRetrying(taskId: string): void {
    logger.info(`Marking task ${taskId} as retrying`);
    this.failedTasks.delete(taskId);

    const task = this.taskMap.get(taskId);
    if (task) {
      task.status = TaskStatus.RETRYING;
      task.updatedAt = new Date();
    }
  }

  /**
   * 获取任务状态
   */
  getTaskStatus(taskId: string): TaskStatus | undefined {
    return this.taskMap.get(taskId)?.status;
  }

  /**
   * 获取已完成的任务数量
   */
  getCompletedCount(): number {
    return this.completedTasks.size;
  }

  /**
   * 获取失败的任务数量
   */
  getFailedCount(): number {
    return this.failedTasks.size;
  }

  /**
   * 获取总任务数量
   */
  getTotalCount(): number {
    return this.taskMap.size;
  }

  /**
   * 检查是否所有任务都已完成
   */
  isAllCompleted(): boolean {
    return this.completedTasks.size === this.taskMap.size;
  }

  /**
   * 获取任务
   */
  getTask(taskId: string): Task | undefined {
    return this.taskMap.get(taskId);
  }

  /**
   * 获取所有任务
   */
  getAllTasks(): Task[] {
    return Array.from(this.taskMap.values());
  }

  /**
   * 重置调度器
   */
  reset(): void {
    logger.info('Resetting task scheduler');
    this.graph.reset();
    this.completedTasks.clear();
    this.failedTasks.clear();
    this.taskMap.clear();
  }
}
