import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TaskQueue } from '../../src/utils/task-queue.js';

describe('TaskQueue', () => {
  let queue: TaskQueue;

  beforeEach(() => {
    queue = new TaskQueue({ maxConcurrent: 2, defaultTimeout: 5000 });
  });

  afterEach(() => {
    // Resume if paused, then clear to avoid unhandled rejections
    queue.resume();
    // Use setTimeout to let any pending promises settle
    return new Promise<void>((resolve) => {
      queue.clear();
      setTimeout(resolve, 10);
    });
  });

  describe('basic operations', () => {
    it('should execute a single task', async () => {
      const result = await queue.add(() => Promise.resolve('done'));
      expect(result).toBe('done');
    });

    it('should execute multiple tasks', async () => {
      const results = await Promise.all([
        queue.add(() => Promise.resolve(1)),
        queue.add(() => Promise.resolve(2)),
        queue.add(() => Promise.resolve(3)),
      ]);
      expect(results).toEqual([1, 2, 3]);
    });

    it('should respect concurrency limit', async () => {
      const running: number[] = [];
      const maxConcurrent: number[] = [];

      const createTask = (id: number) => async () => {
        running.push(id);
        maxConcurrent.push(running.length);
        await new Promise((r) => setTimeout(r, 50));
        running.splice(running.indexOf(id), 1);
        return id;
      };

      await Promise.all([
        queue.add(createTask(1)),
        queue.add(createTask(2)),
        queue.add(createTask(3)),
        queue.add(createTask(4)),
      ]);

      expect(Math.max(...maxConcurrent)).toBeLessThanOrEqual(2);
    });
  });

  describe('priority', () => {
    it('should execute higher priority tasks first', async () => {
      const order: number[] = [];

      // Pause queue to setup tasks
      queue.pause();

      const p1 = queue.add(
        async () => {
          order.push(1);
          return 1;
        },
        { priority: 1 }
      );

      const p2 = queue.add(
        async () => {
          order.push(2);
          return 2;
        },
        { priority: 10 }
      );

      const p3 = queue.add(
        async () => {
          order.push(3);
          return 3;
        },
        { priority: 5 }
      );

      queue.resume();
      await Promise.all([p1, p2, p3]);

      // Higher priority should execute first
      expect(order[0]).toBe(2);
      expect(order[1]).toBe(3);
      expect(order[2]).toBe(1);
    });
  });

  describe('timeout', () => {
    it('should timeout long-running tasks', async () => {
      const queue = new TaskQueue({ defaultTimeout: 100 });

      await expect(
        queue.add(async () => {
          await new Promise((r) => setTimeout(r, 500));
          return 'done';
        })
      ).rejects.toThrow('timed out');
    });

    it('should allow custom timeout per task', async () => {
      await expect(
        queue.add(
          async () => {
            await new Promise((r) => setTimeout(r, 200));
            return 'done';
          },
          { timeout: 50 }
        )
      ).rejects.toThrow('timed out');
    });
  });

  describe('pause and resume', () => {
    it('should pause and resume processing', async () => {
      const results: number[] = [];

      queue.pause();

      // Add tasks while paused
      const p1 = queue.add(async () => {
        results.push(1);
        return 1;
      });

      // Small delay to ensure task is queued
      await new Promise((r) => setTimeout(r, 50));
      expect(results).toHaveLength(0);

      // Resume processing
      queue.resume();
      await p1;

      expect(results).toEqual([1]);
    });
  });

  describe('status', () => {
    it('should report correct status', async () => {
      queue.pause();

      queue.add(() => Promise.resolve(1));
      queue.add(() => Promise.resolve(2));

      const status = queue.getStatus();
      expect(status.pending).toBe(2);
      expect(status.running).toBe(0);
      expect(status.isPaused).toBe(true);
      expect(status.maxConcurrent).toBe(2);
    });
  });

  describe('clear', () => {
    it('should clear pending tasks', async () => {
      queue.pause();

      const p1 = queue.add(() => Promise.resolve(1));
      const p2 = queue.add(() => Promise.resolve(2));

      queue.clear();

      await expect(p1).rejects.toThrow('cleared');
      await expect(p2).rejects.toThrow('cleared');
    });
  });

  describe('drain', () => {
    it('should wait for all tasks to complete', async () => {
      let completed = 0;

      queue.add(async () => {
        await new Promise((r) => setTimeout(r, 50));
        completed++;
      });

      queue.add(async () => {
        await new Promise((r) => setTimeout(r, 50));
        completed++;
      });

      await queue.drain();
      expect(completed).toBe(2);
    });
  });
});
