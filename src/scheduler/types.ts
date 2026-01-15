/**
 * 调度层类型定义
 */

/**
 * DAG 节点接口
 */
export interface DAGNode<T> {
  id: string;
  data: T;
  dependencies: string[];
}

/**
 * 调度结果接口
 */
export interface ScheduleResult<T> {
  /** 执行顺序，二维数组，每层可并行执行 */
  executionOrder: string[][];
  /** 是否存在循环依赖 */
  hasCycle: boolean;
  /** 循环依赖涉及的节点 */
  cycleNodes?: string[];
  /** 所有节点数据映射 */
  nodeMap: Map<string, T>;
}

/**
 * 任务调度器接口
 */
export interface ITaskScheduler<T> {
  /** 添加任务 */
  addTask(node: DAGNode<T>): void;
  /** 批量添加任务 */
  addTasks(nodes: DAGNode<T>[]): void;
  /** 构建图 */
  buildGraph(): void;
  /** 获取执行计划 */
  getExecutionPlan(): ScheduleResult<T>;
  /** 获取下一批可执行任务 */
  getNextExecutableTasks(): T[];
  /** 标记任务完成 */
  markCompleted(taskId: string): void;
  /** 标记任务失败 */
  markFailed(taskId: string): void;
  /** 重置调度器 */
  reset(): void;
}

/**
 * 图边接口
 */
export interface GraphEdge {
  from: string;
  to: string;
}
