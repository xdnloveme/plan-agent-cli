/**
 * Task function type
 */
type TaskFunction<T> = () => Promise<T>;

/**
 * Queued task with metadata
 */
interface QueuedTask<T> {
  id: string;
  fn: TaskFunction<T>;
  priority: number;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  timeout?: number;
  createdAt: Date;
}

/**
 * Task result
 */
interface TaskResult<T> {
  id: string;
  success: boolean;
  result?: T;
  error?: Error;
  duration: number;
}

/**
 * Task queue options
 */
interface TaskQueueOptions {
  /** Maximum concurrent tasks */
  maxConcurrent?: number;
  /** Default timeout in ms */
  defaultTimeout?: number;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Concurrent task queue with priority support
 *
 * Manages parallel execution of tasks with configurable concurrency,
 * priority ordering, and timeout handling.
 */
export class TaskQueue {
  private queue: QueuedTask<unknown>[] = [];
  private running = 0;
  private maxConcurrent: number;
  private defaultTimeout: number;
  private debug: boolean;
  private taskCounter = 0;
  private isPaused = false;

  constructor(options: TaskQueueOptions = {}) {
    this.maxConcurrent = options.maxConcurrent ?? 3;
    this.defaultTimeout = options.defaultTimeout ?? 30000;
    this.debug = options.debug ?? false;
  }

  /**
   * Add a task to the queue
   */
  add<T>(
    fn: TaskFunction<T>,
    options: { priority?: number; timeout?: number; id?: string } = {}
  ): Promise<T> {
    const {
      priority = 0,
      timeout = this.defaultTimeout,
      id = `task-${++this.taskCounter}`,
    } = options;

    return new Promise<T>((resolve, reject) => {
      const task: QueuedTask<T> = {
        id,
        fn,
        priority,
        resolve: resolve as (value: unknown) => void,
        reject,
        timeout,
        createdAt: new Date(),
      };

      // Insert by priority (higher priority first)
      const insertIndex = this.queue.findIndex((t) => t.priority < priority);
      if (insertIndex === -1) {
        this.queue.push(task as QueuedTask<unknown>);
      } else {
        this.queue.splice(insertIndex, 0, task as QueuedTask<unknown>);
      }

      this.log(`Task ${id} added (priority: ${priority}, queue size: ${this.queue.length})`);
      this.processNext();
    });
  }

  /**
   * Add multiple tasks and wait for all to complete
   */
  async addAll<T>(
    tasks: Array<{ fn: TaskFunction<T>; priority?: number; timeout?: number; id?: string }>
  ): Promise<TaskResult<T>[]> {
    const promises = tasks.map((task) =>
      this.add(task.fn, {
        priority: task.priority,
        timeout: task.timeout,
        id: task.id,
      })
        .then((result) => ({
          id: task.id ?? 'unknown',
          success: true as const,
          result,
          duration: 0,
        }))
        .catch((error) => ({
          id: task.id ?? 'unknown',
          success: false as const,
          error: error as Error,
          duration: 0,
        }))
    );

    return Promise.all(promises);
  }

  /**
   * Process next task in queue
   */
  private async processNext(): Promise<void> {
    if (this.isPaused || this.running >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    const task = this.queue.shift();
    if (!task) return;

    this.running++;
    const startTime = Date.now();
    this.log(`Task ${task.id} started (running: ${this.running})`);

    try {
      const result = await this.executeWithTimeout(task);
      const duration = Date.now() - startTime;
      this.log(`Task ${task.id} completed in ${duration}ms`);
      task.resolve(result);
    } catch (error) {
      const duration = Date.now() - startTime;
      this.log(`Task ${task.id} failed after ${duration}ms: ${error}`);
      task.reject(error instanceof Error ? error : new Error(String(error)));
    } finally {
      this.running--;
      this.processNext();
    }
  }

  /**
   * Execute task with timeout
   */
  private executeWithTimeout<T>(task: QueuedTask<T>): Promise<T> {
    if (!task.timeout) {
      return task.fn();
    }

    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Task ${task.id} timed out after ${task.timeout}ms`));
      }, task.timeout);

      task
        .fn()
        .then((result) => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  /**
   * Pause queue processing
   */
  pause(): void {
    this.isPaused = true;
    this.log('Queue paused');
  }

  /**
   * Resume queue processing
   */
  resume(): void {
    this.isPaused = false;
    this.log('Queue resumed');
    // Start processing any waiting tasks
    for (let i = 0; i < this.maxConcurrent; i++) {
      this.processNext();
    }
  }

  /**
   * Clear all pending tasks
   */
  clear(): void {
    const cleared = this.queue.length;
    this.queue.forEach((task) => {
      task.reject(new Error('Task queue cleared'));
    });
    this.queue = [];
    this.log(`Queue cleared (${cleared} tasks removed)`);
  }

  /**
   * Get current queue status
   */
  getStatus(): {
    pending: number;
    running: number;
    maxConcurrent: number;
    isPaused: boolean;
  } {
    return {
      pending: this.queue.length,
      running: this.running,
      maxConcurrent: this.maxConcurrent,
      isPaused: this.isPaused,
    };
  }

  /**
   * Wait for all tasks to complete
   */
  async drain(): Promise<void> {
    while (this.running > 0 || this.queue.length > 0) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  /**
   * Update max concurrent limit
   */
  setMaxConcurrent(max: number): void {
    this.maxConcurrent = max;
    // If we increased the limit, start more tasks
    if (!this.isPaused) {
      for (let i = this.running; i < this.maxConcurrent; i++) {
        this.processNext();
      }
    }
  }

  private log(message: string): void {
    if (this.debug) {
      // eslint-disable-next-line no-console
      console.log(`[TaskQueue] ${message}`);
    }
  }
}
